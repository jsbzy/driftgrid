'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from './Toast';

const CLOUD_URL = process.env.NEXT_PUBLIC_DRIFTGRID_CLOUD_URL || 'https://driftgrid.ai';
const STORAGE_KEY = 'driftgrid-cloud-auth';

type ShareState = 'closed' | 'checking' | 'auth' | 'syncing' | 'ready' | 'upgrade' | 'error';

interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt: number;
}

interface SharePanelProps {
  open: boolean;
  onClose: () => void;
  client: string;
  project: string;
}

function getStoredCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeCredentials(creds: StoredCredentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

function clearCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

export function SharePanel({ open, onClose, client, project }: SharePanelProps) {
  const [state, setState] = useState<ShareState>('closed');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [email, setEmail] = useState('');
  const [commentsCopied, setCommentsCopied] = useState(false);

  // Listen for postMessage from the connect popup
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type !== 'driftgrid-cloud-auth') return;

    const { accessToken, refreshToken, email: userEmail } = event.data;
    if (!accessToken) return;

    // Store credentials
    storeCredentials({
      accessToken,
      refreshToken: refreshToken || '',
      email: userEmail || '',
      // Supabase JWTs default to 1hr expiry
      expiresAt: Date.now() + 3600 * 1000,
    });

    setEmail(userEmail || '');

    // Start syncing immediately
    pushAndShare(accessToken, refreshToken || '');
  }, [client, project]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (!open) {
      setState('closed');
      return;
    }
    checkCredentials();
  }, [open]);

  async function checkCredentials() {
    setState('checking');
    const creds = getStoredCredentials();

    if (!creds?.accessToken) {
      setState('auth');
      return;
    }

    setEmail(creds.email);

    // Check if token is likely expired (with 5min buffer)
    if (creds.expiresAt && Date.now() > creds.expiresAt - 300000) {
      // Token might be expired — try pushing anyway, the orchestrator handles refresh
      pushAndShare(creds.accessToken, creds.refreshToken);
      return;
    }

    // Token looks valid — push
    pushAndShare(creds.accessToken, creds.refreshToken);
  }

  async function pushAndShare(accessToken: string, refreshToken: string) {
    setState('syncing');
    setProgress('Preparing files...');

    try {
      const res = await fetch('/api/cloud/push-and-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, accessToken, refreshToken }),
      });

      const data = await res.json();

      // Token expired and couldn't be refreshed
      if (data.needsAuth) {
        clearCredentials();
        setState('auth');
        return;
      }

      // Free tier limit
      if (data.error === 'free_limit') {
        setState('upgrade');
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to share');
        setState('error');
        return;
      }

      // Update stored tokens if they were refreshed
      if (data.newAccessToken) {
        const creds = getStoredCredentials();
        storeCredentials({
          accessToken: data.newAccessToken,
          refreshToken: data.newRefreshToken || refreshToken,
          email: creds?.email || email,
          expiresAt: Date.now() + 3600 * 1000,
        });
      }

      setShareUrl(data.shareUrl);
      setProgress(`${data.filesUploaded} files synced`);
      setState('ready');
    } catch (err) {
      setErrorMsg('Could not reach DriftGrid Cloud. Check your connection.');
      setState('error');
    }
  }

  function openConnectPopup() {
    const origin = encodeURIComponent(window.location.origin);
    const w = 420;
    const h = 520;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    window.open(
      `${CLOUD_URL}/connect?origin=${origin}`,
      'driftgrid-connect',
      `width=${w},height=${h},left=${left},top=${top},popup=yes`,
    );
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast('Share link copied');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyComments() {
    if (!shareUrl) return;
    try {
      const token = shareUrl.split('/s/')[1];
      if (!token) return;

      const creds = getStoredCredentials();
      const res = await fetch(`${CLOUD_URL}/api/cloud/comments?token=${encodeURIComponent(token)}`, {
        headers: creds?.accessToken ? { 'Authorization': `Bearer ${creds.accessToken}` } : {},
      });

      if (!res.ok) {
        toast('No comments yet');
        return;
      }

      const data = await res.json();
      if (!data.text || data.count === 0) {
        toast('No comments yet');
        return;
      }

      await navigator.clipboard.writeText(data.text);
      setCommentsCopied(true);
      toast(`${data.count} comment${data.count === 1 ? '' : 's'} copied`);
      setTimeout(() => setCommentsCopied(false), 2000);
    } catch {
      toast('Failed to fetch comments');
    }
  }

  function handleSignOut() {
    clearCredentials();
    setShareUrl(null);
    setEmail('');
    setState('auth');
  }

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    background: '#fff',
    borderLeft: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
    zIndex: 50,
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideIn 200ms ease-out',
  };

  const headerStyle: React.CSSProperties = {
    padding: '24px 28px 16px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const bodyStyle: React.CSSProperties = {
    padding: '28px',
    flex: 1,
    overflow: 'auto',
  };

  const headerText = state === 'auth' ? 'Share with clients'
    : state === 'upgrade' ? 'Upgrade to share'
    : state === 'error' ? 'Share error'
    : 'Share link';

  return (
    <>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.2)',
          zIndex: 49,
        }}
      />

      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111', letterSpacing: '0.02em' }}>
            {headerText}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div style={bodyStyle}>
          {/* CHECKING STATE */}
          {state === 'checking' && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.2s infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.4s infinite' }} />
              </div>
            </div>
          )}

          {/* AUTH STATE */}
          {state === 'auth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                Sign in to DriftGrid Cloud to share your project with clients.
              </p>

              <button
                onClick={openConnectPopup}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 0',
                  textAlign: 'center',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                Sign in to share
              </button>

              <p style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5, margin: 0 }}>
                Your designs stay local. Only shared projects are visible to clients.
              </p>
            </div>
          )}

          {/* SYNCING STATE */}
          {state === 'syncing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 40 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.2s infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.4s infinite' }} />
              </div>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Syncing to DriftGrid Cloud...</p>
              {progress && (
                <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{progress}</p>
              )}
            </div>
          )}

          {/* READY STATE */}
          {state === 'ready' && shareUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Share link ready</span>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: '#f5f5f5',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#333',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}
              >
                {shareUrl}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCopy}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    textAlign: 'center',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => window.open(shareUrl, '_blank')}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    textAlign: 'center',
                    background: '#fff',
                    color: '#333',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  Preview
                </button>
              </div>

              <p style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5, margin: 0, marginTop: 8 }}>
                Clients can browse and leave comments — no account needed.
              </p>

              {/* Copy Feedback section */}
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  onClick={handleCopyComments}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    textAlign: 'center',
                    background: '#fff',
                    color: '#666',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {commentsCopied ? 'Comments copied!' : 'Copy Client Feedback'}
                </button>
                <p style={{ fontSize: 10, color: '#bbb', margin: '8px 0 0', lineHeight: 1.4 }}>
                  Copies all client comments as text. Paste into your conversation to start the next round.
                </p>
              </div>

              {/* Re-sync + account info */}
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => {
                    const creds = getStoredCredentials();
                    if (creds) pushAndShare(creds.accessToken, creds.refreshToken);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    textAlign: 'center',
                    background: '#fff',
                    color: '#666',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  Re-sync latest changes
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#ccc' }}>
                    {email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 10,
                      color: '#ccc',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    sign out
                  </button>
                </div>

                <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                  Free tier: 1 project share.{' '}
                  <a href={`${CLOUD_URL}/pricing`} target="_blank" style={{ color: '#888', textDecoration: 'underline' }}>
                    Upgrade for unlimited
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* UPGRADE STATE */}
          {state === 'upgrade' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                You've used your free share on another project. Upgrade to Pro to share unlimited projects.
              </p>

              <div style={{ padding: '16px', background: '#f9f9f9', borderRadius: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 8 }}>Pro — $10/mo</div>
                <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
                  Unlimited shares · Cloud sync · Client commenting
                </div>
              </div>

              <a
                href={`${CLOUD_URL}/pricing`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '12px 0',
                  textAlign: 'center',
                  background: '#111',
                  color: '#fff',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textDecoration: 'none',
                }}
              >
                Upgrade to Pro
              </a>

              <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                Or{' '}
                <a href="https://docs.driftgrid.ai/docs/self-hosting" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>
                  self-host
                </a>
                {' '}for free with your own infrastructure.
              </p>
            </div>
          )}

          {/* ERROR STATE */}
          {state === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#e55', lineHeight: 1.6, margin: 0 }}>
                {errorMsg || 'Something went wrong.'}
              </p>

              <button
                onClick={() => {
                  setErrorMsg('');
                  checkCredentials();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 0',
                  textAlign: 'center',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>

              <button
                onClick={handleSignOut}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  color: '#aaa',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Sign in with a different account
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
