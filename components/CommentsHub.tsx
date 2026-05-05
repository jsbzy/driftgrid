'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ProjectAnnotation } from '@/app/api/annotations/all/route';

interface CommentsHubProps {
  open: boolean;
  onClose: () => void;
  client: string;
  project: string;
  /** Jump to a frame (concept + version) and pin the annotation. */
  onJumpTo: (conceptId: string, versionId: string, annotationId: string) => void;
  /** Refresh signal — bumped by the parent when annotations change locally. */
  refreshKey?: number;
}

type StateKey = 'open' | 'in-progress' | 'replied' | 'closed';
type TabKey = 'open' | 'replied' | 'closed';

const TAB_ORDER: TabKey[] = ['open', 'replied', 'closed'];
const TAB_LABELS: Record<TabKey, string> = {
  'open': 'Open',
  'replied': 'Replied',
  'closed': 'Closed',
};

const STATE_DOT: Record<StateKey, string> = {
  'open': 'var(--accent-orange)',
  'in-progress': 'var(--accent-teal)',
  'replied': 'var(--muted)',
  'closed': 'var(--muted)',
};

// Map a row's true state to the tab it belongs to. In-progress rows live in the
// Open tab (they're still pending the agent's reply) but keep their teal dot
// inside the row to preserve the distinction.
function tabForState(state: StateKey): TabKey {
  if (state === 'in-progress' || state === 'open') return 'open';
  if (state === 'replied') return 'replied';
  return 'closed';
}

export function CommentsHub({ open, onClose, client, project, onJumpTo, refreshKey }: CommentsHubProps) {
  const [items, setItems] = useState<ProjectAnnotation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('open');

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/annotations/all?client=${encodeURIComponent(client)}&project=${encodeURIComponent(project)}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [open, client, project]);

  useEffect(() => {
    if (open) load();
  }, [open, load, refreshKey]);

  if (!open) return null;

  const counts: Record<TabKey, number> = { 'open': 0, 'replied': 0, 'closed': 0 };
  const grouped: Record<TabKey, ProjectAnnotation[]> = { 'open': [], 'replied': [], 'closed': [] };
  for (const it of items ?? []) {
    const tab = tabForState(it.state);
    counts[tab]++;
    grouped[tab].push(it);
  }

  const visible = grouped[activeTab];

  return (
    <>
      <style>{`
        @keyframes ch-slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 49 }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 420,
          background: 'var(--background)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          zIndex: 50,
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          color: 'var(--foreground)',
          display: 'flex', flexDirection: 'column',
          animation: 'ch-slideIn 200ms ease-out',
        }}
      >
        <div style={{
          padding: '20px 28px 0',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}>Comments</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: 4 }}
              title="Close"
            >×</button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginLeft: -4 }}>
            {TAB_ORDER.map(key => {
              const isActive = key === activeTab;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 14px',
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: isActive ? 'var(--foreground)' : 'var(--muted)',
                    borderBottom: `2px solid ${isActive ? 'var(--foreground)' : 'transparent'}`,
                    marginBottom: -1,
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {TAB_LABELS[key]}
                  <span style={{
                    fontSize: 10,
                    color: isActive ? 'var(--muted)' : 'var(--muted)',
                    opacity: isActive ? 0.7 : 0.5,
                    fontWeight: 400,
                  }}>{counts[key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0 28px' }}>
          {loading && !items && (
            <div style={{ padding: '40px 28px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              Loading…
            </div>
          )}
          {!loading && items && visible.length === 0 && (
            <div style={{ padding: '40px 28px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              {activeTab === 'open' && 'No open comments. You’re caught up.'}
              {activeTab === 'replied' && 'No replies yet.'}
              {activeTab === 'closed' && 'No closed comments.'}
            </div>
          )}
          {visible.map(item => (
            <Row
              key={item.annotation.id}
              item={item}
              dotColor={STATE_DOT[item.state]}
              onJumpTo={(c, v, a) => { onJumpTo(c, v, a); onClose(); }}
              client={client}
              project={project}
              onLocalRefresh={load}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function Row({
  item, dotColor, onJumpTo, client, project, onLocalRefresh,
}: {
  item: ProjectAnnotation;
  dotColor: string;
  onJumpTo: (conceptId: string, versionId: string, annotationId: string) => void;
  client: string;
  project: string;
  onLocalRefresh: () => void;
}) {
  const last = item.replies[item.replies.length - 1] ?? item.annotation;
  const lastWho = last.isAgent ? (last.author || 'agent') : (last.author || 'designer');
  const preview = item.annotation.text.replace(/\s+/g, ' ').slice(0, 90);
  const truncated = item.annotation.text.length > 90;
  const ago = formatAgo(last.created);

  const handleMarkOpen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: item.conceptId, versionId: item.versionId,
        annotationId: item.annotation.id,
        submittedAt: null,
      }),
    });
    onLocalRefresh();
  }, [client, project, item.conceptId, item.versionId, item.annotation.id, onLocalRefresh]);

  return (
    <div
      style={{
        position: 'relative',
        borderLeft: '2px solid transparent',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--column-tint)'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'var(--column-accent)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
    >
      <button
        onClick={() => onJumpTo(item.conceptId, item.versionId, item.annotation.id)}
        style={{
          width: '100%', padding: '10px 28px',
          display: 'block', textAlign: 'left',
          background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--foreground)', fontFamily: 'inherit',
        }}
        title={item.annotation.text}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
            {item.roundNumber ? `R${item.roundNumber} · ` : ''}{item.conceptLabel} · v{item.versionNumber}
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{ago}</span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4, paddingRight: item.state === 'in-progress' ? 80 : 0 }}>
          {preview}{truncated ? '…' : ''}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>last: {lastWho}</span>
          {item.replies.length > 0 && <span>· {item.replies.length} repl{item.replies.length === 1 ? 'y' : 'ies'}</span>}
          {item.annotation.provider && <span>· → {item.annotation.provider}</span>}
        </div>
      </button>
      {/* "Didn't actually paste it" undo — only on in-progress rows */}
      {item.state === 'in-progress' && (
        <button
          onClick={handleMarkOpen}
          title="Mark as not yet sent (in case you copied but didn't paste into the agent)"
          style={{
            position: 'absolute',
            top: 8, right: 16,
            fontSize: 9,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 6px',
            borderRadius: 3,
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            opacity: 0.6,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
        >
          ↺ open
        </button>
      )}
    </div>
  );
}

function formatAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
