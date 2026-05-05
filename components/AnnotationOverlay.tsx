'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import type { Annotation } from '@/lib/types';
import { toast } from '@/components/Toast';

function handleSendToAgent() {
  toast('Install the DriftGrid MCP server to send prompts directly to your agent.', 'info');
}

interface AnnotationOverlayProps {
  annotations: Annotation[];
  editMode?: boolean;
  placingPin?: boolean;
  annotationMode?: boolean;
  /** 'client' hides agent/designer actions (resolve, copy for agent, send to agent, reply) */
  viewMode?: 'designer' | 'client';
  /** Name of the current viewer in client mode — used to show the trash icon only on the viewer's own comments */
  currentAuthor?: string;
  /** True when the current session is the share owner — unlocks delete on any comment in client view */
  isAdmin?: boolean;
  onAdd: (x: number | null, y: number | null, text: string, provider?: string) => Promise<Annotation | null> | void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
  onReply?: (parentId: string, text: string, asAgent?: boolean) => void;
  /** Frame context — used to build rich agent messages that include the slide path */
  frameContext?: {
    client?: string;
    project?: string;
    conceptId?: string;
    versionId?: string;
    conceptLabel: string;
    versionNumber: number;
    filePath: string;
  };
  /** When true, x/y are interpreted as fractions of the iframe document's scroll dimensions, not the overlay viewport. Pins translate with iframe scroll so they stick to content. */
  scrollable?: boolean;
  /** Iframe element whose document scroll drives pin translation when scrollable=true. */
  iframeEl?: HTMLIFrameElement | null;
  /** Round-wide pin numbering (annotationId → #N). Falls back to per-frame index when missing. */
  pinNumberByAnnotationId?: Record<string, number>;
}

// Derive the lifecycle state of a thread from the top annotation + its replies.
// Mirrors the server-side logic in /api/annotations/all so pin colors match the hub.
function derivePinState(top: Annotation, replies: Annotation[]): 'open' | 'in-progress' | 'replied' | 'closed' {
  if (top.resolved) return 'closed';
  const last = replies[replies.length - 1] ?? top;
  if (last.isAgent) return 'replied';
  if (top.status === 'running') return 'in-progress';
  if (top.submittedAt && top.submittedAt >= last.created) return 'in-progress';
  return 'open';
}

