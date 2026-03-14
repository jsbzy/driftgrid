import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const expected = process.env.DRIFT_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const hash = createHash('sha256').update(password).digest('hex');
  const response = NextResponse.json({ ok: true });
  response.cookies.set('drift-auth', hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  return response;
}
