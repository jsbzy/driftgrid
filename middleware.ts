import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * DriftGrid middleware — v1 simplified auth model:
 *
 *   • Local dev (localhost) → no auth required. Ever. Users work offline, free tier.
 *   • Production             → Supabase Auth required for protected routes.
 *   • Public paths           → always accessible (share links, client reviews, API endpoints that need it).
 *
 * Dead-simple flow: local = free-tier-by-default, production = cloud-gated.
 * No more DRIFT_PASSWORD dual-mode confusion.
 */

const PUBLIC_PATHS = [
  '/_next',
  '/favicon.ico',
  '/login',
  '/pricing',       // pricing page — visible before sign-in
  '/api/auth',      // Supabase OAuth callback (/api/auth/callback)
  '/api/stripe',    // Stripe webhook + checkout (routes do their own auth)
  '/api/share',     // share link creation uses its own auth
  '/api/s/',        // public share link endpoints
  '/s/',            // v1 share link pages
  '/review/',       // legacy client-review pages (live client URLs depend on this)
  '/api/manifest/', // public manifest reads for shared projects
  '/api/html/',     // public HTML file reads for shared projects
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

function isLocalDev(request: NextRequest): boolean {
  const host = request.nextUrl.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths (share links, login, static assets, etc.)
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Local dev always bypasses auth — free tier runs fully offline.
  if (isLocalDev(request)) {
    return NextResponse.next();
  }

  // Supabase email confirmation sends ?code= to the Site URL (root).
  // Redirect to the auth callback to exchange the code for a session.
  const code = request.nextUrl.searchParams.get('code');
  if (code && !pathname.startsWith('/api/auth')) {
    const callbackUrl = new URL('/api/auth/callback', request.url);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('next', '/');
    return NextResponse.redirect(callbackUrl);
  }

  // Root landing page — always allow (the page component decides whether to
  // show the public landing or the authed dashboard).
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Production — require Supabase Auth for everything else.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase not configured in a non-local environment — fail closed.
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'auth_not_configured');
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
