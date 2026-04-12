'use client';

import { useState, useEffect } from 'react';
import { toast } from './Toast';

type ShareState = 'closed' | 'local' | 'signup' | 'uploading' | 'ready' | 'upgrade';

interface SharePanelProps {
  open: boolean;
  onClose: () => void;
  client: string;
  project: string;
}

export function SharePanel({ open, onClose, client, project }: SharePanelProps) {
  const [state, setState] = useState<ShareState>('closed');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setState('closed');
      return;
    }
    // Determine initial state
    checkState();
  }, [open]);

  async function checkState() {
    // Detect local mode — no Supabase URL means sharing isn't possible locally
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setState('local');
      return;
    }

    try {
      // Cloud mode — try to create share link
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project }),
      });

      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.url);
        setState('ready');
        return;
      }

      const err = await res.json();

      // Duplicate — share already exists
      if (err.error?.includes('duplicate') || err.error?.includes('unique')) {
        const listRes = await fetch(`/api/share?client=${encodeURIComponent(client)}&project=${encodeURIComponent(project)}`);
        if (listRes.ok) {
          const links = await listRes.json();
          if (links.length > 0) {
            setShareUrl(`${window.location.origin}/s/${links[0].token}`);
            setState('ready');
            return;
          }
        }
      }

      // Free tier limit
      if (err.error === 'free_limit') {
        setState('upgrade');
        return;
      }

      // Not authenticated or local mode
      if (res.status === 400 || res.status === 401) {
        setState('signup');
        return;
      }
    } catch {
      setState('signup');
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast('Share link copied');
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
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
            {state === 'local' || state === 'signup' ? 'Share with clients' : state === 'upgrade' ? 'Upgrade to share' : 'Share link'}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <div style={bodyStyle}>
          {/* LOCAL STATE — no cloud configured */}
          {state === 'local' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                Create a DriftGrid account to share your projects with clients.
              </p>

              <a
                href="https://driftgrid.ai/login"
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
                Create Account
              </a>

              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5, margin: 0 }}>
                  Prefer to self-host?{' '}
                  <a href="https://docs.driftgrid.ai/docs/self-hosting" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>
                    See docs
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* SIGNUP STATE */}
          {state === 'signup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                To share a DriftGrid project with clients, you need an account.
              </p>

              <a
                href={`https://driftgrid.ai/login?next=${encodeURIComponent(`/admin/${client}/${project}`)}`}
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
                Create Account
              </a>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                <span style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href="https://driftgrid.ai/login?provider=google"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    textAlign: 'center',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#444',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  Google
                </a>
                <a
                  href="https://driftgrid.ai/login?provider=github"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    textAlign: 'center',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#444',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  GitHub
                </a>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5, margin: 0 }}>
                  Prefer to self-host?{' '}
                  <a href="https://docs.driftgrid.ai/docs/self-hosting" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>
                    See docs
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* UPLOADING STATE */}
          {state === 'uploading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 40 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.2s infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.4s infinite' }} />
              </div>
              <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Uploading project to cloud...</p>
              {uploadProgress && (
                <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{uploadProgress}</p>
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

              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                  Free tier: 1 project share.{' '}
                  <a href="/pricing" target="_blank" style={{ color: '#888', textDecoration: 'underline' }}>Upgrade for unlimited</a>
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
                href="/pricing"
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
        </div>
      </div>
    </>
  );
}
