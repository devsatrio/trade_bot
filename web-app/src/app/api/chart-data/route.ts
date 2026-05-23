import { NextResponse } from 'next/server';
import { wsManager } from '@/lib/ws';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    success: true, 
    data: wsManager.priceHistory 
  });
}
