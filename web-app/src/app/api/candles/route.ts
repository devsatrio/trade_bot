import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coin = searchParams.get('coin') || 'BTC';
  const interval = searchParams.get('interval') || '1m';
  const limit = parseInt(searchParams.get('limit') || '200');

  try {
    // Fetch candles from Hyperliquid
    const isTestnet = process.env.IS_TESTNET === 'true';
    const apiUrl = isTestnet
      ? 'https://api.hyperliquid-testnet.xyz/info'
      : 'https://api.hyperliquid.xyz/info';

    const endTime = Date.now();
    const intervalMs: Record<string, number> = {
      '1m': 60000,
      '3m': 180000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
    };
    const msPerBar = intervalMs[interval] || 60000;
    const startTime = endTime - msPerBar * limit;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin, interval, startTime, endTime }
      }),
      next: { revalidate: 0 }
    });

    if (!res.ok) throw new Error(`Hyperliquid API error: ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data)) {
      return NextResponse.json({ success: false, candles: [], trades: [] });
    }

    const candles = data.map((c: any) => ({
      time: Math.floor(c.t / 1000) as number,
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
    }));

    // Also fetch recent trades for markers
    const engineUrl = process.env.ENGINE_URL || 'http://engine:8000';
    let trades: any[] = [];
    try {
      const trRes = await fetch(`${engineUrl}/trades`);
      if (trRes.ok) {
        const allTrades = await trRes.json();
        // Only show trades within the candle time range
        const startSec = Math.floor(startTime / 1000);
        trades = allTrades
          .filter((t: any) => {
            const ts = Math.floor(new Date(t.timestamp).getTime() / 1000);
            const isMatchCoin = t.symbol.toUpperCase().startsWith(coin.toUpperCase());
            return ts >= startSec && isMatchCoin;
          })
          .map((t: any) => ({
            id: t.id,
            side: t.side,
            status: t.status,
            entryTime: Math.floor(new Date(t.timestamp).getTime() / 1000),
            entryPrice: t.price,
            closeTime: t.closed_at ? Math.floor(new Date(t.closed_at).getTime() / 1000) : null,
            closePrice: t.close_price,
            pnl: t.pnl,
          }));
      }
    } catch (_) {}

    return NextResponse.json({ success: true, candles, trades });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, candles: [], trades: [] });
  }
}
