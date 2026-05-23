import { NextResponse } from 'next/server';

const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const res = await fetch(`${ENGINE_URL}/paper-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    // FastAPI returns { status, message, new_balance } on success
    // or { detail: "..." } on error
    if (!res.ok) {
      return NextResponse.json({ success: false, detail: data.detail || 'Unknown error' }, { status: res.status });
    }
    
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ success: false, detail: error.message }, { status: 500 });
  }
}
