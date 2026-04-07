import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = [
  '/_next',
  '/favicon.ico',
  '/login',
  '/signup',
  '/api/auth',
  '/auth/callback',
  '/r/',           // Review links are always public
];

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

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isCloudMode = process.env.DRIFTGRID_MODE === 'cloud';

  // ─── Cloud Mode: Supabase Auth ────────────────────────
  if (isCloudMode) {
    const result = createSupabaseMiddlewareClient(request);
    if (!result) {
      // Supabase not configured but cloud mode set — let through (misconfiguration)
      return NextResponse.next();
    }

    const { supabase, response } = result;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Not authenticated — redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated — refresh session cookies and continue
    return response;
  }

  // ─── Local Mode: Password Auth ────────────────────────
  const password = process.env.DRIFT_PASSWORD;
  if (!password) {
    // No password configured → pass through (local dev)
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
