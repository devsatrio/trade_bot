import { NextResponse } from 'next/server';

const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userAddress, network } = body;

    if (!userAddress) {
      return NextResponse.json({ success: false, error: "Wallet address required" }, { status: 400 });
    }

    // 1. Fetch live trades from FastAPI Engine
    let openLiveTrades: any[] = [];
    try {
      const tradesRes = await fetch(`${ENGINE_URL}/trades`);
      if (tradesRes.ok) {
        const allTrades = await tradesRes.json();
        openLiveTrades = (allTrades || []).filter((t: any) => t.status === 'OPEN' && t.mode === 'live');
      }
    } catch (e: any) {
      console.error("[LiveTrades API] Gagal fetch trades dari engine:", e.message);
    }

    // 2. Fetch completed fills from Hyperliquid API
    const isTestnet = network === "mainnet" ? false : true;
    const apiUrl = isTestnet 
      ? 'https://api.hyperliquid-testnet.xyz/info' 
      : 'https://api.hyperliquid.xyz/info';

    let closedTrades: any[] = [];
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "userFills", user: userAddress })
      });

      if (res.ok) {
        const data = await res.json();
        closedTrades = (data || []).map((fill: any) => ({
          id: fill.hash,
          symbol: fill.coin.includes("/USD") ? fill.coin : fill.coin + "/USD", // Normalise to symbol/USD format
          side: fill.side === "B" ? "LONG" : "SHORT",
          price: fill.px,
          size: fill.sz,
          timestamp: new Date(fill.time).toISOString(),
          status: "CLOSED",
          pnl: fill.pnl,
          fee: parseFloat(fill.fee || "0"),
          leverage: 1 // fallback
        }));
      }
    } catch (e: any) {
      console.error("[LiveTrades API] Gagal mengambil userFills dari HL:", e.message);
    }

    // Merge both: Open positions first, then closed logs
    const allTrades = [...openLiveTrades, ...closedTrades];

    return NextResponse.json({ success: true, data: allTrades });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
