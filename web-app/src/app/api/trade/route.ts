import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toHex } from 'viem';
const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

// Hyperliquid asset index map (top perpetuals, verified from HL meta)
const HL_ASSET_INDEX: Record<string, number> = {
  BTC: 0, ETH: 1, ATOM: 2, LINK: 3, ARB: 4, BNB: 5, SOL: 6,
  AVAX: 7, MATIC: 8, ADA: 9, DOGE: 10, OP: 11, APT: 12, SUI: 13,
  TRX: 14, XRP: 15, LTC: 16, BCH: 17, FIL: 18, UNI: 19,
};

async function getCoinAssetIndex(coin: string): Promise<number> {
  const upper = coin.toUpperCase();
  if (HL_ASSET_INDEX[upper] !== undefined) return HL_ASSET_INDEX[upper];
  // Fallback: fetch from Hyperliquid meta
  try {
    const isTestnet = process.env.IS_TESTNET === 'true';
    const apiUrl = isTestnet ? 'https://api.hyperliquid-testnet.xyz/info' : 'https://api.hyperliquid.xyz/info';
    const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'meta' }) });
    const meta = await res.json();
    const idx = meta?.universe?.findIndex((u: any) => u.name === upper);
    if (idx !== undefined && idx >= 0) return idx;
  } catch (_) {}
  return 0; // Default to BTC
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { side, size, price, network, reduceOnly } = body;

    const isTestnet = network === "mainnet" ? false : true;
    const apiUrl = isTestnet 
      ? 'https://api.hyperliquid-testnet.xyz/exchange' 
      : 'https://api.hyperliquid.xyz/exchange';

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
    try {
      const settingsRes = await fetch(`${process.env.ENGINE_URL || 'http://engine:8000'}/settings`);
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        leverage = parseInt(settingsData.leverage || "1", 10);
        if (settingsData.active_coin) activeCoin = settingsData.active_coin.toUpperCase();
      }
    } catch (e: any) {
      console.error("[Trade API] Gagal mengambil leverage dari settings, default ke 1:", e.message);
    }

    const assetIndex = await getCoinAssetIndex(activeCoin);
    console.log(`[Trade API] Coin: ${activeCoin}, Asset Index: ${assetIndex}`);

    // UPDATE LEVERAGE ON HYPERLIQUID
    try {
      const leverageAction = {
        type: "updateLeverage",
        asset: assetIndex,
        isCross: true,
        leverage: leverage
      };

      const leverageNonce = Date.now();
      const leverageActionHash = keccak256(toHex(JSON.stringify(leverageAction)));

      const leverageSigHex = await account.signTypedData({
        domain: { name: "Exchange", version: "1", chainId: 1337 }, 
        types: {
          Agent: [
            { name: "source", type: "string" },
            { name: "connectionId", type: "bytes32" }
          ]
        },
        primaryType: "Agent",
        message: {
          source: "hyperliquid",
          connectionId: leverageActionHash
        }
      } as any);

      const [lv, lr, ls] = [
        parseInt(leverageSigHex.slice(130), 16),
        leverageSigHex.slice(0, 66),
        "0x" + leverageSigHex.slice(66, 130)
      ];

      const leveragePayload = {
        action: leverageAction,
        nonce: leverageNonce,
        signature: { r: lr, s: ls, v: lv }
      };

      console.log(`[Trade API] Mengirim Payload Update Leverage (${leverage}x):`, JSON.stringify(leveragePayload));
      const levRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leveragePayload)
      });
      const levData = await levRes.json();
      console.log("[Trade API] Respon Update Leverage:", JSON.stringify(levData));
    } catch (levError: any) {
      console.error("[Trade API] Error mengupdate leverage di Hyperliquid:", levError.message);
    }

    // 2. CONSTRUCT ACTION PAYLOAD
    const action = {
      type: "order",
      orders: [{
        a: assetIndex,
        b: side === 'LONG', 
        p: String(price),
        s: String(size),
        r: reduceOnly ? true : false,
        t: { limit: { tif: "Gtc" } }
      }],
      grouping: "na"
    };

    const nonce = Date.now();
    
    // Hash the action to get a bytes32 connectionId
    const actionHash = keccak256(toHex(JSON.stringify(action)));

    // 3. EIP-712 MANUAL SIGNING VIA VIEM
    const signatureHex = await account.signTypedData({
      domain: { name: "Exchange", version: "1", chainId: 1337 }, 
      types: {
        Agent: [
          { name: "source", type: "string" },
          { name: "connectionId", type: "bytes32" }
        ]
      },
      primaryType: "Agent",
      message: {
        source: "hyperliquid",
        connectionId: actionHash
      }
    } as any);

    const [v, r, s] = [
      parseInt(signatureHex.slice(130), 16),
      signatureHex.slice(0, 66),
      "0x" + signatureHex.slice(66, 130)
    ];

    const payload = {
      action,
      nonce,
      signature: { r, s, v }
    };

    // 4. KIRIM REQUEST KE HYPERLIQUID EXCHANGE
    console.log("[Trade API] Mengirim Payload:", JSON.stringify(payload));
    
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseData = await res.json();
    
    if (responseData.status === "err") {
      return NextResponse.json({
        success: false,
        error: responseData.response,
        network: isTestnet ? "testnet" : "mainnet"
      }, { status: 400 });
    }

    // LOG KE DATABASE LOKAL VIA FASTAPI ENGINE
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
