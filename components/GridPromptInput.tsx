'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { toast } from '@/components/Toast';
import type { Annotation } from '@/lib/types';

interface GridPromptInputProps {
  conceptLabel: string;
  versionNumber: number;
  /** Absolute path on disk of the new (empty) target file — agent will write to this */
  targetPath: string;
  /** Reference context: the slide this was drifted from (parent version or branch source) */
  referenceLabel?: string;
  referencePath?: string;
  /** DOM selector for the selected card wrapper — used to anchor the prompt near it */
  cardSelector: string;
  /** Existing whole-version prompt annotation, if one has already been saved */
  existingPrompt?: Annotation;
  /** Replies threaded under the existing prompt (including agent replies) */
  replies?: Annotation[];
  /** Save a new prompt (only called in the `empty` state) */
  onSave: (text: string) => void;
  /** Edit the text of an existing prompt (awaiting state only) */
  onEdit?: (id: string, text: string) => void;
  /** Add a reply to an existing prompt */
  onReply?: (parentId: string, text: string, asAgent?: boolean) => void;
  /** Toggle resolve on the existing prompt */
  onResolve?: (id: string) => void;
  /** Flip an annotation's status flag ('running' | null) */
  onSetStatus?: (id: string, status: 'running' | null) => void;
  onCancel: () => void;
}

type PromptState = 'empty' | 'awaiting' | 'in-progress' | 'done';

const BOX_WIDTH = 300;
const BOX_MARGIN = 16;
const CARD_GAP = 12;
const ESTIMATED_BOX_HEIGHT = 140;

/**
 * Floating prompt panel that anchors itself to the selected grid card and
 * adapts to the drift slot's lifecycle state.
 *
 * States:
 *   empty        — no prompt yet. Blank textarea + Copy / Send.
 *   awaiting     — prompt saved. Editable textarea + Copy / Send / mark running.
 *   in-progress  — agent working. Locked textarea + "agent working…" hint.
 *   done         — agent replied. Locked prompt + reply thread + Resolve / + reply.
 *
 * Anchoring: re-queries the card's screen rect every animation frame so the box
 * follows canvas zoom and pan. Growth is bottom-anchored so the action buttons
 * stay in view as the textarea wraps.
 */
