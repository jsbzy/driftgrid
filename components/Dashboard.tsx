'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import type { ClientInfo } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';

const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

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

  const isEmpty = clients && clients.length === 0;

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-12 flex items-center justify-between">
        <h1 className="text-sm font-medium tracking-widest uppercase text-[var(--muted)]">
          DriftGrid
        </h1>
        <ThemeToggle />
      </header>

      {/* Loading state */}
      {isLoading && (
        <p className="text-xs text-[var(--muted)]">Loading...</p>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-20">
          <p className="text-sm text-[var(--muted)]">
            No projects yet. Run <code className="text-[var(--foreground)] font-medium">driftgrid init</code> to create one.
          </p>
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
              return (
                <Link
                  key={project.slug}
                  href={`/admin/${client.slug}/${project.slug}`}
                  className="block group"
                >
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
                    {/* Project name */}
                    <div
                      style={{ fontSize: 14, fontWeight: 500 }}
                      className="text-[var(--foreground)] mb-1.5"
                    >
                      {project.name}
                    </div>
                    {/* Meta: concept count + version count */}
                    <div
                      style={{ fontSize: 11 }}
                      className="text-[var(--muted)]"
                    >
                      {project.conceptCount} concept{project.conceptCount !== 1 ? 's' : ''} &middot; {project.versionCount} version{project.versionCount !== 1 ? 's' : ''}
                    </div>
                    {/* Canvas label + push button */}
                    <div className="flex items-center justify-between mt-2">
                      <span
                        className="text-[var(--muted)]"
                        style={{ fontSize: 10 }}
                      >
                        {resolved.label}
                      </span>
                      {hasSupabase && (
                        <PushButton client={client.slug} project={project.slug} />
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* New project hint */}
      {clients && clients.length > 0 && (
        <div className="mt-6 mb-12 text-center">
          <p className="text-[10px] text-[var(--muted)] tracking-wide">
            Run <code className="font-medium text-[var(--foreground)]">driftgrid init</code> to create a new project
          </p>
        </div>
      )}
    </div>
  );
}

function PushButton({ client, project }: { client: string; project: string }) {
  const [state, setState] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');

  const push = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); // Don't navigate the parent Link
    e.stopPropagation();
    if (state === 'pushing') return;
    setState('pushing');
    setResult('');

    try {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project }),
      });
      const data = await res.json();
      if (res.ok) {
        setState('done');
        setResult(`${data.uploaded} files`);
        // Copy share URL
        if (data.shareUrl) {
          const fullUrl = window.location.origin + data.shareUrl;
          try { await navigator.clipboard.writeText(fullUrl); } catch {}
        }
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('error');
        setResult(data.error || 'Failed');
        setTimeout(() => setState('idle'), 3000);
      }
    } catch {
      setState('error');
      setResult('Network error');
      setTimeout(() => setState('idle'), 3000);
    }
  }, [client, project, state]);

  return (
    <button
      onClick={push}
      className="flex items-center gap-1 transition-all"
      style={{
        fontSize: 9,
        letterSpacing: '0.06em',
        fontFamily: 'var(--font-mono, monospace)',
        color: state === 'done' ? '#059669' : state === 'error' ? '#e55' : 'var(--muted)',
        opacity: state === 'pushing' ? 0.4 : 0.5,
      }}
      title="Push to cloud + copy share link"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
      </svg>
      <span>
        {state === 'pushing' ? 'PUSHING...' : state === 'done' ? `PUSHED ${result}` : state === 'error' ? result : 'PUSH'}
      </span>
    </button>
  );
}
