'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

/**
 * /connect — Auth popup for local→cloud linking.
 *
 * Opened as a popup window from the local DriftGrid SharePanel.
 * After the user authenticates (existing session or login), this page
 * sends the Supabase session tokens back to the opener via postMessage
 * and auto-closes.
 *
 * Query params:
 *   origin — the localhost URL of the opener (e.g. http://localhost:3000)
 */

function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function ConnectFlow() {
  const searchParams = useSearchParams();
  const openerOrigin = searchParams.get('origin') || '*';
  const signOutRequested = searchParams.get('signout') === '1';

  const [state, setState] = useState<'checking' | 'login' | 'connected' | 'error'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    if (signOutRequested) {
      doSignOut();
    } else {
      checkExistingSession();
    }
  }, [signOutRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Clear the cloud Supabase session, then close the popup. Keep the UI in
   *  the 'checking' state so the user sees a neutral spinner, not a green
   *  "Connected" check, during the brief sign-out window. */
  async function doSignOut() {
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
    } catch { /* ignore — opener has already cleared local creds */ }
    try { window.close(); } catch { /* popup can't close itself on some browsers */ }
  }

  async function checkExistingSession() {
    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      sendTokensAndClose(session.access_token, session.refresh_token || '', session.user.email || '');
    } else {
      setState('login');
    }
  }

  function sendTokensAndClose(accessToken: string, refreshToken: string, userEmail: string) {
    setState('connected');

    // Send credentials back to the opener window
    if (window.opener) {
      window.opener.postMessage({
        type: 'driftgrid-cloud-auth',
        accessToken,
        refreshToken,
        email: userEmail,
      }, openerOrigin);
    }

    // Auto-close after a brief delay so user sees the success state
    setTimeout(() => {
      window.close();
    }, 1500);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    const supabase = getSupabaseBrowser();

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setError('');
        setInfo('Account created — check your inbox to confirm, then sign in.');
        setMode('login');
        setLoading(false);
        return;
      }
      if (data.session) {
        sendTokensAndClose(data.session.access_token, data.session.refresh_token || '', email);
      }
    } else {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        sendTokensAndClose(data.session.access_token, data.session.refresh_token || '', email);
      }
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setError('');
    setInfo('');
    setLoading(true);
    const supabase = getSupabaseBrowser();

    // For popup OAuth, we redirect within this popup window.
    // After OAuth completes, Supabase redirects back to /connect which re-runs checkExistingSession.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(`/connect?origin=${encodeURIComponent(openerOrigin)}`)}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  const mono = 'var(--font-mono, "JetBrains Mono", monospace)';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fafafa',
      fontFamily: mono,
    }}>
      {/* CHECKING STATE */}
      {state === 'checking' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Connecting...
          </div>
        </div>
      )}

      {/* CONNECTED STATE */}
      {state === 'connected' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#22c55e', marginBottom: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Connected</span>
          </div>
          <p style={{ fontSize: 11, color: '#999', margin: 0 }}>
            This window will close automatically.
          </p>
        </div>
      )}

      {/* LOGIN STATE */}
      {state === 'login' && (
        <form onSubmit={handleEmailSubmit} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#999' }}>
            DriftGrid Cloud
          </div>
          <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.5 }}>
            Sign in to share your project with clients.
          </p>

          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email"
            autoFocus
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: `1px solid ${error ? '#e55' : '#ddd'}`,
              outline: 'none',
              padding: '8px 0',
              fontSize: 13,
              fontFamily: mono,
              color: '#111',
            }}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: `1px solid ${error ? '#e55' : '#ddd'}`,
              outline: 'none',
              padding: '8px 0',
              fontSize: 13,
              fontFamily: mono,
              color: '#111',
            }}
          />

          {error && (
            <p style={{ fontSize: 11, color: '#e55', margin: 0 }}>{error}</p>
          )}
          {info && (
            <p style={{ fontSize: 11, color: '#22c55e', margin: 0 }}>{info}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#888',
                cursor: 'pointer',
                fontFamily: mono,
                opacity: loading || !email || !password ? 0.3 : 1,
              }}
            >
              {loading ? '...' : mode === 'login' ? 'log in' : 'sign up'}
            </button>
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#bbb',
                cursor: 'pointer',
                fontFamily: mono,
              }}
            >
              {mode === 'login' ? 'create account' : 'back to login'}
            </button>
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid #eee' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ccc', marginBottom: 8 }}>
              or continue with
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                disabled={loading}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#888',
                  cursor: 'pointer',
                  fontFamily: mono,
                  opacity: loading ? 0.3 : 1,
                }}
              >
                google
              </button>
              <button
                type="button"
                onClick={() => handleOAuth('github')}
                disabled={loading}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#888',
                  cursor: 'pointer',
                  fontFamily: mono,
                  opacity: loading ? 0.3 : 1,
                }}
              >
                github
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ERROR STATE */}
      {state === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#e55', margin: '0 0 8px' }}>Connection failed</p>
          <button
            onClick={() => setState('login')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: '#888',
              cursor: 'pointer',
              fontFamily: mono,
              textDecoration: 'underline',
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#fafafa' }} />}>
      <ConnectFlow />
    </Suspense>
  );
}
