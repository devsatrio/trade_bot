import { NextResponse } from 'next/server';
import { wsManager } from '@/lib/ws';

export async function GET() {
  return NextResponse.json({ 
    status: wsManager.getStatus(),
    candlesCollected: wsManager.candlesCollected
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'start') {
      wsManager.start();
      return NextResponse.json({ success: true, status: wsManager.getStatus() });
    } else if (action === 'stop') {
      wsManager.stop();
      return NextResponse.json({ success: true, status: wsManager.getStatus() });
    } else if (action === 'setCoin' && body.coin) {
      wsManager.setCoin(body.coin.toUpperCase());
      return NextResponse.json({ success: true, coin: body.coin.toUpperCase(), status: wsManager.getStatus() });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