const PIN_BG_BY_STATE: Record<'open' | 'in-progress' | 'replied' | 'closed', string> = {
  // open        — designer needs to send → urgent orange
  // in-progress — agent is working → working teal
  // replied     — agent finished, designer's turn to review → positive green
  // closed      — resolved, no action → muted gray
  'open':        'var(--accent-orange)',
  'in-progress': 'var(--accent-purple)',
  'replied':     'var(--accent-green)',
  'closed':      'var(--muted)',
};

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
  currentAuthor,
  isAdmin = false,
  onAdd,
  onResolve,
  onDelete,
  onEdit,
  onReply,
  frameContext,
  scrollable = false,
  iframeEl,
  pinNumberByAnnotationId,
}: AnnotationOverlayProps) {
  const isClient = viewMode === 'client';
  // Unified: overlay captures clicks when in legacy annotationMode OR when placing a pin in edit mode
  const isCapturing = annotationMode || (editMode && placingPin);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [activePin, setActivePin] = useState<string | null>(null);
  const pinRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [popupMetrics, setPopupMetrics] = useState<{ placement: 'above' | 'below'; maxHeight: number } | null>(null);
  // Iframe scroll geometry — used in scrollable mode to stick pins to document content.
  // x/y are fractions of scrollWidth/scrollHeight; pins render at (frac * size - scroll) px.
  const [iframeGeom, setIframeGeom] = useState<{ scrollX: number; scrollY: number; scrollWidth: number; scrollHeight: number } | null>(null);
  // Bottom-anchored growth: track textarea height delta from initial single line
  const [textareaGrowth, setTextareaGrowth] = useState(0);
  const baseTextareaHeightRef = useRef<number | null>(null);
  // Copy-for-agent button state (transient "Copied" label)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  // Local draft text for editing existing annotations, keyed by id
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  // Local draft text for designer reply input, keyed by annotation id
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  // Provider tag for the next prompt — picked in the pending-pin popup, persisted across the session
  // so the designer's last choice sticks. Undefined = "any agent".
  const [pendingProvider, setPendingProvider] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const v = window.sessionStorage.getItem('driftgrid:pendingProvider');
    return v && ['claude', 'codex', 'gemini'].includes(v) ? v : undefined;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingProvider) window.sessionStorage.setItem('driftgrid:pendingProvider', pendingProvider);
    else window.sessionStorage.removeItem('driftgrid:pendingProvider');
  }, [pendingProvider]);
  // Plan-mode toggle — when on, the saved annotation text is prefixed with `[plan] ` and the
  // copy payload includes a `Mode: plan` directive. Agent reads either signal and discusses
  // first instead of drifting immediately.
  const [pendingPlanMode, setPendingPlanMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('driftgrid:pendingPlanMode') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingPlanMode) window.sessionStorage.setItem('driftgrid:pendingPlanMode', '1');
    else window.sessionStorage.removeItem('driftgrid:pendingPlanMode');
  }, [pendingPlanMode]);
  // Attach-screenshot toggle — off by default, persisted to localStorage so opt-in
  // sticks across sessions for users who want it on by default.
  const [pendingAttachScreenshot, setPendingAttachScreenshot] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('driftgrid:attachScreenshot') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingAttachScreenshot) window.localStorage.setItem('driftgrid:attachScreenshot', '1');
    else window.localStorage.removeItem('driftgrid:attachScreenshot');
  }, [pendingAttachScreenshot]);

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

  // Build the agent-ready message for an existing annotation. When the thread has a
  // trailing non-agent reply (designer followed up on the agent's response), lead with
  // that reply as the CURRENT REQUEST and push everything else — including the agent's
  // prior "done" message — into a PRIOR THREAD context block. This stops the agent from
  // re-acting on the original prompt and focuses it on the latest turn.
  const buildAnnotationAgentMessage = useCallback((annotation: Annotation, pendingReply?: string) => {
    const lines: string[] = [];
    // Strip `[plan] ` prefix from displayed body — the directive is hoisted into the header.
    const isPlan = /^\s*\[plan\]\s*/i.test(annotation.text);
    const cleanText = isPlan ? annotation.text.replace(/^\s*\[plan\]\s*/i, '') : annotation.text;
    const trimmedPending = pendingReply?.trim() || '';
    // Detect follow-up turn early so the banner can lead the message — agents tend
    // to skim and re-execute the original prompt if context lands first.
    const repliesPreCheck = repliesByParent[annotation.id] || [];
    const lastReplyPreCheck = repliesPreCheck[repliesPreCheck.length - 1];
    const isFollowUp = !!trimmedPending || (lastReplyPreCheck && !lastReplyPreCheck.isAgent);
    if (isFollowUp) {
      const priorTurns = 1 + (trimmedPending ? repliesPreCheck.length : repliesPreCheck.length - 1);
      lines.push('################################################################');
      lines.push(`#  FOLLOW-UP TURN — ${priorTurns} earlier turn${priorTurns === 1 ? '' : 's'} already complete.`);
      lines.push('#  Act ONLY on the CURRENT REQUEST below. Do NOT re-execute the');
      lines.push('#  original prompt or any prior turn — those are context only.');
      lines.push('################################################################');
      lines.push('');
    }
    if (annotation.provider) {
      lines.push(`Routed to: ${annotation.provider}`);
    }
    if (isPlan) {
      lines.push(`Mode: plan (discuss in chat first; do NOT edit files yet)`);
    }
    if (frameContext) {
      lines.push(`Slide: ${frameContext.conceptLabel} v${frameContext.versionNumber} — ${frameContext.filePath}`);
    }
    if (annotation.x !== null && annotation.y !== null) {
      const xPct = Math.round(annotation.x * 100);
      const yPct = Math.round(annotation.y * 100);
      lines.push(`Pin: (${xPct}%, ${yPct}%)`);
    }
    lines.push(`Annotation ID: ${annotation.id}`);
    lines.push('');

    const replies = repliesByParent[annotation.id] || [];
    const lastReply = replies[replies.length - 1];
    // "Current request" = either an unsaved pending reply (just typed in the box) or the last saved
    // designer reply (if the agent hasn't responded to it yet). Pending takes priority.
    const hasNewRequest = !!trimmedPending || (lastReply && !lastReply.isAgent);

    if (hasNewRequest) {
      // Banner already pushed at the top of the message. Lead with the request itself,
      // then push all prior context to the bottom under hard dividers.
      const priorReplies = trimmedPending ? replies : replies.slice(0, -1);
      lines.push('▶ CURRENT REQUEST (act on this):');
      lines.push('');
      lines.push(trimmedPending || lastReply.text);
      lines.push('');
      lines.push('────────────────────────────────────────────────────────────────');
      lines.push('PRIOR THREAD — already addressed, DO NOT REDO:');
      lines.push('────────────────────────────────────────────────────────────────');
      lines.push(`[1] designer (original ask): ${cleanText}`);
      priorReplies.forEach((r, i) => {
        const who = r.isAgent ? 'agent (already done)' : (r.author || 'reply');
        lines.push(`[${i + 2}] ${who}: ${r.text}`);
      });
      lines.push('────────────────────────────────────────────────────────────────');
      lines.push('END PRIOR THREAD. Scroll up — the CURRENT REQUEST is the only thing to act on.');
    } else {
      // No replies, or the agent had the last word — show original as the focus.
      lines.push(`> ${cleanText.split('\n').join('\n> ')}`);
      if (replies.length > 0) {
        lines.push('');
        for (const r of replies) {
          const who = r.isAgent ? 'Agent' : (r.author || 'Reply');
          lines.push(`↳ ${who}: ${r.text}`);
        }
      }
    }

    if (frameContext?.client && frameContext.project && frameContext.conceptId && frameContext.versionId) {
      lines.push('');
      lines.push('---');
      lines.push(`Frame URL: http://localhost:3000/admin/${frameContext.client}/${frameContext.project}#${frameContext.conceptId}/v${frameContext.versionNumber}`);
      lines.push('');
      lines.push('After applying the change, reply to this prompt by POSTing to');
      lines.push('http://localhost:3000/api/annotations with:');
      lines.push('  {');
      lines.push(`    "client": "${frameContext.client}",`);
      lines.push(`    "project": "${frameContext.project}",`);
      lines.push(`    "conceptId": "${frameContext.conceptId}",`);
      lines.push(`    "versionId": "${frameContext.versionId}",`);
      lines.push(`    "parentId": "${annotation.id}",`);
      lines.push(`    "text": "<brief summary of what you changed>",`);
      if (annotation.provider) {
        lines.push(`    "author": "${annotation.provider}",`);
      }
      lines.push(`    "isAgent": true`);
      lines.push('  }');
      lines.push('');
      lines.push('When done, echo BOTH the absolute filepath and http://localhost:3000/admin/... URL back to the designer in your chat reply (per AGENTS.md "Always Echo the Version Reference").');
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

  // Track iframe scroll + content size when in scrollable mode so pins stick to document content.
  // Re-attaches whenever the iframe document is replaced (src change → new contentDocument).
  useEffect(() => {
    if (!scrollable || !iframeEl) {
      setIframeGeom(null);
      return;
    }

    let attachedDoc: Document | null = null;
    let attachedWin: Window | null = null;
    let resizeObs: ResizeObserver | null = null;
    let rafId = 0;

    const sample = () => {
      const win = iframeEl.contentWindow;
      const doc = iframeEl.contentDocument;
      if (!win || !doc) return;
      const root = doc.documentElement;
      const body = doc.body;
      // Use the larger of documentElement/body — varies across pages depending on which scrolls.
      const scrollWidth = Math.max(root?.scrollWidth ?? 0, body?.scrollWidth ?? 0, iframeEl.clientWidth);
      const scrollHeight = Math.max(root?.scrollHeight ?? 0, body?.scrollHeight ?? 0, iframeEl.clientHeight);
      setIframeGeom({
        scrollX: win.scrollX || 0,
        scrollY: win.scrollY || 0,
        scrollWidth,
        scrollHeight,
      });
    };

    const onScroll = () => {
      // Coalesce to next frame so we don't thrash React on every scroll tick.
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        sample();
      });
    };

    const detach = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (attachedWin) attachedWin.removeEventListener('scroll', onScroll);
      if (resizeObs) resizeObs.disconnect();
      attachedWin = null;
      attachedDoc = null;
      resizeObs = null;
    };

    const attach = () => {
      detach();
      try {
        const win = iframeEl.contentWindow;
        const doc = iframeEl.contentDocument;
        if (!win || !doc) return;
        attachedWin = win;
        attachedDoc = doc;
        win.addEventListener('scroll', onScroll, { passive: true });
        // Track content size changes (responsive reflow, font load, image load) so pins stay aligned.
        if (typeof ResizeObserver !== 'undefined' && doc.documentElement) {
          resizeObs = new ResizeObserver(() => sample());
          resizeObs.observe(doc.documentElement);
          if (doc.body) resizeObs.observe(doc.body);
        }
        sample();
      } catch {
        // cross-origin — give up, pins fall back to viewport-relative behavior
      }
    };

    attach();
    // Re-attach when iframe loads new content (src change / SPA navigation inside the iframe).
    iframeEl.addEventListener('load', attach);
    // Also re-sample when the iframe element itself resizes (parent layout change).
    const elObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sample()) : null;
    if (elObs) elObs.observe(iframeEl);

    return () => {
      iframeEl.removeEventListener('load', attach);
      if (elObs) elObs.disconnect();
      detach();
    };
  }, [scrollable, iframeEl]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isCapturing) return;
      // Don't place pins when clicking on existing pins or popups
      if ((e.target as HTMLElement).closest('[data-annotation-pin]') || (e.target as HTMLElement).closest('[data-annotation-popup]')) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Click position relative to overlay (== iframe rect for both locked and responsive canvases).
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      let relativeX: number;
      let relativeY: number;
      if (scrollable && iframeGeom && iframeGeom.scrollWidth > 0 && iframeGeom.scrollHeight > 0) {
        // Store as fraction of the document's full scroll dimensions, including current scroll offset,
        // so the pin sticks to document content rather than the viewport.
        relativeX = (localX + iframeGeom.scrollX) / iframeGeom.scrollWidth;
        relativeY = (localY + iframeGeom.scrollY) / iframeGeom.scrollHeight;
      } else {
        relativeX = localX / rect.width;
        relativeY = localY / rect.height;
      }

      setPendingPin({ x: relativeX, y: relativeY });
      setPendingText('');
      setActivePin(null);
    },
    [isCapturing, scrollable, iframeGeom]
  );

  // Re-entry guard — prevents rapid clicks (or held Enter) from POSTing the same prompt N times.
  const inFlightRef = useRef(false);

  // Save pending prompt. Returns the saved annotation (so Copy can grab its ID).
  // Does NOT close the popup — the caller controls when to close so success feedback ("Copied")
  // has a chance to render before the popup unmounts.
  // If `pendingPlanMode` is on, the saved text is prefixed with `[plan] ` so any agent reading
  // it (via clipboard, manifest, or future MCP) sees the plan-first directive baked in.
  const handleSubmitPending = useCallback(async (): Promise<Annotation | null> => {
    if (inFlightRef.current) return null;
    if (!pendingPin || !pendingText.trim()) return null;
    inFlightRef.current = true;
    try {
      const trimmed = pendingText.trim();
      const text = pendingPlanMode && !trimmed.startsWith('[plan]') ? `[plan] ${trimmed}` : trimmed;
      const result = await Promise.resolve(onAdd(pendingPin.x, pendingPin.y, text, pendingProvider));
      return (result as Annotation | null | undefined) ?? null;
    } finally {
      inFlightRef.current = false;
    }
  }, [pendingPin, pendingText, onAdd, pendingProvider, pendingPlanMode]);

  // Copy = save + copy the full payload (slide context, pin, annotation ID, reply-back instructions).
  // Order matters: clipboard.writeText needs document focus, so it has to run BEFORE we close
  // the popup. The popup close is delayed so the user actually sees the "Copied" label.
  const handleCopyForAgent = useCallback(async () => {
    if (!pendingText.trim()) return;
    const saved = await handleSubmitPending();
    if (!saved) return;
    // Optionally capture a screenshot of the current frame and stash the path on
    // the annotation. Done before building the message so the path can be
    // appended to the agent payload.
    let screenshotPath: string | null = null;
    if (
      pendingAttachScreenshot &&
      frameContext?.client && frameContext.project && frameContext.conceptId && frameContext.versionId
    ) {
      try {
        const r = await fetch('/api/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client: frameContext.client,
            project: frameContext.project,
            conceptId: frameContext.conceptId,
            versionId: frameContext.versionId,
            annotationId: saved.id,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          screenshotPath = data.path ?? null;
        }
      } catch { /* swallow — copy still works without the screenshot */ }
    }
    let message = buildAnnotationAgentMessage(saved);
    if (screenshotPath) {
      message += `\n\nScreenshot: ${screenshotPath}\n(Open this with your file tool to see what the designer was looking at.)`;
    }
    try {
      await navigator.clipboard?.writeText(message);
    } catch {
      // clipboard may fail silently
    }
    // Mark the thread as submitted so the comments hub knows the agent has it.
    if (frameContext?.client && frameContext.project && frameContext.conceptId && frameContext.versionId) {
      fetch('/api/annotations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: frameContext.client,
          project: frameContext.project,
          conceptId: frameContext.conceptId,
          versionId: frameContext.versionId,
          annotationId: saved.id,
          submittedAt: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
    setCopyState('copied');
    toast('Copied — paste into your agent');
    // Hold the popup open briefly so the success state is visible, then close it cleanly.
    window.setTimeout(() => {
      setPendingPin(null);
      setPendingText('');
      setCopyState('idle');
    }, 600);
  }, [pendingText, handleSubmitPending, buildAnnotationAgentMessage, pendingAttachScreenshot, frameContext]);

  const handlePinClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setActivePin(prev => (prev === id ? null : id));
      setPendingPin(null);
      setPendingText('');
    },
    []
  );

  // Measure the active pin's viewport position and pick the side with more room.
  // Re-runs on window resize so the popup stays on-screen after the frame reflows.
  useLayoutEffect(() => {
    if (!activePin) {
      setPopupMetrics(null);
      return;
    }
    const PIN_OFFSET = 22;   // gap between pin and popup
    const VIEWPORT_MARGIN = 16;
    const MIN_HEIGHT = 180;
    const MAX_HEIGHT = 560;
    const compute = () => {
      const pinEl = pinRefs.current.get(activePin);
      if (!pinEl) return;
      const rect = pinEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - PIN_OFFSET - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - PIN_OFFSET - VIEWPORT_MARGIN;
      const placement: 'above' | 'below' = spaceBelow >= spaceAbove ? 'below' : 'above';
      const available = placement === 'below' ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(MIN_HEIGHT, Math.min(available, MAX_HEIGHT));
      setPopupMetrics({ placement, maxHeight });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
    // iframeGeom is included so the popup re-anchors when the iframe scrolls (scroll events on the iframe's
    // contentWindow don't bubble out to the parent window, so the listener above can't catch them).
  }, [activePin, iframeGeom]);

  // Translate stored x/y fractions to absolute CSS positioning for a pin.
  // Locked canvases: percentage of the overlay (== canvas) — unchanged.
  // Scrollable canvases: pixel offset within the document, translated by current scroll so pins move with content.
  const pinPosition = useCallback((x: number, y: number): { left: string; top: string } => {
    if (scrollable && iframeGeom && iframeGeom.scrollWidth > 0 && iframeGeom.scrollHeight > 0) {
      const left = x * iframeGeom.scrollWidth - iframeGeom.scrollX;
      const top = y * iframeGeom.scrollHeight - iframeGeom.scrollY;
      return { left: `${left}px`, top: `${top}px` };
    }
    return { left: `${x * 100}%`, top: `${y * 100}%` };
  }, [scrollable, iframeGeom]);

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
        // Clip pins that have scrolled outside the visible iframe viewport.
        overflow: 'hidden',
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
            {isClient ? 'Add Comment' : 'Place Prompt'}
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
        // Resolved pins are hidden until comment mode is toggled on
        if (annotation.resolved && !annotationMode) return null;
        const isActive = activePin === annotation.id;
        const popupPos = isActive && popupMetrics ? popupMetrics.placement : (annotation.y > 0.5 ? 'above' : 'below');
        const popupMaxHeight = isActive && popupMetrics ? popupMetrics.maxHeight : 420;
        const replies = repliesByParent[annotation.id] || [];
        const isLocked = replies.length > 0;
        const pinState = derivePinState(annotation, replies);
        // Round-wide number if available; fall back to per-frame index for legacy callers.
        const pinNumber = pinNumberByAnnotationId?.[annotation.id] ?? (index + 1);

        const pinPos = pinPosition(annotation.x, annotation.y);
        return (
          <div
            key={annotation.id}
            data-annotation-pin
            style={{
              position: 'absolute',
              left: pinPos.left,
              top: pinPos.top,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isActive ? 15 : 12,
            }}
          >
            {/* Pin circle */}
            <button
              ref={(el) => {
                if (el) pinRefs.current.set(annotation.id, el);
                else pinRefs.current.delete(annotation.id);
              }}
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
                background: annotation.isClient
                  ? (isClient ? 'var(--accent-orange)' : '#06b6d4')
                  : PIN_BG_BY_STATE[pinState],
                opacity: annotation.resolved ? 0.3 : 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s ease, opacity 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
              title={[
                `#${pinNumber}`,
                pinState === 'open' ? 'Open — not yet sent to agent' :
                  pinState === 'in-progress' ? 'In progress — sent, awaiting reply' :
                  pinState === 'replied' ? 'Replied' : 'Closed',
                annotation.provider ? `Routed to ${annotation.provider}` : null,
              ].filter(Boolean).join(' · ')}
            >
              {pinNumber}
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
                  maxHeight: popupMaxHeight,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
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
                {/* Eyebrow — COMMENT · author. Sticky to the popup top so the close (×) is always reachable while scrolling long threads. */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'sticky',
                    top: -14,
                    margin: '-14px -14px 8px -14px',
                    padding: '14px 14px 8px 14px',
                    background: 'rgba(20, 20, 20, 0.95)',
                    backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    zIndex: 2,
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
                    {annotation.resolved ? 'Resolved' : (isClient ? 'Comment' : 'Prompt')} · {annotation.isClient ? annotation.author : 'designer'}
                  </span>
                  {/* Close icon — universal (designer + client). Closes popup, never deletes. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePin(null);
                    }}
                    title="Close (Esc)"
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
                      (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)';
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

                {/* Designer reply input — post a follow-up, then hit Copy for the full thread */}
                {!isClient && onReply && (
                  <div style={{ marginTop: 10 }}>
                    <input
                      type="text"
                      placeholder="Reply to agent…"
                      value={replyDrafts[annotation.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts(prev => ({ ...prev, [annotation.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          const draft = (replyDrafts[annotation.id] || '').trim();
                          if (!draft) return;
                          e.preventDefault();
                          onReply(annotation.id, draft);
                          setReplyDrafts(prev => ({ ...prev, [annotation.id]: '' }));
                        }
                        e.stopPropagation();
                      }}
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 5,
                        padding: '6px 8px',
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: 12,
                        color: '#fff',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}

                {/* Actions row — client gets a minimal view, designer gets full controls */}
                {isClient ? (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
                      {new Date(annotation.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {annotation.resolved && ' · resolved'}
                    </div>
                    {(isAdmin ||
                      (!!currentAuthor && !!annotation.author &&
                       currentAuthor.trim().toLowerCase() === annotation.author.trim().toLowerCase())) && (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(annotation.id);
                          setActivePin(null);
                        }}
                        title="Delete your comment"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: 'rgba(255,255,255,0.35)',
                          transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = '#ef4444';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      {/* Left group — secondary actions (delete, resolve) */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {/* Trash — delete */}
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(annotation.id);
                            setActivePin(null);
                          }}
                          title="Delete prompt"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 5,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'rgba(255,255,255,0.35)',
                            transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.color = '#ef4444';
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)';
                            (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                        {/* Resolve — checkmark icon, same footprint as trash */}
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onResolve(annotation.id);
                          }}
                          title={annotation.resolved ? 'Unresolve' : 'Resolve'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 5,
                            border: annotation.resolved
                              ? '1px solid rgba(34,197,94,0.3)'
                              : '1px solid rgba(255,255,255,0.08)',
                            background: annotation.resolved
                              ? 'rgba(34,197,94,0.12)'
                              : 'transparent',
                            cursor: 'pointer',
                            color: annotation.resolved
                              ? 'rgba(74,222,128,0.9)'
                              : 'rgba(255,255,255,0.35)',
                            transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (annotation.resolved) return;
                            (e.currentTarget as HTMLElement).style.color = 'rgba(74,222,128,0.9)';
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,197,94,0.3)';
                            (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.08)';
                          }}
                          onMouseLeave={(e) => {
                            if (annotation.resolved) return;
                            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {/* Screenshot toggle — same opt-in as new-prompt popup, shared state */}
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); setPendingAttachScreenshot(v => !v); }}
                          title={pendingAttachScreenshot
                            ? 'Screenshot will be captured and path included in the agent payload'
                            : 'Toggle: include a screenshot of this frame in the agent payload'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '4px 7px',
                            borderRadius: 4,
                            border: '1px solid ' + (pendingAttachScreenshot ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'),
                            background: pendingAttachScreenshot ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: pendingAttachScreenshot ? '#fff' : 'rgba(255,255,255,0.45)',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 9,
                            letterSpacing: '0.06em',
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="5" width="18" height="14" rx="2" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Pick up an unsaved draft from the "Reply to agent…" input — include it
                            // as the CURRENT REQUEST in the copied message AND persist it as a real
                            // reply so the thread reflects what was sent to the agent.
                            const draft = (replyDrafts[annotation.id] || '').trim();
                            // Optionally capture a screenshot first.
                            let screenshotPath: string | null = null;
                            if (
                              pendingAttachScreenshot &&
                              frameContext?.client && frameContext.project && frameContext.conceptId && frameContext.versionId
                            ) {
                              try {
                                const r = await fetch('/api/screenshot', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    client: frameContext.client,
                                    project: frameContext.project,
                                    conceptId: frameContext.conceptId,
                                    versionId: frameContext.versionId,
                                    annotationId: annotation.id,
                                  }),
                                });
                                if (r.ok) {
                                  const data = await r.json();
                                  screenshotPath = data.path ?? null;
                                }
                              } catch { /* swallow — copy still works without */ }
                            }
                            let message = buildAnnotationAgentMessage(annotation, draft);
                            if (screenshotPath) {
                              message += `\n\nScreenshot: ${screenshotPath}\n(Open this with your file tool to see what the designer was looking at.)`;
                            }
                            navigator.clipboard?.writeText(message).catch(() => {});
                            if (draft && onReply) {
                              onReply(annotation.id, draft);
                              setReplyDrafts(prev => ({ ...prev, [annotation.id]: '' }));
                            }
                            // Mark the thread as freshly submitted to the agent.
                            if (frameContext?.client && frameContext.project && frameContext.conceptId && frameContext.versionId) {
                              fetch('/api/annotations', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  client: frameContext.client,
                                  project: frameContext.project,
                                  conceptId: frameContext.conceptId,
                                  versionId: frameContext.versionId,
                                  annotationId: annotation.id,
                                  submittedAt: new Date().toISOString(),
                                }),
                              }).catch(() => {});
                            }
                            toast('Copied — paste into your agent');
                            setActivePin(null);
                          }}
                          title="Copy prompt + context + reply-back instructions for the agent"
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
                          Copy for Agent
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); handleSendToAgent(); }}
                          title="Send to Agent (coming soon — requires MCP)"
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
                      </div>
                    </div>
                    {/* Helper microcopy — explains what Copy does */}
                    <div
                      style={{
                        marginTop: 8,
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 9,
                        lineHeight: 1.5,
                        color: 'rgba(255,255,255,0.25)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      Copy includes the prompt, context, and reply instructions — paste into your agent chat.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pending pin (new annotation input) */}
      {pendingPin && (() => {
        const pendingPos = pinPosition(pendingPin.x, pendingPin.y);
        return (
        <div
          data-annotation-popup
          style={{
            position: 'absolute',
            left: pendingPos.left,
            top: pendingPos.top,
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
            {/* Header — eyebrow + close (×) */}
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
                  color: 'rgba(255,255,255,0.35)',
                }}
              >
                {isClient ? 'Comment' : 'Prompt'}
              </span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingPin(null);
                  setPendingText('');
                }}
                title="Close (Esc)"
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
                  color: 'rgba(255,255,255,0.35)',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <textarea
              ref={inputRef}
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCopyForAgent();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPendingPin(null);
                  setPendingText('');
                }
                // Stop propagation so keyboard shortcuts don't fire
                e.stopPropagation();
              }}
              placeholder={isClient ? 'Leave a note…' : 'Tell the agent…'}
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
            {/* Provider routing pills — designer mode only. Click active pill to clear (= "any agent"). */}
            {!isClient && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 8,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)',
                    marginRight: 4,
                  }}
                >
                  For
                </span>
                {(['claude', 'codex', 'gemini'] as const).map((p) => {
                  const active = pendingProvider === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingProvider(active ? undefined : p);
                        inputRef.current?.focus();
                      }}
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        textTransform: 'capitalize',
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: '1px solid ' + (active ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'),
                        background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                        cursor: 'pointer',
                        transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Plan-first toggle — designer mode only. When on, the saved text is prefixed with
                `[plan] ` and the copy payload tells the agent to discuss before drifting. */}
            {!isClient && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 8,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.3)',
                    marginRight: 4,
                  }}
                >
                  Mode
                </span>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingPlanMode(v => !v);
                    inputRef.current?.focus();
                  }}
                  title="When on, the agent discusses options in chat before drifting"
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    textTransform: 'capitalize',
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid ' + (pendingPlanMode ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'),
                    background: pendingPlanMode ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: pendingPlanMode ? '#fff' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
                  }}
                >
                  Plan first
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingAttachScreenshot(v => !v);
                    inputRef.current?.focus();
                  }}
                  title="When on, capture a PNG of this frame and include the path in the agent payload"
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    textTransform: 'capitalize',
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid ' + (pendingAttachScreenshot ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'),
                    background: pendingAttachScreenshot ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: pendingAttachScreenshot ? '#fff' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Screenshot
                </button>
              </div>
            )}
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
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleSubmitPending();
                    // Client mode has no copy step — close the popup directly.
                    setPendingPin(null);
                    setPendingText('');
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
                    }}
                    disabled={!pendingText.trim()}
                    title="Save + copy for agent (↵)"
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '5px 12px',
                      borderRadius: 5,
                      border: 'none',
                      background: copyState === 'copied'
                        ? 'rgba(34,197,94,0.12)'
                        : (pendingText.trim() ? '#fff' : 'rgba(255,255,255,0.1)'),
                      color: copyState === 'copied'
                        ? 'rgba(74,222,128,0.9)'
                        : (pendingText.trim() ? '#000' : 'rgba(255,255,255,0.2)'),
                      cursor: pendingText.trim() ? 'pointer' : 'default',
                      fontWeight: 600,
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {copyState === 'copied' ? 'Copied' : 'Copy for Agent'}
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); handleSendToAgent(); inputRef.current?.focus(); }}
                    title="Send to Agent (coming soon — requires MCP)"
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
            {/* Helper microcopy — below the buttons, describes Copy */}
            {!isClient && (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 9,
                  lineHeight: 1.5,
                  color: 'rgba(255,255,255,0.3)',
                  letterSpacing: '0.02em',
                }}
              >
                Hit RETURN to copy. Copy includes the prompt + slide context — paste into your agent chat.
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Resolved-count indicator — reminds the designer there's buried history on this slide */}
      {(() => {
        if (annotationMode) return null;
        const resolvedCount = annotations.filter(a => !a.parentId && a.resolved).length;
        if (resolvedCount === 0) return null;
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(0,0,0,0.3)',
              pointerEvents: 'none',
            }}
          >
            {resolvedCount} resolved
          </div>
        );
      })()}
    </div>
  );
}
