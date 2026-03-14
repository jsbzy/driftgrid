import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/_next', '/favicon.ico', '/login', '/api/auth'];

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(request: NextRequest) {
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
  const expected = await sha256(password);
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
