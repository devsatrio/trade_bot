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
        
        // Group fills by oid (Order ID)
        const groups: { [oid: string]: any[] } = {};
        (data || []).forEach((fill: any) => {
          const hasPnl = parseFloat(fill.closedPnl || "0") !== 0;
          const isClose = (fill.dir && fill.dir.toLowerCase().includes("close")) || hasPnl;
          if (!isClose) return;

          const oid = fill.oid ? fill.oid.toString() : fill.hash;
          if (!groups[oid]) {
            groups[oid] = [];
          }
          groups[oid].push(fill);
        });

        // Map grouped fills to single closed trades
        closedTrades = Object.values(groups).map((fills: any[], index: number) => {
          const firstFill = fills[0];
          const oid = firstFill.oid ? firstFill.oid.toString() : firstFill.hash;
          const coin = firstFill.coin;
          const timestamp = new Date(Math.max(...fills.map(f => f.time))).toISOString();
          
          // Determine position side (if Close Short, original position was SHORT)
          const dirLower = (firstFill.dir || "").toLowerCase();
          const isShort = dirLower.includes("short");
          const side = isShort ? "SHORT" : "LONG";

          let totalSize = 0;
          let totalPnl = 0;
          let totalFee = 0;
          let sumPxSz = 0;

          fills.forEach((fill: any) => {
            const sz = parseFloat(fill.sz || "0");
            const px = parseFloat(fill.px || "0");
            totalSize += sz;
            totalPnl += parseFloat(fill.closedPnl || "0");
            totalFee += parseFloat(fill.fee || "0");
            sumPxSz += px * sz;
          });

          // Calculate average exit price (weighted by size)
          const exitPrice = totalSize > 0 ? (sumPxSz / totalSize) : parseFloat(firstFill.px || "0");

          // Reconstruct original entry price mathematically:
          // For LONG:  PnL = (Exit - Entry) * Size => Entry = Exit - (PnL / Size)
          // For SHORT: PnL = (Entry - Exit) * Size => Entry = Exit + (PnL / Size)
          let entryPrice = exitPrice;
          if (totalSize > 0) {
            if (isShort) {
              entryPrice = exitPrice + (totalPnl / totalSize);
            } else {
              entryPrice = exitPrice - (totalPnl / totalSize);
            }
          }

          return {
            id: `${oid}-${index}`,
            symbol: coin.includes("/USD") ? coin : coin + "/USD", // Normalise to symbol/USD format
            side: side,
            price: entryPrice, // The actual original entry price
            exitPrice: exitPrice, // The actual exit price
            size: totalSize,
            timestamp: timestamp,
            status: "CLOSED",
            pnl: totalPnl,
            fee: totalFee,
            leverage: 1 // fallback
          };
        });

        // Sort closed trades reverse-chronologically by timestamp
        closedTrades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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
