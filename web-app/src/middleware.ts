import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  
  // Jika password tidak diset di .env, kita tolak semua akses demi keamanan
  if (!password) {
    return NextResponse.json({ error: 'DASHBOARD_PASSWORD is not set in .env' }, { status: 500 });
  }
  
  const path = request.nextUrl.pathname;

  // Bebaskan akses ke halaman login dan API auth
  if (path.startsWith('/login') || path.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Bebaskan akses internal dari ws.ts (mesin latar belakang bot)
  const internalSecret = request.headers.get('x-internal-secret');
  if (internalSecret === password) {
    return NextResponse.next();
  }

  // Cek validitas sesi/cookie dari browser
  const authCookie = request.cookies.get('hyperbot_auth');
  if (authCookie?.value === password) {
    return NextResponse.next();
  }

  // Jika permintaan datang ke API namun tidak punya sesi, tolak dengan 401
  if (path.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Unauthorized Access' }, { status: 401 });
  }

  // Jika permintaan ke halaman UI, redirect ke halaman login
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: [
    // Lindungi semua rute KECUALI file statis Next.js
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
