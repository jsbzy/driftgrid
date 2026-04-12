'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

/**
 * DriftGrid v1 login page.
 *
 *   Local dev: no auth required — users never see this page. Middleware
 *   bypasses auth on localhost, so the only way to land here is explicit
 *   navigation.
 *
 *   Production: Supabase Auth (email/password + OAuth via Google/GitHub).
 *   Landing on /login from a protected route passes `?next=` so we can bounce
 *   the user back after sign-in.
 */

function getSupabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const urlError = searchParams.get('error');

  useEffect(() => {
    if (urlError === 'auth_not_configured') {
      setError('Supabase is not configured on this deployment.');
    }
  }, [urlError]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // Try an immediate sign-in after signup (works when email confirmation is disabled).
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setError('Account created — check your inbox to confirm, then sign in.');
        setMode('login');
        setLoading(false);
        return;
      }
    } else {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }
    }

    router.push(next);
    router.refresh();
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setError('');
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <form onSubmit={handleEmailSubmit} className="w-full max-w-xs space-y-5">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          DriftGrid
        </div>

        {!supabaseConfigured && (
          <p className="text-xs" style={{ color: '#e55', fontFamily: 'var(--font-mono, monospace)' }}>
            Supabase is not configured in this environment.
          </p>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          autoFocus
          disabled={!supabaseConfigured}
          className="w-full bg-transparent border-b outline-none py-2 text-sm"
          style={{
            borderColor: error ? '#e55' : 'var(--border)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          disabled={!supabaseConfigured}
          className="w-full bg-transparent border-b outline-none py-2 text-sm"
          style={{
            borderColor: error ? '#e55' : 'var(--border)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        />

        {error && (
          <p className="text-xs" style={{ color: '#e55', fontFamily: 'var(--font-mono, monospace)' }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={loading || !email || !password || !supabaseConfigured}
            className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {loading ? '...' : mode === 'login' ? 'log in' : 'sign up'}
          </button>
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            className="text-xs tracking-widest uppercase cursor-pointer"
            style={{ color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)' }}
          >
            {mode === 'login' ? 'create account' : 'back to login'}
          </button>
        </div>

        <div className="pt-4 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)' }}>
            or continue with
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={loading || !supabaseConfigured}
              className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
            >
              google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              disabled={loading || !supabaseConfigured}
              className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
            >
              github
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--background)' }} />}>
      <LoginForm />
    </Suspense>
  );
}
