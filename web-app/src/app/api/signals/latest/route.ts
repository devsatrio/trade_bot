import { NextResponse } from 'next/server';

const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_URL}/signals/latest`);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: 'No signals found' });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Signals API] Gagal fetch latest signal:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
