import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const res = await fetch(`${process.env.ENGINE_URL || 'http://engine:8000'}/test-telegram`, {
      method: 'POST',
      cache: 'no-store'
    });
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
