'use client';

/**
 * Personal access token manager for the account page. Lets a signed-in user
 * mint a `dg_pat_…` token (shown once), see their existing tokens, and revoke
 * them. Talks to /api/cloud/tokens (cookie-authenticated).
 *
 * The minted plaintext is displayed a single time in a copy box — the server
 * only ever stores its hash, so there is no way to show it again later.
 */

import { useEffect, useState } from 'react';

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

const mono = { fontFamily: 'var(--font-mono, monospace)' } as const;

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function AccessTokens() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/cloud/tokens');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load tokens');
      setTokens(body.tokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    setFreshToken(null);
    setCopied(false);
    try {
      const res = await fetch('/api/cloud/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create token');
      setFreshToken(body.token);
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/cloud/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to revoke token');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke token');
    }
  }

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <section className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border)', ...mono }}>
      <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)', opacity: 0.6 }}>
        access tokens
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
        Long-lived credentials for headless pushes (the <code>driftgrid push</code> CLI, automation).
        Present as a bearer token — no browser sign-in needed. Stored hashed; shown once on creation.
      </p>

      {freshToken && (
        <div className="space-y-2 p-3 border rounded" style={{ borderColor: '#8b5cf6' }}>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: '#8b5cf6' }}>
            copy now — shown once
          </div>
          <div className="flex items-center gap-2">
            <code className="text-[11px] break-all flex-1" style={{ color: 'var(--foreground)' }}>{freshToken}</code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(freshToken).then(() => setCopied(true));
              }}
              className="text-[10px] tracking-widest uppercase py-1 px-2 border rounded shrink-0"
              style={{ color: 'var(--foreground)', borderColor: 'var(--border)' }}
            >
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          placeholder="token name (e.g. dev-box)"
          maxLength={80}
          className="flex-1 text-xs py-2 px-3 border rounded bg-transparent"
          style={{ color: 'var(--foreground)', borderColor: 'var(--border)', ...mono }}
        />
        <button
          onClick={create}
          disabled={creating || !name.trim()}
          className="text-[10px] tracking-widest uppercase py-2 px-4 border rounded shrink-0 disabled:opacity-40"
          style={{ color: 'var(--foreground)', borderColor: '#8b5cf6' }}
        >
          {creating ? '…' : 'generate'}
        </button>
      </div>

      {error && <div className="text-[11px]" style={{ color: '#ef4444' }}>{error}</div>}

      {loading ? (
        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>loading…</div>
      ) : active.length === 0 ? (
        <div className="text-[11px]" style={{ color: 'var(--muted)', opacity: 0.6 }}>No active tokens.</div>
      ) : (
        <div className="space-y-2">
          {active.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <div className="text-xs truncate" style={{ color: 'var(--foreground)' }}>{t.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                  {t.token_prefix}… · used {fmt(t.last_used_at)} · {t.expires_at ? `expires ${fmt(t.expires_at)}` : 'no expiry'}
                </div>
              </div>
              <button
                onClick={() => revoke(t.id)}
                className="text-[10px] tracking-widest uppercase py-1 px-2 shrink-0"
                style={{ color: '#ef4444' }}
              >
                revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
