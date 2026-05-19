'use client';

import { useState, useMemo, useCallback } from 'react';
import type { ClientComment, Concept } from '@/lib/types';
import { buildAgentMessage } from '@/lib/agent-payload';
import { toast } from '@/components/Toast';
import { copyTextSafely } from '@/lib/clipboard';

interface ClientCommentsHubProps {
  open: boolean;
  onClose: () => void;
  comments: ClientComment[];
  /** All concepts in the active round — used to resolve concept_id → label/version_number. */
  concepts: Concept[];
  /** Project's client + project slugs — needed for the agent payload's frame URL. */
  client: string;
  project: string;
  authorName: string;
  isAdmin: boolean;
  onJumpTo: (conceptId: string, versionId: string) => void;
  onResolve: (commentId: string) => Promise<void> | void;
  onDelete: (commentId: string) => Promise<boolean> | boolean;
}

type TabKey = 'open' | 'replied' | 'closed';

const TAB_ORDER: TabKey[] = ['open', 'replied', 'closed'];
const TAB_LABELS: Record<TabKey, string> = {
  open: 'Open',
  replied: 'Replied',
  closed: 'Closed',
};

const STATE_DOT: Record<TabKey, string> = {
  open: 'var(--accent-orange)',
  replied: 'var(--accent-green)',
  closed: 'var(--muted)',
};

interface Thread {
  top: ClientComment;
  replies: ClientComment[];
  conceptLabel: string;
  versionNumber: number;
  state: TabKey;
}

