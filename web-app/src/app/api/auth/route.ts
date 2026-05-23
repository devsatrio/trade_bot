import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.DASHBOARD_PASSWORD;

    if (!correctPassword) {
      return NextResponse.json({ success: false, error: 'DASHBOARD_PASSWORD is not set in .env' }, { status: 500 });
    }

    if (password === correctPassword) {
      const cookieStore = await cookies();
      cookieStore.set('hyperbot_auth', password, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 6 // Berlaku 6 jam
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Password salah!' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
