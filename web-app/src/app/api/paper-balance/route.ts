import { NextResponse } from 'next/server';

const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_URL}/paper-balance`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    
    if (!res.ok) {
      return NextResponse.json({ success: true, balance: 1000.0 });
    }
    
    const data = await res.json();
    // FastAPI returns { balance: 1000.0 }
    return NextResponse.json({ success: true, balance: data.balance ?? 1000.0 });
  } catch (error: any) {
    return NextResponse.json({ success: true, balance: 1000.0 });
  }
}
