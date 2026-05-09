'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ProjectAnnotation } from '@/app/api/annotations/all/route';
import { buildAgentMessage } from '@/lib/agent-payload';
import { toast } from '@/components/Toast';

interface CommentsHubProps {
  open: boolean;
  onClose: () => void;
  client: string;
  project: string;
  /** Round currently being viewed in the grid/frame. The hub filters by this
   *  unless the user explicitly toggles "all rounds." */
  activeRoundId?: string | null;
  /** Friendly label for the active round, e.g. "R6". */
  activeRoundLabel?: string | null;
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
  'in-progress': 'var(--accent-purple)',
  'replied': 'var(--accent-green)',
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

const DELETE_CONFIRM_SKIP_KEY = 'driftgrid:skipCommentDeleteConfirm';

export function CommentsHub({ open, onClose, client, project, activeRoundId, activeRoundLabel, onJumpTo, refreshKey }: CommentsHubProps) {
  const [items, setItems] = useState<ProjectAnnotation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [pendingDelete, setPendingDelete] = useState<ProjectAnnotation | null>(null);
  const [skipNextTime, setSkipNextTime] = useState(false);
  // Default: only show comments in the round the designer is currently viewing.
  // Toggle to see comments from every round.
  const [showAllRounds, setShowAllRounds] = useState(false);

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

  // Refresh on the global submit/mutate event so the hub stays in sync when the
  // designer presses Copy-for-Agent on a frame popup, deletes via the trash, etc.
  useEffect(() => {
    if (!open) return;
    const onMutate = () => load();
    window.addEventListener('driftgrid:annotation-submitted', onMutate);
    return () => window.removeEventListener('driftgrid:annotation-submitted', onMutate);
  }, [open, load]);

  // Performs the delete network call (used by both the dialog and the skip-path).
  const performDelete = useCallback(async (it: ProjectAnnotation) => {
    await fetch('/api/annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: it.conceptId, versionId: it.versionId,
        annotationId: it.annotation.id,
      }),
    });
    load();
    window.dispatchEvent(new CustomEvent('driftgrid:annotation-submitted'));
  }, [client, project, load]);

  // Row entrypoint — checks the skip-confirm preference, otherwise opens the dialog.
  const requestDelete = useCallback((it: ProjectAnnotation) => {
    const skip = typeof window !== 'undefined' && localStorage.getItem(DELETE_CONFIRM_SKIP_KEY) === '1';
    if (skip) {
      performDelete(it);
    } else {
      setPendingDelete(it);
      setSkipNextTime(false);
    }
  }, [performDelete]);

  const confirmDeletion = useCallback(() => {
    if (!pendingDelete) return;
    if (skipNextTime) {
      try { localStorage.setItem(DELETE_CONFIRM_SKIP_KEY, '1'); } catch {}
    }
    performDelete(pendingDelete);
    setPendingDelete(null);
  }, [pendingDelete, skipNextTime, performDelete]);

  if (!open) return null;

  // Filter to active round unless the user opted into "all rounds." If we have
  // no roundId at all (legacy / non-rounds project), the filter is a no-op.
  const roundFilteredItems = (items ?? []).filter(it => {
    if (showAllRounds || !activeRoundId) return true;
    return it.roundId === activeRoundId;
  });

  const counts: Record<TabKey, number> = { 'open': 0, 'replied': 0, 'closed': 0 };
  const grouped: Record<TabKey, ProjectAnnotation[]> = { 'open': [], 'replied': [], 'closed': [] };
  for (const it of roundFilteredItems) {
    const tab = tabForState(it.state);
    counts[tab]++;
    grouped[tab].push(it);
  }

  const visible = grouped[activeTab];

  // Build a multi-comment agent payload for the current tab.
  // mode 'auto' = let the agent apply directly. mode 'interview' = walk through
  // each comment with the designer first, no edits until confirmed.
  const buildBatchPayload = (mode: 'auto' | 'interview'): string => {
    const batchTitle = showAllRounds
      ? `${visible.length} ${activeTab} comments across all rounds`
      : `${visible.length} ${activeTab} comments in ${activeRoundLabel || 'the active round'}`;
    const lines: string[] = [];
    lines.push('################################################################');
    lines.push(`#  BATCH HANDOFF — ${batchTitle}`);
    lines.push(`#  Project: ${client}/${project}`);
    lines.push(`#  Mode: ${mode === 'auto' ? 'AUTO-APPLY' : 'INTERVIEW FIRST'}`);
    lines.push('################################################################');
    lines.push('');
    if (mode === 'auto') {
      lines.push('Apply each comment as a drift on its own frame. For unambiguous changes,');
      lines.push('edit and reply in-thread with a one-line summary. For comments where the');
      lines.push('intent is unclear, ASK FIRST in the thread before editing — do not guess.');
    } else {
      lines.push('Do NOT edit any files yet. Walk through these comments with the designer:');
      lines.push('');
      lines.push('  1. Read every comment below before responding.');
      lines.push('  2. Group related comments and surface conflicts.');
      lines.push('  3. For each comment, ask one clarifying question if needed, then');
      lines.push('     confirm the proposed change with the designer.');
      lines.push('  4. After all are confirmed, apply them — drift each frame, reply');
      lines.push('     in-thread with a summary. Echo file path + URL per AGENTS.md.');
    }
    lines.push('');
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('COMMENTS');
    lines.push('────────────────────────────────────────────────────────────────');
    visible.forEach((item, i) => {
      const slide = `${item.roundNumber ? `R${item.roundNumber} · ` : ''}${item.conceptLabel} · v${item.versionNumber}`;
      const url = `http://localhost:3000/admin/${client}/${project}#${item.conceptId}/v${item.versionNumber}`;
      const pin = item.annotation.x !== null && item.annotation.y !== null
        ? ` (pin ${Math.round(item.annotation.x * 100)}%, ${Math.round(item.annotation.y * 100)}%)`
        : '';
      const provider = item.annotation.provider ? ` [routed: ${item.annotation.provider}]` : '';
      lines.push('');
      lines.push(`[${i + 1}] ${slide}${pin}${provider}`);
      lines.push(`    ID: ${item.annotation.id}`);
      lines.push(`    URL: ${url}`);
      lines.push(`    Designer: ${item.annotation.text}`);
      // Include the latest reply so the agent has context for follow-ups.
      const lastReply = item.replies[item.replies.length - 1];
      if (lastReply) {
        const who = lastReply.isAgent ? 'Agent (already done)' : (lastReply.author || 'Reply');
        lines.push(`    ${who}: ${lastReply.text}`);
      }
    });
    lines.push('');
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('When you reply to each comment via /api/annotations, set parentId to the');
    lines.push('annotation ID and include a brief summary of the change. Use isAgent=true.');
    return lines.join('\n');
  };

  const handleCopyAll = (mode: 'auto' | 'interview') => {
    if (visible.length === 0) {
      toast(`No ${activeTab} comments to copy`, 'error');
      return;
    }
    const message = buildBatchPayload(mode);
    navigator.clipboard?.writeText(message).catch(() => {});
    toast(`Copied ${visible.length} comments — paste into your agent`);
  };

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
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              Comments
              {/* Round filter toggle — only meaningful when the project has rounds */}
              {activeRoundId && (
                <button
                  onClick={() => setShowAllRounds(v => !v)}
                  title={showAllRounds ? 'Showing all rounds — click to filter to active round' : 'Showing active round only — click to show all rounds'}
                  style={{
                    background: showAllRounds ? 'transparent' : 'var(--column-tint)',
                    border: '1px solid var(--border)',
                    color: showAllRounds ? 'var(--muted)' : 'var(--foreground)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    fontWeight: 400,
                  }}
                >
                  {showAllRounds ? 'All rounds' : (activeRoundLabel || 'Active round')}
                </button>
              )}
            </span>
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

        {/* Batch-copy bar — only meaningful when there are items in the current tab */}
        {visible.length > 0 && activeTab === 'open' && (
          <div style={{
            padding: '10px 28px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10,
            background: 'var(--column-tint)',
          }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Copy all {visible.length}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleCopyAll('interview')}
                title="Copy all open comments + a directive: walk through with the designer first, no edits until confirmed"
                style={{
                  fontSize: 9, padding: '4px 10px', borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Interview first
              </button>
              <button
                onClick={() => handleCopyAll('auto')}
                title="Copy all open comments + a directive: apply each as a drift, ask only when intent is unclear"
                style={{
                  fontSize: 9, padding: '4px 10px', borderRadius: 4,
                  border: '1px solid var(--foreground)',
                  background: 'var(--foreground)',
                  color: 'var(--background)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Auto-apply
              </button>
            </div>
          </div>
        )}

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
              onRequestDelete={requestDelete}
            />
          ))}
        </div>
      </div>

      {/* Delete confirmation dialog — z-index above the panel */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={() => setPendingDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--background)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 380,
              width: '100%',
              margin: '0 16px',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Delete comment?</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>
              {pendingDelete.conceptLabel} · v{pendingDelete.versionNumber}
              <br />
              “{pendingDelete.annotation.text.slice(0, 80)}{pendingDelete.annotation.text.length > 80 ? '…' : ''}”
              <br /><br />
              This can’t be undone.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={skipNextTime}
                  onChange={(e) => setSkipNextTime(e.target.checked)}
                />
                Don’t ask again
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setPendingDelete(null)}
                  style={{
                    fontSize: 11, padding: '6px 12px', borderRadius: 5,
                    border: '1px solid var(--border)',
                    background: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeletion}
                  style={{
                    fontSize: 11, padding: '6px 12px', borderRadius: 5,
                    border: 'none',
                    background: 'var(--accent-orange)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  item, dotColor, onJumpTo, client, project, onLocalRefresh, onRequestDelete,
}: {
  item: ProjectAnnotation;
  dotColor: string;
  onJumpTo: (conceptId: string, versionId: string, annotationId: string) => void;
  client: string;
  project: string;
  onLocalRefresh: () => void;
  onRequestDelete: (item: ProjectAnnotation) => void;
}) {
  const last = item.replies[item.replies.length - 1] ?? item.annotation;
  const lastWho = last.isAgent ? (last.author || 'agent') : (last.author || 'designer');
  const preview = item.annotation.text.replace(/\s+/g, ' ').slice(0, 90);
  const truncated = item.annotation.text.length > 90;
  const when = formatDateTime(last.created);
  // Who's the responsible party for the next move
  // - in-progress: the routed agent (or "an agent" if untargeted)
  // - replied:     designer is up — "your turn"
  // - open:        you wrote it, agent doesn't have it yet
  // - closed:      done
  let workingLine: string | null = null;
  if (item.state === 'in-progress') {
    const who = item.annotation.provider || 'an agent';
    workingLine = `${who} working on it`;
  } else if (item.state === 'replied') {
    workingLine = 'your turn';
  } else if (item.state === 'open') {
    workingLine = 'not sent yet';
  }

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
    window.dispatchEvent(new CustomEvent('driftgrid:annotation-submitted'));
  }, [client, project, item.conceptId, item.versionId, item.annotation.id, onLocalRefresh]);

  const handleToggleResolve = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: item.conceptId, versionId: item.versionId,
        annotationId: item.annotation.id,
        resolved: !item.annotation.resolved,
      }),
    });
    onLocalRefresh();
    window.dispatchEvent(new CustomEvent('driftgrid:annotation-submitted'));
  }, [client, project, item.conceptId, item.versionId, item.annotation.id, item.annotation.resolved, onLocalRefresh]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRequestDelete(item);
  }, [onRequestDelete, item]);

  const handleCopyForAgent = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const message = buildAgentMessage({
      annotation: item.annotation,
      replies: item.replies,
      frameContext: {
        client,
        project,
        conceptId: item.conceptId,
        versionId: item.versionId,
        conceptLabel: item.conceptLabel,
        versionNumber: item.versionNumber,
        filePath: `~/driftgrid/projects/${client}/${project}/...`,
      },
    });
    try { await navigator.clipboard?.writeText(message); } catch {}
    // Mark the thread as freshly submitted to the agent so the row moves to In progress.
    fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: item.conceptId, versionId: item.versionId,
        annotationId: item.annotation.id,
        submittedAt: new Date().toISOString(),
      }),
    }).then(() => {
      window.dispatchEvent(new CustomEvent('driftgrid:annotation-submitted'));
    }).catch(() => {});
    toast('Copied — paste into your agent');
    onLocalRefresh();
  }, [client, project, item, onLocalRefresh]);

  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        borderLeft: '2px solid transparent',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { setHovered(true); (e.currentTarget as HTMLElement).style.background = 'var(--column-tint)'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'var(--column-accent)'; }}
      onMouseLeave={(e) => { setHovered(false); (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.roundNumber ? `R${item.roundNumber} · ` : ''}{item.conceptLabel} · v{item.versionNumber}
            </span>
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0, opacity: hovered ? 0 : 1, transition: 'opacity 120ms ease' }}>{when}</span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4, paddingRight: item.state === 'in-progress' ? 80 : 0 }}>
          {preview}{truncated ? '…' : ''}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {workingLine && (
            <span style={{
              color: item.state === 'in-progress' ? 'var(--accent-purple)'
                : item.state === 'replied' ? 'var(--accent-green)'
                : 'var(--accent-orange)',
              fontWeight: item.state === 'replied' ? 600 : 500,
            }}>
              {workingLine}
            </span>
          )}
          <span>· last by {lastWho}</span>
          {item.replies.length > 0 && <span>· {item.replies.length} repl{item.replies.length === 1 ? 'y' : 'ies'}</span>}
        </div>
      </button>
      {/* Hover actions — sit where the timestamp was, replacing it on hover */}
      <div
        style={{
          position: 'absolute',
          top: 8, right: 16,
          display: 'flex',
          gap: 4,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 120ms ease',
        }}
      >
        {/* Copy for Agent — primary action, hidden on closed rows */}
        {item.state !== 'closed' && (
          <button
            onClick={handleCopyForAgent}
            title="Copy the prompt + context to clipboard for your agent"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 7px',
              borderRadius: 3,
              background: 'var(--foreground)',
              border: '1px solid var(--foreground)',
              color: 'var(--background)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy
          </button>
        )}
        {/* Mark-as-open: only on in-progress rows */}
        {item.state === 'in-progress' && (
          <button
            onClick={handleMarkOpen}
            title="Mark as not yet sent (you copied but didn't paste into the agent)"
            style={{
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
            }}
          >
            ↺ open
          </button>
        )}
        {/* Resolve / Unresolve */}
        <button
          onClick={handleToggleResolve}
          title={item.annotation.resolved ? 'Reopen this comment' : 'Resolve this comment'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 3,
            background: 'none',
            border: '1px solid var(--border)',
            color: item.annotation.resolved ? 'var(--accent-green)' : 'var(--muted)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--accent-green)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-green)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = item.annotation.resolved ? 'var(--accent-green)' : 'var(--muted)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        {/* Delete */}
        <button
          onClick={handleDelete}
          title="Delete this comment"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 3,
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--accent-orange)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-orange)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const now = new Date();
  const then = new Date(iso);
  // Calendar-day boundaries (not 24-hour rolling) — "yesterday at 11pm" should
  // read as Yesterday even if it's only an hour ago.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeekAgo = startOfToday - 6 * 86_400_000;
  const time = then.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  if (Date.now() - t < 60_000) return 'just now';
  if (then.getTime() >= startOfToday) return `Today ${time}`;
  if (then.getTime() >= startOfYesterday) return `Yesterday ${time}`;
  if (then.getTime() >= startOfWeekAgo) {
    const weekday = then.toLocaleDateString([], { weekday: 'short' });
    return `${weekday} ${time}`;
  }
  // Older — include month/day; year only if not the current year.
  const sameYear = then.getFullYear() === now.getFullYear();
  const date = then.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
  return `${date} ${time}`;
}
