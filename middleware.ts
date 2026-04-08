import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/_next', '/favicon.ico', '/login', '/api/auth', '/s/', '/api/share', '/api/s/', '/review/'];

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

  // --- Cloud mode: Supabase auth (skip in local dev) ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isLocalDev = request.nextUrl.hostname === 'localhost' || request.nextUrl.hostname === '127.0.0.1';

  if (supabaseUrl && supabaseAnonKey && !isLocalDev) {
    // Landing page: allow unauthenticated access to root
    if (pathname === '/') {
      // Let the page component decide whether to show landing or dashboard
      return NextResponse.next();
    }

    let response = NextResponse.next({
      request: { headers: request.headers },
    });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  // --- Local mode: DRIFT_PASSWORD ---
  const password = process.env.DRIFT_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('drift-auth')?.value;
  const expected = await sha256(password);
  if (cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
