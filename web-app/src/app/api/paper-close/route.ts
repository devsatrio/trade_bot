import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toHex } from 'viem';
const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trade_id, close_price } = body;

    if (!trade_id) {
      return NextResponse.json({ success: false, detail: "trade_id is required" }, { status: 400 });
    }

    // 1. Fetch trade from FastAPI Engine
    let trade: any = null;
    try {
      const tradeRes = await fetch(`${ENGINE_URL}/trades/${trade_id}`);
      if (tradeRes.ok) {
        trade = await tradeRes.json();
      }
    } catch (e: any) {
      console.error("[Close API] Gagal fetch trade dari engine:", e.message);
    }

    if (!trade) {
      return NextResponse.json({ success: false, detail: "Trade tidak ditemukan" }, { status: 404 });
    }

    // If it's a live trade, execute the close order on Hyperliquid
    if (trade.mode === "live" && trade.status === "OPEN") {
      console.log(`[Close API] Detected Live Trade close request for trade ID ${trade_id}`);

      // Read settings from FastAPI Engine to get network
      let settings: any = {};
      try {
        const settingsRes = await fetch(`${ENGINE_URL}/settings`);
        if (settingsRes.ok) {
          settings = await settingsRes.json();
        }
      } catch (e: any) {
        console.error("[Close API] Gagal fetch settings dari engine:", e.message);
      }

      const network = settings.network || "testnet";
      const isTestnet = network === "mainnet" ? false : true;
      const apiUrl = isTestnet 
        ? 'https://api.hyperliquid-testnet.xyz/exchange' 
        : 'https://api.hyperliquid.xyz/exchange';

      const envSecret = isTestnet ? process.env.TESTNET_AGENT_SECRET : process.env.MAINNET_AGENT_SECRET;
      
      if (!envSecret || envSecret.length !== 66) {
        return NextResponse.json({ 
          success: false, 
          detail: `AGENT_SECRET untuk ${network} tidak ditemukan di .env. Gagal menutup secara live.` 
        }, { status: 400 });
      }

      const privateKeyHex = envSecret as `0x${string}`;
      const account = privateKeyToAccount(privateKeyHex);

      // Construct closing order: opposite side
      // if entry side is LONG, then close side is SHORT (b = false)
      // if entry side is SHORT, then close side is LONG (b = true)
      const isLongClose = trade.side === "SHORT"; // opposite of entry side

      const action = {
        type: "order",
        orders: [{
          a: 0, 
          b: isLongClose, 
          p: String(close_price),
          s: String(trade.size),
          r: false,
          t: { limit: { tif: "Gtc" } }
        }],
        grouping: "na"
      };

      const nonce = Date.now();
      const actionHash = keccak256(toHex(JSON.stringify(action)));

      // EIP-712 signing
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

      console.log(`[Close API] Mengirim Payload Close ke Hyperliquid:`, JSON.stringify(payload));
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const rawResText = await res.text();
      console.log("[Close API] Respon Close Hyperliquid Raw:", rawResText);
      let responseData: any = {};
      try {
        responseData = JSON.parse(rawResText);
      } catch (pe) {
        return NextResponse.json({
          success: false,
          detail: `Gagal parse respon Hyperliquid: ${rawResText || 'Empty response'}`
        }, { status: 500 });
      }

      if (responseData.status === "err") {
        return NextResponse.json({
          success: false,
          detail: `Gagal close di Hyperliquid: ${responseData.response}`
        }, { status: 400 });
      }
    }

    // Call Engine to perform database updates and notifications
    console.log(`[Close API] Calling Engine paper-close: ${ENGINE_URL}/paper-close with body`, JSON.stringify(body));
    const engineRes = await fetch(`${ENGINE_URL}/paper-close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const engineRawText = await engineRes.text();
    console.log(`[Close API] Engine Response Status: ${engineRes.status} ${engineRes.statusText}, Body: "${engineRawText}"`);
    
    if (!engineRes.ok) {
      let errDetail = 'Failed in engine close';
      try {
        const errJson = JSON.parse(engineRawText);
        errDetail = errJson.detail || errDetail;
      } catch (pe) {}
      return NextResponse.json({ success: false, detail: errDetail }, { status: engineRes.status });
    }
    
    const data = JSON.parse(engineRawText);
    return NextResponse.json({ success: true, ...data });

  } catch (error: any) {
    console.error("[Close API] Error:", error.message);
    return NextResponse.json({ success: false, detail: error.message }, { status: 500 });
  }
}
