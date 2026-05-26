'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import type { ClientInfo } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';
import { useCopyFeedback } from '@/lib/hooks/useCopyFeedback';
import { useLocalLauncher, type LauncherStatus } from '@/lib/hooks/useLocalLauncher';

const isCloud = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const fetcher = (url: string) => fetch(url).then(r => r.json());

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('driftgrid-theme', next ? 'dark' : 'light'); } catch {}
  };

  return (
    <button
      onClick={toggle}
      className="p-1 rounded transition-colors hover:bg-[var(--border)]"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ opacity: 0.4 }}
    >
      {dark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

type ShareRecord = {
  token: string;
  client: string;
  project: string;
  round_number?: number | null;
  created_at: string;
  updated_at?: string | null;
  is_active: boolean;
};

export function Dashboard() {
  const { data: clients, isLoading } = useSWR<ClientInfo[]>('/api/clients', fetcher);
  const { data: shares } = useSWR<ShareRecord[]>(
    isCloud ? '/api/share' : null,
    fetcher
  );
  const launcher = useLocalLauncher();

  const isEmpty = clients && clients.length === 0;

  // Build a lookup: "client/project" → latest active share (across all rounds).
  // We want the round that was *most recently published*, so compare by
  // updated_at (falling back to created_at for legacy rows).
  const shareMap = new Map<string, ShareRecord>();
  if (Array.isArray(shares)) {
    for (const s of shares) {
      if (!s.is_active) continue;
      const key = `${s.client}/${s.project}`;
      const prev = shareMap.get(key);
      const t = (r: ShareRecord) => new Date(r.updated_at || r.created_at).getTime();
      if (!prev || t(s) > t(prev)) shareMap.set(key, s);
    }
  }

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-12 flex items-center justify-between">
        <h1 className="text-sm font-medium tracking-widest uppercase text-[var(--muted)]">
          DriftGrid{isCloud ? ' Cloud' : ''}
        </h1>
        <div className="flex items-center gap-4">
          {isCloud && (
            <Link href="/account" className="text-[10px] tracking-wide text-[var(--muted)] no-underline hover:opacity-80" style={{ opacity: 0.5 }}>
              Account
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Cloud mode subtitle + local server bar */}
      {isCloud && (
        <div className="-mt-8 mb-10">
          <p className="text-xs text-[var(--muted)] mb-3" style={{ opacity: 0.5 }}>
            Share your projects with clients. All design work happens locally.
          </p>
          <LocalServerBar launcher={launcher} />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <p className="text-xs text-[var(--muted)]">Loading...</p>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-20">
          {isCloud ? (
            <div>
              <p className="text-sm text-[var(--muted)] mb-4">
                No shared projects yet.
              </p>
              <p className="text-xs text-[var(--muted)] mb-6" style={{ opacity: 0.5, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
                Design locally with your agent, then click Share in your project to publish it here.
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              No projects yet. Run <code className="text-[var(--foreground)] font-medium">driftgrid init</code> to create one.
            </p>
          )}
        </div>
      )}

      {/* Client sections */}
      {clients?.map(client => (
        <section key={client.slug} className="mb-10">
          <h2 className="text-[10px] font-medium tracking-widest uppercase text-[var(--muted)] mb-3">
            {client.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {client.projects.map(project => {
              const resolved = resolveCanvas(project.canvas);
              const share = shareMap.get(`${client.slug}/${project.slug}`);
              const shareUrl = share ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${share.client}/${share.token}` : null;
              const lastPublishedAt = share?.updated_at || share?.created_at || null;
              const roundNumber = share?.round_number ?? null;

              return isCloud ? (
                <CloudProjectCard
                  key={project.slug}
                  client={client.slug}
                  project={project}
                  canvas={resolved.label}
                  shareUrl={shareUrl}
                  lastPublishedAt={lastPublishedAt}
                  roundNumber={roundNumber}
                  localUrl={launcher.localAdminUrl(client.slug, project.slug)}
                  serverRunning={launcher.status?.running ?? false}
                />
              ) : (
                <Link
                  key={project.slug}
                  href={`/admin/${client.slug}/${project.slug}`}
                  className="block group"
                >
                  <ProjectCard name={project.name} concepts={project.conceptCount} versions={project.versionCount} canvas={resolved.label} lastEditedAt={project.lastEditedAt} />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* New project hint */}
      {clients && clients.length > 0 && !isCloud && (
        <div className="mt-6 mb-12 text-center">
          <p className="text-[10px] text-[var(--muted)] tracking-wide">
            Run <code className="font-medium text-[var(--foreground)]">driftgrid init</code> to create a new project
          </p>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ name, concepts, versions, canvas, lastEditedAt }: { name: string; concepts: number; versions: number; canvas: string; lastEditedAt: string | null }) {
  return (
    <div
      className="relative"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '16px 20px',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.06))';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500 }} className="text-[var(--foreground)] mb-1.5">
        {name}
      </div>
      <div style={{ fontSize: 11 }} className="text-[var(--muted)]">
        {concepts} concept{concepts !== 1 ? 's' : ''} &middot; {versions} version{versions !== 1 ? 's' : ''}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[var(--muted)]" style={{ fontSize: 10 }}>{canvas}</span>
        {lastEditedAt && (
          <>
            <span className="text-[var(--muted)]" style={{ fontSize: 10, opacity: 0.5 }}>·</span>
            <span
              className="text-[var(--muted)]"
              style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }}
              title={new Date(lastEditedAt).toLocaleString()}
            >
              Edited {formatAgo(lastEditedAt)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const delta = Date.now() - then;
  if (delta < 60_000) return 'Just now';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(delta / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function CloudProjectCard({ client, project, canvas, shareUrl, lastPublishedAt, roundNumber, localUrl, serverRunning }: {
  client: string;
  project: { slug: string; name: string; conceptCount: number; versionCount: number; lastEditedAt: string | null };
  canvas: string;
  shareUrl: string | null;
  lastPublishedAt: string | null;
  roundNumber: number | null;
  localUrl: string | null;
  serverRunning: boolean;
}) {
  const { copied, copy } = useCopyFeedback();
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState(shareUrl);

  const createShare = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project: project.slug }),
      });
      if (res.ok) {
        const data = await res.json();
        setUrl(data.url);
        await copy(data.url);
      }
    } catch {}
    setCreating(false);
  }, [client, project.slug, copy]);

  const copyLink = useCallback(async () => {
    if (!url) return;
    await copy(url);
  }, [url, copy]);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '16px 20px',
      }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <Link
          href={`/admin/${client}/${project.slug}`}
          style={{ fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
          className="text-[var(--foreground)] hover:underline"
          title="Open in admin view"
        >
          {project.name}
        </Link>
        <div className="flex items-center gap-2">
          {localUrl && (
            <a
              href={localUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={serverRunning ? 'Open in local dev server' : 'Local server not running'}
              style={{
                fontSize: 9,
                letterSpacing: '0.06em',
                fontFamily: 'var(--font-mono, monospace)',
                color: serverRunning ? 'var(--muted)' : 'var(--muted)',
                opacity: serverRunning ? 0.7 : 0.3,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: serverRunning ? '#22c55e' : 'var(--muted)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              LOCAL
            </a>
          )}
          {url && (
            <span style={{ fontSize: 9, letterSpacing: '0.08em', color: '#22c55e', fontFamily: 'var(--font-mono, monospace)' }}>
              LIVE
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11 }} className="text-[var(--muted)] mb-1">
        {project.conceptCount} concept{project.conceptCount !== 1 ? 's' : ''} &middot; {project.versionCount} version{project.versionCount !== 1 ? 's' : ''} &middot; {canvas}
      </div>
      {project.lastEditedAt && (
        <div
          style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)' }}
          className="text-[var(--muted)] mb-1"
          title={new Date(project.lastEditedAt).toLocaleString()}
        >
          Edited {formatAgo(project.lastEditedAt)}
        </div>
      )}
      {url && lastPublishedAt && (
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', display: 'flex', gap: 8 }} className="text-[var(--muted)] mb-2" title={new Date(lastPublishedAt).toLocaleString()}>
          {roundNumber !== null && (
            <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>Round {roundNumber}</span>
          )}
          <span>Last published {formatAgo(lastPublishedAt)}</span>
        </div>
      )}

      {url ? (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={copyLink}
            style={{
              flex: 1,
              padding: '8px 0',
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'var(--font-mono, monospace)',
              background: 'var(--foreground)',
              color: 'var(--background)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            {copied ? 'Copied!' : 'Copy Share Link'}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '8px 12px',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            Preview
          </a>
        </div>
      ) : (
        <button
          onClick={createShare}
          disabled={creating}
          style={{
            width: '100%',
            padding: '8px 0',
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--foreground)',
            color: 'var(--background)',
            border: 'none',
            borderRadius: 6,
            cursor: creating ? 'default' : 'pointer',
            opacity: creating ? 0.5 : 1,
            letterSpacing: '0.04em',
            marginTop: 8,
          }}
        >
          {creating ? 'Creating...' : 'Create Share Link'}
        </button>
      )}
    </div>
  );
}

// ── Local server connection bar ────────────────────────────────────────

type LauncherHook = ReturnType<typeof useLocalLauncher>;

function LocalServerBar({ launcher }: { launcher: LauncherHook }) {
  const { localHost, status, starting, stopping, startServer, stopServer, configure } = launcher;
  const [editing, setEditing] = useState(!localHost);
  const [input, setInput] = useState(localHost || '');

  if (editing || !localHost) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <span className="text-[var(--muted)]" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
          Local host:
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              configure(input);
              setEditing(false);
            }
          }}
          placeholder="e.g. taco-bzy.local"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--foreground)',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
          }}
          autoFocus
        />
        <button
          onClick={() => {
            if (input.trim()) {
              configure(input);
              setEditing(false);
            }
          }}
          disabled={!input.trim()}
          style={{
            fontSize: 10,
            padding: '3px 8px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--foreground)',
            cursor: input.trim() ? 'pointer' : 'default',
            opacity: input.trim() ? 1 : 0.3,
          }}
        >
          Connect
        </button>
      </div>
    );
  }

  const reachable = status?.reachable ?? false;
  const running = status?.running ?? false;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        border: '1px solid var(--border)',
        borderRadius: 6,
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: !reachable ? 'var(--muted)' : running ? '#22c55e' : '#ef4444',
          flexShrink: 0,
        }}
        title={
          !reachable
            ? 'Launcher not reachable'
            : running
              ? `Dev server running on :${status?.port}`
              : 'Dev server stopped'
        }
      />

      {/* Host label */}
      <span className="text-[var(--muted)]" style={{ fontSize: 10 }}>
        {localHost}
      </span>

      {/* Status text */}
      <span
        style={{
          fontSize: 10,
          color: !reachable ? 'var(--muted)' : running ? '#22c55e' : '#ef4444',
          opacity: 0.8,
        }}
      >
        {!reachable
          ? 'unreachable'
          : running
            ? `:${status?.port}`
            : 'stopped'}
      </span>

      <div style={{ flex: 1 }} />

      {/* Actions */}
      {reachable && !running && (
        <button
          onClick={startServer}
          disabled={starting}
          style={{
            fontSize: 10,
            padding: '3px 10px',
            border: 'none',
            borderRadius: 4,
            background: 'var(--foreground)',
            color: 'var(--background)',
            cursor: starting ? 'default' : 'pointer',
            opacity: starting ? 0.5 : 1,
            letterSpacing: '0.04em',
          }}
        >
          {starting ? 'Starting...' : 'Start'}
        </button>
      )}
      {reachable && running && (
        <button
          onClick={stopServer}
          disabled={stopping}
          style={{
            fontSize: 10,
            padding: '3px 10px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--muted)',
            cursor: stopping ? 'default' : 'pointer',
            opacity: stopping ? 0.5 : 0.7,
          }}
        >
          {stopping ? 'Stopping...' : 'Stop'}
        </button>
      )}

      {/* Open local dashboard */}
      {launcher.localDashboardUrl && running && (
        <a
          href={launcher.localDashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10,
            color: 'var(--muted)',
            textDecoration: 'none',
            opacity: 0.7,
          }}
          title="Open local dashboard"
        >
          Open
        </a>
      )}

      {/* Edit host */}
      <button
        onClick={() => { setInput(localHost); setEditing(true); }}
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          opacity: 0.4,
          padding: 0,
        }}
        title="Change local host"
      >
        Edit
      </button>
    </div>
  );
}
