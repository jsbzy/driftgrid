'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const isCloud = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

function getSupabaseBrowser() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const router = useRouter();

  // --- Cloud mode: Supabase email/password ---
  async function handleCloudSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // Auto-login after signup (email confirmation disabled for launch)
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setError('Account created — please log in.');
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

    router.push('/');
    router.refresh();
  }

  // --- Local mode: DRIFT_PASSWORD ---
  async function handleLocalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError('incorrect password');
      setLoading(false);
    }
  }

  if (isCloud) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <form onSubmit={handleCloudSubmit} className="w-full max-w-xs space-y-4">
          <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            DriftGrid
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            autoFocus
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
              disabled={loading || !email || !password}
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
        </form>
      </div>
    );
  }

  // Local mode — password only
  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleLocalSubmit} className="w-full max-w-xs space-y-4">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          drift
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoFocus
          className="w-full bg-transparent border-b outline-none py-2 text-sm font-mono"
          style={{
            borderColor: error ? '#e55' : 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
        {error && (
          <p className="text-xs" style={{ color: '#e55' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
          style={{ color: 'var(--muted)' }}
        >
          {loading ? '...' : 'enter'}
        </button>
      </form>
    </div>
  );
}
