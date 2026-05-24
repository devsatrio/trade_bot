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

    // 2. Call Engine to perform database updates and notifications (the L1 execution is already handled by /api/trade in the frontend)

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
