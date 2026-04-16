'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

/**
 * /reset-password — landing page for the password-recovery magic link.
 *
 * When Supabase sends the reset email, the link points here with a recovery
 * token in the URL fragment (e.g. `#access_token=...&type=recovery`). The
 * Supabase browser client picks up that token automatically on page load and
 * creates a temporary recovery session, which lets us call updateUser() to set
 * a new password.
 *
 * If the user lands here without a valid recovery session (link expired, wrong
 * URL, etc.) we show a clear error instead of silently failing.
 */

function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Wait for the Supabase client to consume the URL fragment and emit a
  // PASSWORD_RECOVERY event. If no event fires within a beat, the link is
  // invalid or expired.
  useEffect(() => {
    if (!supabaseConfigured) return;
    const supabase = getSupabaseBrowser();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    // Fallback: if a session is already present (user refreshed after the
    // event fired), we're good to go.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, [supabaseConfigured]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    // Small delay so the user sees the success state, then redirect home.
    setTimeout(() => router.push('/'), 1500);
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

        {done ? (
          <p className="text-xs" style={{ color: '#22c55e', fontFamily: 'var(--font-mono, monospace)' }}>
            Password updated. Redirecting&hellip;
          </p>
        ) : !ready ? (
          <div className="space-y-3" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              Verifying reset link&hellip;
            </p>
            <p className="text-[10px]" style={{ color: 'var(--muted)', opacity: 0.6, lineHeight: 1.5 }}>
              If this takes more than a few seconds, your link may have expired.
              <br />
              <Link href="/forgot-password" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>
                Request a new link
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.6, fontFamily: 'var(--font-mono, monospace)' }}>
              Choose a new password.
            </p>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="new password"
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
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="confirm password"
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
                disabled={loading || !password || !confirm}
                className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
                style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
              >
                {loading ? '...' : 'update password'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