export function ClientCommentsHub({
  open,
  onClose,
  comments,
  concepts,
  client,
  project,
  authorName,
  isAdmin,
  onJumpTo,
  onResolve,
  onDelete,
}: ClientCommentsHubProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [pendingDelete, setPendingDelete] = useState<Thread | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [agentCopied, setAgentCopied] = useState(false);

  // Build threads from flat comments — group replies under their parent.
  const threads = useMemo<Thread[]>(() => {
    const tops = comments.filter(c => !c.parent_comment_id);
    const byParent = new Map<string, ClientComment[]>();
    for (const c of comments) {
      if (!c.parent_comment_id) continue;
      const arr = byParent.get(c.parent_comment_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_comment_id, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    const conceptById = new Map<string, Concept>();
    for (const c of concepts) conceptById.set(c.id, c);

    const out: Thread[] = tops.map(top => {
      const replies = byParent.get(top.id) ?? [];
      const concept = conceptById.get(top.concept_id);
      const version = concept?.versions.find(v => v.id === top.version_id);
      // State: closed wins, then check whether someone replied after the original
      let state: TabKey;
      if (top.status === 'resolved') {
        state = 'closed';
      } else {
        const last = replies[replies.length - 1] ?? top;
        // "Replied" if anyone other than the original author has chimed in.
        // Normalize names so trailing whitespace / capitalization differences
        // (a returning client typing "Marcia" then "marcia ") don't trick the
        // hub into thinking it's a different person.
        const norm = (s: string) => s.trim().toLowerCase();
        const topAuthor = norm(top.author_name);
        const repliedByOther = replies.some(r => norm(r.author_name) !== topAuthor);
        if (repliedByOther && norm(last.author_name) !== topAuthor) {
          state = 'replied';
        } else {
          state = 'open';
        }
      }
      return {
        top,
        replies,
        conceptLabel: concept?.label ?? '(unknown)',
        versionNumber: version?.number ?? 0,
        state,
      };
    });
    // Most recent activity first
    out.sort((a, b) => {
      const aLast = a.replies[a.replies.length - 1]?.created_at ?? a.top.created_at;
      const bLast = b.replies[b.replies.length - 1]?.created_at ?? b.top.created_at;
      return bLast.localeCompare(aLast);
    });
    return out;
  }, [comments, concepts]);

  const counts: Record<TabKey, number> = { open: 0, replied: 0, closed: 0 };
  for (const t of threads) counts[t.state]++;
  const visible = threads.filter(t => t.state === activeTab);

  const formatAllComments = useCallback(() => {
    const lines: string[] = [];
    lines.push(`## Comments — ${client}/${project}`);
    lines.push('');
    const grouped = new Map<string, Thread[]>();
    for (const t of threads) {
      const key = `${t.conceptLabel}::v${t.versionNumber}`;
      const arr = grouped.get(key) ?? [];
      arr.push(t);
      grouped.set(key, arr);
    }
    for (const [key, group] of grouped) {
      const [label, ver] = key.split('::');
      lines.push(`### ${label} (${ver})`);
      for (const t of group) {
        const status = t.state === 'closed' ? ' [resolved]' : '';
        const pos = describePosition(t.top.x_rel, t.top.y_rel);
        const posTag = pos ? ` (${pos})` : '';
        lines.push(`- "${t.top.body}" — ${t.top.author_name}${posTag}${status}`);
        for (const r of t.replies) {
          lines.push(`  - "${r.body}" — ${r.author_name}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }, [threads, client, project]);

  const handleCopyAll = useCallback(async () => {
    const text = formatAllComments();
    if (!text || threads.length === 0) {
      toast('No comments to copy');
      return;
    }
    const ok = await copyTextSafely(text);
    if (ok) {
      setAllCopied(true);
      toast(`${threads.length} comment${threads.length === 1 ? '' : 's'} copied`);
      setTimeout(() => setAllCopied(false), 2000);
    } else {
      toast('Clipboard blocked — try again', 'error');
    }
  }, [threads, formatAllComments]);

  const handleCopyForAgent = useCallback(async () => {
    const commentsBlock = formatAllComments();
    if (!commentsBlock || threads.length === 0) {
      toast('No comments to copy');
      return;
    }
    const lines: string[] = [];
    lines.push('################################################################');
    lines.push('# DRIFTGRID CLIENT FEEDBACK — AGENT REVIEW');
    lines.push('################################################################');
    lines.push('');
    lines.push(`Project: ${client}/${project}`);
    lines.push('');
    lines.push('Interview me about all these edits before we drift them to the next round.');
    lines.push('Go one comment or concept at a time. For each, ask what I want to do:');
    lines.push('apply as-is, revise, ignore, or combine with another edit.');
    lines.push('Keep a running decision log. Once we agree on the plan, create a new');
    lines.push('round and apply only the approved changes.');
    lines.push('');
    lines.push(commentsBlock);
    const text = lines.join('\n');
    const ok = await copyTextSafely(text);
    if (ok) {
      setAgentCopied(true);
      toast('Agent review prompt copied');
      setTimeout(() => setAgentCopied(false), 2200);
    } else {
      toast('Clipboard blocked — try again', 'error');
    }
  }, [threads, client, project, formatAllComments]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    await onDelete(pendingDelete.top.id);
    setPendingDelete(null);
  }, [pendingDelete, onDelete]);

  if (!open) return null;

  return (
    <>
      <style>{`@keyframes ch-slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
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
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}>Comments</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: 4 }}
              title="Close"
            >×</button>
          </div>
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
                  <span style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.7, fontWeight: 400 }}>
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0 28px' }}>
          {visible.length === 0 && (
            <div style={{ padding: '40px 28px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              {activeTab === 'open' && 'No open comments.'}
              {activeTab === 'replied' && 'No replies yet.'}
              {activeTab === 'closed' && 'No closed comments.'}
            </div>
          )}
          {visible.map(thread => (
            <Row
              key={thread.top.id}
              thread={thread}
              dotColor={STATE_DOT[thread.state]}
              authorName={authorName}
              isAdmin={isAdmin}
              client={client}
              project={project}
              onJumpTo={(c, v) => { onJumpTo(c, v); onClose(); }}
              onResolve={onResolve}
              onRequestDelete={() => setPendingDelete(thread)}
            />
          ))}
        </div>

        {threads.length > 0 && (
          <div style={{ padding: '12px 28px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button
              onClick={handleCopyForAgent}
              style={{
                flex: 1, padding: '10px 0', textAlign: 'center',
                background: 'var(--foreground)', color: 'var(--background)',
                border: 'none', borderRadius: 5, cursor: 'pointer',
                fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >{agentCopied ? 'Copied!' : 'Copy for Agent Review'}</button>
            <button
              onClick={handleCopyAll}
              style={{
                flex: 1, padding: '10px 0', textAlign: 'center',
                background: 'none', color: 'var(--foreground)',
                border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer',
                fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >{allCopied ? 'Copied!' : 'Copy All'}</button>
          </div>
        )}
      </div>

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
              “{pendingDelete.top.body.slice(0, 80)}{pendingDelete.top.body.length > 80 ? '…' : ''}”
              <br /><br />
              This can’t be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
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
              >Cancel</button>
              <button
                onClick={handleConfirmDelete}
                style={{
                  fontSize: 11, padding: '6px 12px', borderRadius: 5,
                  border: 'none',
                  background: 'var(--accent-orange)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  thread, dotColor, authorName, isAdmin, client, project, onJumpTo, onResolve, onRequestDelete,
}: {
  thread: Thread;
  dotColor: string;
  authorName: string;
  isAdmin: boolean;
  client: string;
  project: string;
  onJumpTo: (conceptId: string, versionId: string) => void;
  onResolve: (commentId: string) => Promise<void> | void;
  onRequestDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const last = thread.replies[thread.replies.length - 1] ?? thread.top;
  const lastWho = last.author_name;
  const preview = thread.top.body.replace(/\s+/g, ' ').slice(0, 90);
  const truncated = thread.top.body.length > 90;
  const when = formatDateTime(last.created_at);
  // Delete privilege: own comment, or admin (share owner)
  const canDelete = isAdmin || (authorName && thread.top.author_name === authorName);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderLeft: '2px solid transparent',
        transition: 'background 120ms ease',
        ...(hovered ? { background: 'var(--column-tint)', borderLeftColor: 'var(--column-accent)' } : {}),
      }}
    >
      <button
        onClick={() => onJumpTo(thread.top.concept_id, thread.top.version_id)}
        style={{
          width: '100%', padding: '10px 28px',
          display: 'block', textAlign: 'left',
          background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--foreground)', fontFamily: 'inherit',
        }}
        title={thread.top.body}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {thread.conceptLabel} · v{thread.versionNumber}
            </span>
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0, opacity: hovered ? 0 : 1, transition: 'opacity 120ms ease' }}>{when}</span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4 }}>
          {preview}{truncated ? '…' : ''}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>by {thread.top.author_name}</span>
          {thread.replies.length > 0 && <span>· last from {lastWho}</span>}
          {thread.replies.length > 0 && <span>· {thread.replies.length} repl{thread.replies.length === 1 ? 'y' : 'ies'}</span>}
        </div>
      </button>

      {/* Hover actions */}
      <div
        style={{
          position: 'absolute', top: 8, right: 16,
          display: 'flex', gap: 4,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 120ms ease',
        }}
      >
        {/* Copy for Agent — admin only (share-owner forwards a client comment to their agent) */}
        {isAdmin && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const message = buildAgentMessage({
                annotation: {
                  id: thread.top.id,
                  x: thread.top.x_rel,
                  y: thread.top.y_rel,
                  element: thread.top.element_selector,
                  text: thread.top.body,
                  author: thread.top.author_name,
                  isClient: true,
                  isAgent: false,
                  created: thread.top.created_at,
                  resolved: thread.top.status === 'resolved',
                  parentId: null,
                },
                replies: thread.replies.map(r => ({
                  id: r.id,
                  x: null, y: null, element: null,
                  text: r.body,
                  author: r.author_name,
                  isClient: r.author_name.trim().toLowerCase() === thread.top.author_name.trim().toLowerCase(),
                  isAgent: false,
                  created: r.created_at,
                  resolved: false,
                  parentId: thread.top.id,
                })),
                frameContext: {
                  client, project,
                  conceptId: thread.top.concept_id,
                  versionId: thread.top.version_id,
                  conceptLabel: thread.conceptLabel,
                  versionNumber: thread.versionNumber,
                  filePath: `~/driftgrid/projects/${client}/${project}/${thread.conceptLabel}-v${thread.versionNumber}.html`,
                },
              });
              const ok = await copyTextSafely(message);
              if (ok) toast('Copied — paste into your agent');
              else toast('Clipboard blocked — try again', 'error');
            }}
            title="Copy this comment + context for your agent"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 8px', height: 22, borderRadius: 3,
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
            Copy
          </button>
        )}
        {/* Resolve / unresolve — admin only (clients shouldn't lock threads) */}
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onResolve(thread.top.id); }}
            title={thread.top.status === 'resolved' ? 'Reopen' : 'Resolve'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 3,
              background: 'none',
              border: '1px solid var(--border)',
              color: thread.top.status === 'resolved' ? 'var(--accent-green)' : 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        )}
        {/* Delete — own comment or admin */}
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            title="Delete this comment"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 3,
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const now = new Date();
  const then = new Date(iso);
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
  const sameYear = then.getFullYear() === now.getFullYear();
  const date = then.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
  return `${date} ${time}`;
}

function describePosition(x: number | null, y: number | null): string {
  if (x == null || y == null) return '';
  const row = y < 0.33 ? 'top' : y < 0.66 ? 'middle' : 'bottom';
  const col = x < 0.33 ? 'left' : x < 0.66 ? 'center' : 'right';
  if (row === 'middle' && col === 'center') return 'center';
  if (row === 'middle') return col;
  if (col === 'center') return row;
  return `${row}-${col}`;
}
