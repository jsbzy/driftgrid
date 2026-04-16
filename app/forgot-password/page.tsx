'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

/**
 * /forgot-password — collects an email and calls Supabase's
 * resetPasswordForEmail(). Supabase sends a magic link to the email; clicking
 * it lands on /reset-password with a recovery session already in place.
 */

function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-5">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          DriftGrid
        </div>

        {!supabaseConfigured && (
          <p className="text-xs" style={{ color: '#e55', fontFamily: 'var(--font-mono, monospace)' }}>
            Supabase is not configured in this environment.
          </p>
        )}

        {sent ? (
          <div className="space-y-3" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            <p className="text-xs" style={{ color: '#22c55e' }}>
              Check your email.
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              If an account exists for {email}, a password reset link is on its way. The link expires in 60 minutes.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.6, fontFamily: 'var(--font-mono, monospace)' }}>
              Enter your email and we&rsquo;ll send you a link to reset your password.
            </p>

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

            {error && (
              <p className="text-xs" style={{ color: '#e55', fontFamily: 'var(--font-mono, monospace)' }}>
                {error}
              </p>
            )}

            <div className="flex items-center justify-between">
              <button
                type="submit"
                disabled={loading || !email || !supabaseConfigured}
                className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
                style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
              >
                {loading ? '...' : 'send reset link'}
              </button>
            </div>
          </>
        )}

        <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <Link
            href="/login"
            className="text-[10px] tracking-widest uppercase"
            style={{ color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)' }}
          >
            ← back to login
          </Link>
        </div>
      </form>
    </div>
  );
}
