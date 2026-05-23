import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const res = await fetch(`${process.env.ENGINE_URL || 'http://engine:8000'}/clear-logs`, {
      method: 'POST'
    });
    
    if (!res.ok) throw new Error('Failed to clear logs from engine');
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