export function GridPromptInput({
  conceptLabel,
  versionNumber,
  targetPath,
  referenceLabel,
  referencePath,
  cardSelector,
  existingPrompt,
  replies,
  onSave,
  onEdit,
  onReply,
  onResolve,
  onSetStatus,
  onCancel,
}: GridPromptInputProps) {
  // Derive current state from props
  const state: PromptState = useMemo(() => {
    if (!existingPrompt) return 'empty';
    const hasAgentReply = (replies || []).some(r => r.isAgent);
    if (hasAgentReply) return 'done';
    if (existingPrompt.status === 'running') return 'in-progress';
    return 'awaiting';
  }, [existingPrompt, replies]);

  // Text state: seeded from existingPrompt when in awaiting state, otherwise empty
  const [text, setText] = useState(() => existingPrompt?.text ?? '');
  // Re-seed when the prompt annotation changes (e.g. switching cards)
  useEffect(() => {
    setText(existingPrompt?.text ?? '');
  }, [existingPrompt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  // Anchor is the TOP-LEFT of the box at its initial size
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  // Growth offset — as the textarea wraps, the box translates up so the bottom stays fixed
  const [textareaGrowth, setTextareaGrowth] = useState(0);
  const [maxGrowth, setMaxGrowth] = useState(Infinity);
  const baseTextareaHeightRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLocked = state === 'in-progress' || state === 'done';

  /** Compute anchor from the selected card's current screen rect */
  const computeAnchor = useCallback((): { top: number; left: number } => {
    const wrapper = document.querySelector(cardSelector) as HTMLElement | null;
    const card = (wrapper?.firstElementChild as HTMLElement | null) || wrapper;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!card) {
      return { top: vh / 2 - ESTIMATED_BOX_HEIGHT / 2, left: vw / 2 - BOX_WIDTH / 2 };
    }
    const rect = card.getBoundingClientRect();
    const left = Math.max(
      BOX_MARGIN,
      Math.min(vw - BOX_WIDTH - BOX_MARGIN, rect.left + rect.width / 2 - BOX_WIDTH / 2),
    );
    const spaceBelow = vh - rect.bottom - CARD_GAP - BOX_MARGIN;
    const spaceAbove = rect.top - CARD_GAP - BOX_MARGIN;
    let top: number;
    if (spaceBelow >= ESTIMATED_BOX_HEIGHT) {
      top = rect.bottom + CARD_GAP;
    } else if (spaceAbove >= ESTIMATED_BOX_HEIGHT) {
      top = rect.top - CARD_GAP - ESTIMATED_BOX_HEIGHT;
    } else {
      top = Math.max(BOX_MARGIN, Math.min(vh - ESTIMATED_BOX_HEIGHT - BOX_MARGIN, rect.bottom + CARD_GAP));
    }
    return { top, left };
  }, [cardSelector]);

  // rAF loop to track the card through zoom/pan animations
  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const next = computeAnchor();
      setAnchor(prev => {
        if (prev && prev.top === next.top && prev.left === next.left) return prev;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [computeAnchor]);

  // Resize handler
  useEffect(() => {
    const handler = () => setAnchor(computeAnchor());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [computeAnchor]);

  // Focus textarea on mount (only for editable states)
  useEffect(() => {
    if (!isLocked) textareaRef.current?.focus();
  }, [isLocked]);

  // Auto-resize textarea + bottom-anchored growth math
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || !anchor) return;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    if (baseTextareaHeightRef.current === null) {
      baseTextareaHeightRef.current = h;
    }
    const base = baseTextareaHeightRef.current;
    const rawGrowth = Math.max(0, h - base);
    const cap = Math.max(0, anchor.top - BOX_MARGIN);
    const clamped = Math.min(rawGrowth, cap);
    el.style.height = `${base + clamped}px`;
    setTextareaGrowth(clamped);
    setMaxGrowth(cap);
  }, [text, anchor]);

  // Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Click outside to cancel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onCancel]);

  /** Build the agent-ready copy payload (reference + target + prompt) */
  const buildAgentMessage = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    const lines: string[] = [];
    if (referenceLabel && referencePath) {
      lines.push(`Reference: ${referenceLabel} — ${referencePath}`);
    }
    lines.push(`Target: ${conceptLabel} v${versionNumber} — ${targetPath}`);
    lines.push('');
    lines.push(trimmed);
    return lines.join('\n');
  }, [text, referenceLabel, referencePath, conceptLabel, versionNumber, targetPath]);

  const handleCopy = useCallback(() => {
    const message = buildAgentMessage();
    if (!message) return;
    navigator.clipboard?.writeText(message).catch(() => {});
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1500);
  }, [buildAgentMessage]);

  /** Enter in the textarea: save new prompt OR save an edit */
  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (state === 'empty') {
      onSave(trimmed);
      toast('Prompt saved');
    } else if (state === 'awaiting' && existingPrompt && trimmed !== existingPrompt.text) {
      onEdit?.(existingPrompt.id, trimmed);
      toast('Prompt updated');
    }
  }, [text, state, existingPrompt, onSave, onEdit]);

  /** Dev: simulate MCP picking up the prompt — toggles `status: 'running'` */
  const handleMarkRunning = useCallback(() => {
    if (!existingPrompt || !onSetStatus) return;
    onSetStatus(existingPrompt.id, 'running');
    toast('Marked in-progress');
  }, [existingPrompt, onSetStatus]);

  /** Dev: simulate the agent posting a reply — adds an isAgent annotation */
  const handleSimulateReply = useCallback(() => {
    if (!existingPrompt || !onReply) return;
    const replyText = window.prompt('Agent reply text:');
    if (replyText && replyText.trim()) {
      onReply(existingPrompt.id, replyText.trim(), true);
    }
  }, [existingPrompt, onReply]);

  /** Resolve the prompt (designer accepts the agent's work) */
  const handleResolve = useCallback(() => {
    if (!existingPrompt || !onResolve) return;
    onResolve(existingPrompt.id);
    toast('Marked resolved');
    onCancel();
  }, [existingPrompt, onResolve, onCancel]);

  if (!anchor) return null;

  const isCapped = maxGrowth !== Infinity && textareaGrowth >= maxGrowth && maxGrowth > 0;

  // Eyebrow label varies by state
  const eyebrowLabel = {
    empty: `Prompt · ${conceptLabel} v${versionNumber}`,
    awaiting: `Prompt · ${conceptLabel} v${versionNumber} · Awaiting agent`,
    'in-progress': `Prompt · ${conceptLabel} v${versionNumber} · In progress`,
    done: `Prompt · ${conceptLabel} v${versionNumber} · Done`,
  }[state];
  const eyebrowAccent = state === 'done'
    ? 'rgba(212, 168, 74, 0.85)'
    : state === 'in-progress'
      ? 'rgba(212, 168, 74, 0.75)'
      : 'rgba(255,255,255,0.35)';

  const placeholder = state === 'empty'
    ? 'Direct your agent…'
    : state === 'awaiting'
      ? 'Edit your prompt…'
      : 'Prompt locked';

  return (
    <div
      ref={containerRef}
      data-grid-prompt
      style={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        width: BOX_WIDTH,
        transform: `translateY(-${textareaGrowth}px)`,
        background: 'rgba(20, 20, 20, 0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 14,
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        zIndex: 100,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: eyebrowAccent,
          marginBottom: 8,
        }}
      >
        {eyebrowLabel}
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        readOnly={isLocked}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
          e.stopPropagation();
        }}
        placeholder={placeholder}
        rows={1}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          outline: 'none',
          resize: 'none',
          overflow: isCapped ? 'auto' : 'hidden',
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          fontSize: 13,
          color: isLocked ? 'rgba(255,255,255,0.75)' : '#fff',
          lineHeight: 1.5,
          padding: 0,
          margin: 0,
          display: 'block',
          cursor: isLocked ? 'default' : 'text',
        }}
      />

      {/* Reply thread — visible in done state */}
      {(replies && replies.length > 0) && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {replies.map(reply => (
            <div key={reply.id}>
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: reply.isAgent ? 'rgba(212,168,74,0.85)' : 'rgba(255,255,255,0.35)',
                  marginBottom: 4,
                }}
              >
                {reply.isAgent ? 'Agent' : (reply.author || 'reply').toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.92)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {reply.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions row */}
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: state === 'done' ? 'space-between' : 'flex-end',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {state === 'done' && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              handleResolve();
            }}
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '5px 9px',
              borderRadius: 5,
              border: '1px solid rgba(212,168,74,0.35)',
              background: 'rgba(212,168,74,0.1)',
              color: 'rgba(212,168,74,0.9)',
              cursor: 'pointer',
            }}
          >
            Resolve
          </button>
        )}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {/* Copy — visible in empty and awaiting states */}
          {(state === 'empty' || state === 'awaiting') && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
                textareaRef.current?.focus();
              }}
              disabled={!text.trim()}
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.1)',
                background: copyState === 'copied'
                  ? 'rgba(34,197,94,0.12)'
                  : 'rgba(255,255,255,0.05)',
                color: copyState === 'copied'
                  ? 'rgba(74,222,128,0.9)'
                  : (text.trim() ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'),
                cursor: text.trim() ? 'pointer' : 'default',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy'}
            </button>
          )}

          {/* Send to Agent — encourages MCP install */}
          {(state === 'empty' || state === 'awaiting') && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                toast('Install the DriftGrid MCP server to send prompts directly to your agent.', 'info');
                textareaRef.current?.focus();
              }}
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px dashed rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.02)',
                color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
              }}
            >
              Send to Agent
            </button>
          )}

          {/* Mark as running (simulates agent pickup) */}
          {state === 'awaiting' && onSetStatus && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleMarkRunning();
              }}
              title="Dev — simulate MCP picking up this prompt"
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px dashed rgba(212,168,74,0.4)',
                background: 'rgba(212,168,74,0.08)',
                color: 'rgba(212,168,74,0.8)',
                cursor: 'pointer',
              }}
            >
              ● running
            </button>
          )}

          {/* Dev — simulate agent reply (only in-progress so we can land in done state) */}
          {state === 'in-progress' && onReply && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleSimulateReply();
              }}
              title="Dev — simulate an agent reply"
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px dashed rgba(212,168,74,0.4)',
                background: 'rgba(212,168,74,0.08)',
                color: 'rgba(212,168,74,0.8)',
                cursor: 'pointer',
              }}
            >
              + agent reply
            </button>
          )}

          {/* Continue the thread in done state */}
          {state === 'done' && onReply && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleSimulateReply();
              }}
              title="Continue the conversation"
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '5px 9px',
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }}
            >
              + reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
