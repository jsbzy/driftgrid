'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import type { ClientInfo } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';

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

export function Dashboard() {
  const { data: clients, isLoading } = useSWR<ClientInfo[]>('/api/clients', fetcher);
  const { data: shares } = useSWR<{ token: string; client: string; project: string; is_active: boolean }[]>(
    isCloud ? '/api/share' : null,
    fetcher
  );

  const isEmpty = clients && clients.length === 0;

  // Build a lookup: "client/project" → share token
  const shareMap = new Map<string, string>();
  if (shares) {
    for (const s of shares) {
      if (s.is_active) shareMap.set(`${s.client}/${s.project}`, s.token);
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

      {/* Cloud mode subtitle */}
      {isCloud && (
        <p className="text-xs text-[var(--muted)] -mt-8 mb-10" style={{ opacity: 0.5 }}>
          Share your projects with clients. All design work happens locally.
        </p>
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
              const shareToken = shareMap.get(`${client.slug}/${project.slug}`);
              const shareUrl = shareToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${shareToken}` : null;

              return isCloud ? (
                <CloudProjectCard
                  key={project.slug}
                  client={client.slug}
                  project={project}
                  canvas={resolved.label}
                  shareUrl={shareUrl}
                />
              ) : (
                <Link
                  key={project.slug}
                  href={`/admin/${client.slug}/${project.slug}`}
                  className="block group"
                >
                  <ProjectCard name={project.name} concepts={project.conceptCount} versions={project.versionCount} canvas={resolved.label} />
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

function ProjectCard({ name, concepts, versions, canvas }: { name: string; concepts: number; versions: number; canvas: string }) {
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
      <div className="mt-2">
        <span className="text-[var(--muted)]" style={{ fontSize: 10 }}>{canvas}</span>
      </div>
    </div>
  );
}

function CloudProjectCard({ client, project, canvas, shareUrl }: {
  client: string;
  project: { slug: string; name: string; conceptCount: number; versionCount: number };
  canvas: string;
  shareUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
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
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
    setCreating(false);
  }, [client, project.slug]);

  const copyLink = useCallback(async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '16px 20px',
      }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div style={{ fontSize: 14, fontWeight: 500 }} className="text-[var(--foreground)]">
          {project.name}
        </div>
        {url && (
          <span style={{ fontSize: 9, letterSpacing: '0.08em', color: '#22c55e', fontFamily: 'var(--font-mono, monospace)' }}>
            LIVE
          </span>
        )}
      </div>
      <div style={{ fontSize: 11 }} className="text-[var(--muted)] mb-2">
        {project.conceptCount} concept{project.conceptCount !== 1 ? 's' : ''} &middot; {project.versionCount} version{project.versionCount !== 1 ? 's' : ''} &middot; {canvas}
      </div>

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
