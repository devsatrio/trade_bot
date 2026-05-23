import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch(`${process.env.ENGINE_URL || 'http://engine:8000'}/trades`, {
      cache: 'no-store'
    });
    
    if (!res.ok) throw new Error('Failed to fetch trades from engine');
    
    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
