'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import type { Annotation } from '@/lib/types';
import { toast } from '@/components/Toast';

const MCP_INSTALL_MESSAGE = 'MCP required — install the DriftGrid MCP server to send comments directly to an agent.';

function handleSendToAgentStub() {
  toast(MCP_INSTALL_MESSAGE, 'info');
}

interface AnnotationOverlayProps {
  annotations: Annotation[];
  editMode?: boolean;
  placingPin?: boolean;
  annotationMode?: boolean;
  /** 'client' hides agent/designer actions (resolve, copy for agent, send to agent, reply) */
  viewMode?: 'designer' | 'client';
  onAdd: (x: number | null, y: number | null, text: string) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
  onReply?: (parentId: string, text: string, asAgent?: boolean) => void;
  /** Frame context — used to build rich agent messages that include the slide path */
  frameContext?: {
    conceptLabel: string;
    versionNumber: number;
    filePath: string;
  };
}

interface PendingPin {
  x: number;
  y: number;
}

export function AnnotationOverlay({
  annotations,
  editMode,
  placingPin,
  annotationMode,
  viewMode = 'designer',
  onAdd,
  onResolve,
  onDelete,
  onEdit,
  onReply,
  frameContext,
}: AnnotationOverlayProps) {
  const isClient = viewMode === 'client';
  // Unified: overlay captures clicks when in legacy annotationMode OR when placing a pin in edit mode
  const isCapturing = annotationMode || (editMode && placingPin);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [activePin, setActivePin] = useState<string | null>(null);
  // Bottom-anchored growth: track textarea height delta from initial single line
  const [textareaGrowth, setTextareaGrowth] = useState(0);
  const baseTextareaHeightRef = useRef<number | null>(null);
  // Copy-for-agent button state (transient "Copied" label)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  // Local draft text for editing existing annotations, keyed by id
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Replies lookup — any annotation with parentId is a reply to another annotation
  const repliesByParent = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (a.parentId) {
      (acc[a.parentId] = acc[a.parentId] || []).push(a);
    }
    return acc;
  }, {});
  for (const key in repliesByParent) {
    repliesByParent[key].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  }

  // Auto-resize the edit textarea in the active popup
  useLayoutEffect(() => {
    const el = editInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [activePin, editDrafts]);

  // Seed edit draft when a pin becomes active
  useEffect(() => {
    if (!activePin) return;
    const annotation = annotations.find(a => a.id === activePin);
    if (!annotation) return;
    setEditDrafts(prev => (prev[activePin] !== undefined ? prev : { ...prev, [activePin]: annotation.text }));
  }, [activePin, annotations]);

  const handleSaveEdit = useCallback((id: string) => {
    const draft = editDrafts[id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    const original = annotations.find(a => a.id === id);
    if (!original || !trimmed || trimmed === original.text) return;
    onEdit?.(id, trimmed);
  }, [editDrafts, annotations, onEdit]);

  // Build the agent-ready message for an existing annotation — includes slide context, pin location, and any replies
  const buildAnnotationAgentMessage = useCallback((annotation: Annotation) => {
    const lines: string[] = [];
    if (frameContext) {
      lines.push(`Slide: ${frameContext.conceptLabel} v${frameContext.versionNumber} — ${frameContext.filePath}`);
    }
    if (annotation.x !== null && annotation.y !== null) {
      const xPct = Math.round(annotation.x * 100);
      const yPct = Math.round(annotation.y * 100);
      lines.push(`Pin: (${xPct}%, ${yPct}%)`);
    }
    if (lines.length > 0) lines.push('');
    lines.push(annotation.text);
    const replies = repliesByParent[annotation.id] || [];
    if (replies.length > 0) {
      lines.push('');
      for (const r of replies) {
        const who = r.isAgent ? 'Agent' : (r.author || 'Reply');
        lines.push(`↳ ${who}: ${r.text}`);
      }
    }
    return lines.join('\n');
  }, [frameContext, repliesByParent]);

  // Focus input when pending pin appears
  useEffect(() => {
    if (pendingPin && inputRef.current) {
      inputRef.current.focus();
    }
  }, [pendingPin]);

  // Auto-resize textarea to fit content + track growth so the popup can grow upward
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    el.style.height = `${h}px`;
    if (baseTextareaHeightRef.current === null) {
      baseTextareaHeightRef.current = h;
      setTextareaGrowth(0);
    } else {
      setTextareaGrowth(Math.max(0, h - baseTextareaHeightRef.current));
    }
  }, [pendingText, pendingPin]);

  // Reset growth tracking when pin is dismissed
  useEffect(() => {
    if (!pendingPin) {
      baseTextareaHeightRef.current = null;
      setTextareaGrowth(0);
    }
  }, [pendingPin]);

  // Close active pin popup on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingPin) {
          setPendingPin(null);
          setPendingText('');
        }
        if (activePin) {
          setActivePin(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingPin, activePin]);

  // Close active pin popup when clicking anywhere outside of it (document-level listener)
  useEffect(() => {
    if (!activePin) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-annotation-popup]') && !target.closest('[data-annotation-pin]')) {
        setActivePin(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePin]);

  // Clear pending/active states when capture mode changes
  useEffect(() => {
    if (!isCapturing) {
      setPendingPin(null);
      setPendingText('');
      setActivePin(null);
    }
  }, [isCapturing]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isCapturing) return;
      // Don't place pins when clicking on existing pins or popups
      if ((e.target as HTMLElement).closest('[data-annotation-pin]') || (e.target as HTMLElement).closest('[data-annotation-popup]')) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const relativeX = (e.clientX - rect.left) / rect.width;
      const relativeY = (e.clientY - rect.top) / rect.height;

      setPendingPin({ x: relativeX, y: relativeY });
      setPendingText('');
      setActivePin(null);
    },
    [isCapturing]
  );

  const handleSubmitPending = useCallback(() => {
    if (!pendingPin || !pendingText.trim()) return;
    onAdd(pendingPin.x, pendingPin.y, pendingText.trim());
    setPendingPin(null);
    setPendingText('');
  }, [pendingPin, pendingText, onAdd]);

  const handleCopyForAgent = useCallback(() => {
    const text = pendingText.trim();
    if (!text) return;
    const lines: string[] = [];
    if (frameContext) {
      lines.push(`Slide: ${frameContext.conceptLabel} v${frameContext.versionNumber} — ${frameContext.filePath}`);
    }
    if (pendingPin) {
      const xPct = Math.round(pendingPin.x * 100);
      const yPct = Math.round(pendingPin.y * 100);
      lines.push(`Pin: (${xPct}%, ${yPct}%)`);
    }
    if (lines.length > 0) lines.push('');
    lines.push(text);
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1500);
  }, [pendingText, pendingPin, frameContext]);

  const handlePinClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setActivePin(prev => (prev === id ? null : id));
      setPendingPin(null);
      setPendingText('');
    },
    []
  );

  // Determine popup position (above or below pin)
  const getPopupPosition = (y: number): 'above' | 'below' => {
    return y > 0.7 ? 'above' : 'below';
  };

  return (
    <div
      ref={containerRef}
      onClick={handleOverlayClick}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        pointerEvents: isCapturing ? 'auto' : 'none',
        cursor: isCapturing ? 'crosshair' : 'default',
      }}
    >
      {/* Pin placement indicator — shown during legacy annotation mode or unified edit pin placement */}
      {isCapturing && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent-orange)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.8)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Add Comment
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            click to pin · Esc to cancel
          </span>
        </div>
      )}

      {/* Existing pins — top-level annotations only (replies are rendered inside their parent's popup) */}
      {annotations.map((annotation, index) => {
        if (annotation.parentId) return null;
        if (annotation.x === null || annotation.y === null) return null;
        const isActive = activePin === annotation.id;
        const popupPos = getPopupPosition(annotation.y);
        const replies = repliesByParent[annotation.id] || [];
        const isLocked = replies.length > 0;

        return (
          <div
            key={annotation.id}
            data-annotation-pin
            style={{
              position: 'absolute',
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isActive ? 15 : 12,
            }}
          >
            {/* Pin circle */}
            <button
              onClick={(e) => handlePinClick(e, annotation.id)}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                background: annotation.isClient ? 'var(--accent-orange)' : 'var(--foreground)',
                opacity: annotation.resolved ? 0.3 : 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s ease, opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              {index + 1}
            </button>

            {/* Pin popup — matches pending input style */}
            {isActive && (
              <div
                data-annotation-popup
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  ...(popupPos === 'below'
                    ? { top: 22 }
                    : { bottom: 22 }),
                  width: 300,
                  background: 'rgba(20, 20, 20, 0.95)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: 14,
                  boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                  zIndex: 20,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Eyebrow — COMMENT · author */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: annotation.resolved
                        ? 'rgba(34,197,94,0.7)'
                        : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {annotation.resolved ? 'Resolved' : 'Comment'} · {annotation.isClient ? annotation.author : 'designer'}
                  </span>
                  {/* Delete icon — designer only */}
                  {!isClient && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(annotation.id);
                        setActivePin(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'rgba(255,255,255,0.3)',
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = '#ef4444';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)';
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Note — editable textarea unless the comment has replies (then locked) */}
                {isLocked ? (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: annotation.resolved ? 'rgba(255,255,255,0.4)' : '#fff',
                      textDecoration: annotation.resolved ? 'line-through' : 'none',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      minHeight: 20,
                    }}
                  >
                    {annotation.text}
                  </div>
                ) : (
                  <textarea
                    ref={isActive ? editInputRef : undefined}
                    value={editDrafts[annotation.id] ?? annotation.text}
                    onChange={(e) => setEditDrafts(prev => ({ ...prev, [annotation.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit(annotation.id);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditDrafts(prev => ({ ...prev, [annotation.id]: annotation.text }));
                        setActivePin(null);
                      }
                      e.stopPropagation();
                    }}
                    onBlur={() => handleSaveEdit(annotation.id)}
                    rows={1}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      overflow: 'hidden',
                      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: annotation.resolved ? 'rgba(255,255,255,0.4)' : '#fff',
                      textDecoration: annotation.resolved ? 'line-through' : 'none',
                      padding: 0,
                      margin: 0,
                      display: 'block',
                    }}
                  />
                )}

                {/* Replies thread */}
                {replies.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
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
                            color: reply.isAgent ? 'var(--accent-gold, #d4a84a)' : 'rgba(255,255,255,0.35)',
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

                {/* Actions row — client gets a minimal view, designer gets full controls */}
                {isClient ? (
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
                    {new Date(annotation.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {annotation.resolved && ' · resolved'}
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onResolve(annotation.id);
                      }}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        padding: '5px 9px',
                        borderRadius: 5,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: annotation.resolved
                          ? 'rgba(34,197,94,0.12)'
                          : 'rgba(255,255,255,0.05)',
                        color: annotation.resolved
                          ? 'rgba(74,222,128,0.9)'
                          : 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                      }}
                    >
                      {annotation.resolved ? 'Resolved' : 'Resolve'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          const message = buildAnnotationAgentMessage(annotation);
                          navigator.clipboard?.writeText(message).catch(() => {});
                          toast('Copied for agent');
                        }}
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
                        Copy for agent
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendToAgentStub();
                        }}
                        title="Install the DriftGrid MCP server to enable"
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
                      {onReply && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            const text = window.prompt('Agent reply text:');
                            if (text && text.trim()) {
                              onReply(annotation.id, text.trim(), true);
                            }
                          }}
                          title="Dev — simulate an agent reply without MCP"
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
                          + reply
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pending pin (new annotation input) */}
      {pendingPin && (
        <div
          data-annotation-popup
          style={{
            position: 'absolute',
            left: `${pendingPin.x * 100}%`,
            top: `${pendingPin.y * 100}%`,
            width: 0,
            height: 0,
            zIndex: 20,
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pending pin dot — absolutely positioned and centered at the pin location */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: 'translate(-50%, -50%)',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--foreground)',
              border: '2px solid var(--accent-orange)',
            }}
          />

          {/* Input popup — offset to right of pin so pin stays visible; grows upward as text wraps */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              top: -8,
              width: 300,
              transform: `translateY(-${textareaGrowth}px)`,
              background: 'rgba(20, 20, 20, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)',
              padding: 14,
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 8,
              }}
            >
              Comment
            </div>
            <textarea
              ref={inputRef}
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitPending();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPendingPin(null);
                  setPendingText('');
                }
                // Stop propagation so keyboard shortcuts don't fire
                e.stopPropagation();
              }}
              placeholder="Leave a note…"
              rows={1}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 13,
                color: '#fff',
                lineHeight: 1.5,
                padding: 0,
                margin: 0,
                display: 'block',
              }}
            />
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 6,
              }}
            >
              {isClient ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmitPending();
                  }}
                  disabled={!pendingText.trim()}
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '5px 12px',
                    borderRadius: 5,
                    border: 'none',
                    background: pendingText.trim() ? '#fff' : 'rgba(255,255,255,0.1)',
                    color: pendingText.trim() ? '#000' : 'rgba(255,255,255,0.2)',
                    cursor: pendingText.trim() ? 'pointer' : 'default',
                    fontWeight: 600,
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  Add Comment
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyForAgent();
                      inputRef.current?.focus();
                    }}
                    disabled={!pendingText.trim()}
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
                        : (pendingText.trim() ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'),
                      cursor: pendingText.trim() ? 'pointer' : 'default',
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {copyState === 'copied' ? 'Copied' : 'Copy for agent'}
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendToAgentStub();
                      inputRef.current?.focus();
                    }}
                    title="Install the DriftGrid MCP server to enable"
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
