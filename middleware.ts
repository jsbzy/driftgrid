import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const PUBLIC_PATHS = ['/_next', '/favicon.ico', '/login', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // No password configured → pass through (local dev)
  const password = process.env.DRIFT_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Validate auth cookie against expected hash
  const cookie = request.cookies.get('drift-auth')?.value;
  const expected = createHash('sha256').update(password).digest('hex');
  if (cookie === expected) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
