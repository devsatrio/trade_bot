import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

interface CoinMeta {
  index: number;
  szDecimals: number;
}

async function getCoinMetadata(coin: string, isTestnet: boolean): Promise<CoinMeta> {
  const upper = coin.toUpperCase();
  try {
    const apiUrl = isTestnet ? 'https://api.hyperliquid-testnet.xyz/info' : 'https://api.hyperliquid.xyz/info';
    const res = await fetch(apiUrl, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ type: 'meta' }) 
    });
    const meta = await res.json();
    const idx = meta?.universe?.findIndex((u: any) => u.name === upper);
    if (idx !== undefined && idx >= 0) {
      const szDecimals = meta.universe[idx].szDecimals ?? 5;
      return { index: idx, szDecimals };
    }
  } catch (e: any) {
    console.error("[Trade API] Error fetching coin metadata:", e.message);
  }
  
  // Fallbacks in case of API failure
  if (upper === 'BTC') return { index: 0, szDecimals: 5 };
  if (upper === 'ETH') return { index: 1, szDecimals: 4 };
  return { index: 0, szDecimals: 5 }; // Fallback to BTC
}

function formatPrice(price: number, szDecimals: number): string {
  // Rule 1: Limit to 5 significant figures
  let formatted = Number(price.toPrecision(5));
  
  // Rule 2: Limit decimal places to (6 - szDecimals) for perpetuals
  const maxDecimals = Math.max(0, 6 - szDecimals);
  
  // Get current number of decimal places of the formatted number
  const parts = formatted.toString().split('.');
  if (parts.length > 1 && parts[1].length > maxDecimals) {
    formatted = Number(formatted.toFixed(maxDecimals));
  }
  
  return formatted.toString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { side, size, price, network, reduceOnly } = body;

    const isTestnet = network === "mainnet" ? false : true;

    // Pilih Secret berdasarkan Network
    const envSecret = isTestnet ? process.env.TESTNET_AGENT_SECRET : process.env.MAINNET_AGENT_SECRET;
    
    if (!envSecret || envSecret.length !== 66) {
      return NextResponse.json({ 
        success: false, 
        error: `AGENT_SECRET untuk ${network} tidak ditemukan di .env. Pastikan Anda sudah mengisi Agent Secret di file .env` 
      }, { status: 400 });
    }

    const privateKeyHex = envSecret as `0x${string}`;
    const account = privateKeyToAccount(privateKeyHex);

    // FETCH SETTINGS & VALIDATE POSITION LIMITS FROM FASTAPI ENGINE
    // Skip validation when closing a position (reduceOnly)
    if (!reduceOnly) {
      let checkValidation = { success: true, error: "" };
      try {
        const validateRes = await fetch(`${ENGINE_URL}/trades/validate-new?symbol=${encodeURIComponent(body.symbol || "BTC/USD")}`);
        if (validateRes.ok) {
          const valData = await validateRes.json();
          if (!valData.allowed) {
            checkValidation = { success: false, error: valData.error || "Batas posisi terlampaui." };
          }
        } else {
          checkValidation = { success: false, error: "Gagal memvalidasi limit posisi di engine." };
        }
      } catch (e: any) {
        console.error("[Trade API] Gagal memvalidasi limit posisi:", e.message);
        checkValidation = { success: false, error: "Error jaringan ketika memvalidasi limit posisi." };
      }

      if (!checkValidation.success) {
        return NextResponse.json({ 
          success: false, 
          error: checkValidation.error 
        }, { status: 400 });
      }
    }

    // FETCH SETTINGS TO GET USER CONFIGURED LEVERAGE + ACTIVE COIN
    let leverage = 1;
    let activeCoin = (body.symbol || "BTC/USD").split("/")[0].toUpperCase();
    let mainWalletAddress: `0x${string}` | undefined = undefined;
    
    try {
      const settingsRes = await fetch(`${process.env.ENGINE_URL || 'http://engine:8000'}/settings`);
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        leverage = parseInt(settingsData.leverage || "1", 10);
        // Only overwrite activeCoin if body.symbol was NOT provided
        if (!body.symbol && settingsData.active_coin) {
          activeCoin = settingsData.active_coin.toUpperCase();
        }
        if (settingsData.wallet_address) mainWalletAddress = settingsData.wallet_address as `0x${string}`;
      }
    } catch (e: any) {
      console.error("[Trade API] Gagal mengambil leverage dari settings, default ke 1:", e.message);
    }

    const { index: assetIndex, szDecimals } = await getCoinMetadata(activeCoin, isTestnet);
    console.log(`[Trade API] Coin: ${activeCoin}, Asset Index: ${assetIndex}, Size Decimals: ${szDecimals}, Main Wallet: ${mainWalletAddress}`);

    const transport = new HttpTransport({ isTestnet: isTestnet });
    const exchange = new ExchangeClient({ 
      transport, 
      wallet: account, 
      isTestnet: isTestnet
    });

    // UPDATE LEVERAGE ON HYPERLIQUID
    try {
      console.log(`[Trade API] Mengirim Request Update Leverage (${leverage}x)`);
      const levRes = await exchange.updateLeverage({
        asset: assetIndex,
        isCross: true,
        leverage: leverage
      });
      console.log("[Trade API] Respon Update Leverage:", JSON.stringify(levRes));
      if (levRes.status === "err") {
        console.warn("[Trade API] Leverage update error (non-fatal):", levRes.response);
      }
    } catch (levError: any) {
      console.error("[Trade API] Error mengupdate leverage di Hyperliquid:", levError.message);
    }

    const formattedPrice = formatPrice(parseFloat(String(price)), szDecimals);
    const formattedSize = Number(parseFloat(String(size)).toFixed(szDecimals)).toString();

    let responseData;
    // KIRIM REQUEST ORDER KE HYPERLIQUID EXCHANGE
    try {
      console.log(`[Trade API] Mengirim Order: ${side} ${formattedSize} @ ${formattedPrice}`);
      responseData = await exchange.order({
        orders: [{
          a: assetIndex,
          b: side === 'LONG', 
          p: formattedPrice,
          s: formattedSize,
          r: reduceOnly ? true : false,
          t: { limit: { tif: "Gtc" } }
        }],
        grouping: "na"
      });
      console.log("[Trade API] Response dari HL:", JSON.stringify(responseData));

      if (responseData.status === "err") {
        return NextResponse.json({
          success: false,
          error: typeof responseData.response === 'string' ? responseData.response : JSON.stringify(responseData.response),
          network: isTestnet ? "testnet" : "mainnet"
        }, { status: 400 });
      }
    } catch (orderError: any) {
      console.error("[Trade API] Error saat mengirim order:", orderError.message);
      return NextResponse.json({
        success: false,
        error: orderError.message || "Gagal mengirim order ke Hyperliquid",
        network: isTestnet ? "testnet" : "mainnet"
      }, { status: 400 });
    }

    // LOG KE DATABASE LOKAL VIA FASTAPI ENGINE KECUALI JIKA HANYA MENUTUP POSISI (REDUCE ONLY)
    if (!reduceOnly) {
      try {
        const logRes = await fetch(`${ENGINE_URL}/trades/log-live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: body.symbol || "BTC/USD",
            side: side,
            price: parseFloat(price),
            size: parseFloat(size),
            tx_hash: responseData.response?.data?.statuses?.[0]?.resting?.oid?.toString() || "LIVE_TRADE",
            leverage: leverage
          })
        });
        if (logRes.ok) {
          const logData = await logRes.json();
          console.log("[Trade API] Live trade logged via engine, ID:", logData.trade_id);
        } else {
          const logText = await logRes.text();
          console.error("[Trade API] Engine gagal menyimpan log live trade:", logText);
        }
      } catch(e: any) {
        console.error("[Trade API] Gagal menyimpan log live trade ke database:", e.message);
      }
    }
    
    return NextResponse.json({
      success: true,
      network: isTestnet ? "testnet" : "mainnet",
      address: account.address,
      hyperliquidResponse: responseData
    });

  } catch (error: any) {
    console.error("[Trade API] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
