import { NextResponse } from 'next/server';

const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function GET() {
  try {
    const res = await fetch(`${ENGINE_URL}/paper-trades`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    
    if (!res.ok) {
      return NextResponse.json({ success: true, data: [] });
    }

    const data = await res.json();
    
    // FastAPI returns an array directly: [{...}, {...}]
    if (Array.isArray(data)) {
      return NextResponse.json({ success: true, data });
    }
    
    // Fallback
    return NextResponse.json({ success: true, data: [] });
  } catch (error: any) {
    // Return empty array instead of error to prevent frontend crash
    return NextResponse.json({ success: true, data: [] });
  }
}
