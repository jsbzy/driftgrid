'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import type { Annotation, Concept } from '@/lib/types';
import { HtmlFrame } from './HtmlFrame';
import { AnnotationOverlay } from './AnnotationOverlay';
import { ClientCommentsHub } from './ClientCommentsHub';
import { ClientNamePrompt } from './ClientNamePrompt';
import { ToastContainer } from './Toast';
import type { useClientComments } from '@/lib/hooks/useClientComments';

type ClientCommentsApi = ReturnType<typeof useClientComments>;

interface MobileClientViewerProps {
  projectName: string;
  /** Starred-filtered concepts (already round-scoped + starred-filtered in Viewer). */
  concepts: Concept[];
  conceptIndex: number;
  versionIndex: number;
  /** URL-hash-syncing navigation from Viewer (handleNavigate). */
  onNavigate: (ci: number, vi: number) => void;
  // Annotation wiring — already resolved to the share/client handlers in Viewer.
  annotations: Annotation[];
  annotationMode: boolean;
  setAnnotationMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  onAddAnnotation: (x: number | null, y: number | null, text: string, provider?: string) => Promise<Annotation | null> | void;
  onDeleteAnnotation: (id: string) => void;
  onResolveAnnotation: (id: string) => void;
  onReplyAnnotation?: (parentId: string, text: string, asAgent?: boolean) => void;
  pinNumberByAnnotationId?: Record<string, number>;
  clientComments: ClientCommentsApi;
  client: string;
  project: string;
  shareToken?: string;
  // Resolved canvas + sources (computed in Viewer).
  canvasWidth: number;
  canvasHeight?: number;
  responsive: boolean;
  htmlSrc: string;
  thumbSrc: string | null;
}

/**
 * Mobile client/share review shell. Rendered only when `isMobile && mode==='client'`
 * (see Viewer's early return). Designers never see this — it has no canvas
 * pan/zoom, no keyboard shortcuts, no right-click menus.
 *
 * Layout (100dvh column):
 *   - sticky top bar: project name + select pager (prev/next + position) + comments FAB
 *   - frame area (flex:1): the current design via mobile HtmlFrame + sheet AnnotationOverlay
 *   - bottom toolbar: Comment toggle · All designs
 *
 * All data logic stays in Viewer; this component only presents already-computed
 * values and drives navigation through onNavigate (which keeps the URL hash in
 * sync for deep links + refresh).
 */
export function MobileClientViewer({
  projectName,
  concepts,
  conceptIndex,
  versionIndex,
  onNavigate,
  annotations,
  annotationMode,
  setAnnotationMode,
  onAddAnnotation,
  onDeleteAnnotation,
  onResolveAnnotation,
  onReplyAnnotation,
  pinNumberByAnnotationId,
  clientComments,
  client,
  project,
  shareToken,
  canvasWidth,
  canvasHeight,
  // `responsive` is still passed by Viewer but no longer drives layout here:
  // the scale mode is derived purely from whether canvasHeight is a real number
  // (deck → locked) vs absent (web/auto → scale-to-fit). Kept on the interface
  // for callers; intentionally not destructured.
  htmlSrc,
  thumbSrc,
}: MobileClientViewerProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [frameIframeEl, setFrameIframeEl] = useState<HTMLIFrameElement | null>(null);
  // Scale-to-fit designs (auto-height / web): the design is rendered at native
  // width and scaled down, so it's taller than the screen. HtmlFrame measures
  // the on-screen height of the scaled strip and reports it here; we size a
  // scroll wrapper + the annotation overlay to it so pins anchor to the design.
  const [scaledHeight, setScaledHeight] = useState(0);

  // Web/auto-height designs (no fixed canvas height) get the scale-to-fit-width
  // treatment: native-width render scaled down, scrolled vertically by the outer
  // container, pins positioned by percentage of the full scaled design. Decks
  // (fixed numeric height) keep the existing locked-canvas behavior.
  const scaleToFit = canvasHeight == null;

  // One-time "pinch to zoom" hint for scale-to-fit designs (they render small to
  // fit the phone width; pinch-zoom lets the client read fine print). Shows once
  // ever per device, fades on first scroll or after a few seconds. Dismissal
  // persists in localStorage so it never nags on return visits.
  //
  // `hintEligible` is decided once from localStorage in a lazy initializer
  // (client-only component, so window is available and there's no SSR mismatch);
  // `pinchHint` is the live visibility. The effect only ever calls setState from
  // inside a timer/handler — never synchronously in its body — so it doesn't
  // trigger cascading renders.
  const [hintEligible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('driftgrid:pinchHintSeen') !== '1';
  });
  const [pinchHint, setPinchHint] = useState(false);
  useEffect(() => {
    if (!scaleToFit || !hintEligible) return;
    const show = window.setTimeout(() => setPinchHint(true), 0); // defer out of effect body
    const hide = window.setTimeout(() => setPinchHint(false), 4200);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, [scaleToFit, hintEligible]);
  const dismissPinchHint = useCallback(() => {
    setPinchHint(false);
    try { window.localStorage.setItem('driftgrid:pinchHintSeen', '1'); } catch { /* private mode */ }
  }, []);

  // Flatten the starred selects into a single ordered list so a prev/next pager
  // can step across concept + version boundaries. Each entry is one frame.
  const selects = useMemo(() => {
    const out: { ci: number; vi: number }[] = [];
    concepts.forEach((c, ci) => {
      c.versions.forEach((_, vi) => out.push({ ci, vi }));
    });
    return out;
  }, [concepts]);

  const currentSelectIndex = useMemo(
    () => selects.findIndex(s => s.ci === conceptIndex && s.vi === versionIndex),
    [selects, conceptIndex, versionIndex]
  );
  // Guard: if the current indices aren't in the list (edge case), treat as first.
  const safeIndex = currentSelectIndex >= 0 ? currentSelectIndex : 0;

  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(selects.length - 1, index));
    const target = selects[clamped];
    if (target) onNavigate(target.ci, target.vi);
  }, [selects, onNavigate]);

  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);
  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);
  const goFirst = useCallback(() => goTo(0), [goTo]);

  const currentConcept = concepts[conceptIndex];
  const currentVersion = currentConcept?.versions[versionIndex];

  // Scroll the frame back to the top whenever the select changes, so each design
  // starts from its header rather than wherever the previous one was scrolled to.
  // (The stale scaled height resets itself: HtmlFrame remounts on key={htmlSrc}
  // and re-reports onScaledHeight(0) until the new design is measured.)
  useEffect(() => {
    try {
      frameIframeEl?.contentWindow?.scrollTo(0, 0);
    } catch { /* cross-origin — ignore */ }
    // Reset the outer scroll container (scale-to-fit + locked/deck both scroll here).
    const el = document.getElementById('mcv-frame-scroll');
    if (el) el.scrollTop = 0;
  }, [conceptIndex, versionIndex, frameIframeEl]);

  // Open-count for the FAB badge — top-level, unresolved client comments.
  const openCount = clientComments.comments.filter(
    c => !c.parent_comment_id && c.status !== 'resolved'
  ).length;

  // Name prompt — first visit to a share link (mirrors Viewer's gating).
  const namePrompt = shareToken && clientComments.needsName
    ? <ClientNamePrompt onSubmit={clientComments.setAuthorName} />
    : null;

  const total = selects.length;
  const positionLabel = total > 0 ? `${safeIndex + 1} / ${total}` : '0 / 0';

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        overflow: 'hidden',
      }}
    >
      {namePrompt}

      {/* ===== Top bar: project + pager + comments FAB ===== */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
          zIndex: 20,
        }}
      >
        {/* Project name + current select label */}
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {projectName}
          </span>
          {currentConcept && currentVersion && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentConcept.label} · v{currentVersion.number}
            </span>
          )}
        </div>

        {/* Comments drawer FAB — bubble + open-count badge */}
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          aria-label={`Comments${openCount > 0 ? ` (${openCount} open)` : ''}`}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            flexShrink: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {openCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 8,
              background: 'var(--accent-orange)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}>{openCount}</span>
          )}
        </button>
      </div>

      {/* ===== Sticky pager: prev / position / next ===== */}
      {total > 1 && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '6px 12px',
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            color: '#fff',
            zIndex: 19,
          }}
        >
          <button
            type="button"
            onClick={goPrev}
            disabled={safeIndex <= 0}
            aria-label="Previous design"
            style={pagerBtnStyle(safeIndex <= 0)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Prev
          </button>
          <span style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
            {positionLabel}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={safeIndex >= total - 1}
            aria-label="Next design"
            style={pagerBtnStyle(safeIndex >= total - 1)}
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {/* ===== Frame area (scrolls the design) =====
          Scale-to-fit designs: this is the vertical scroll container; the design
          is a native-width render scaled down (taller than the screen). Decks
          (fixed height): no outer scroll — the design fits or HtmlFrame's locked
          path scrolls itself, matching the shipped behavior. */}
      <div
        id="mcv-frame-scroll"
        onScroll={pinchHint ? dismissPinchHint : undefined}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          background: '#fff',
          ...(scaleToFit
            ? { overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' as const }
            : null),
        }}
      >
        {!currentVersion?.file ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.5 }}>
              Empty slot
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.6 }}>
              Nothing here yet.
            </div>
          </div>
        ) : (
          // One relative wrapper holds BOTH the scaled frame and the overlay so
          // pins anchor to the design and scroll with it. Scale-to-fit: height =
          // the reported scaled height (the scrollable content box; falls back to
          // 100% until measured). Decks: 100% — HtmlFrame's locked path manages
          // its own fit + scroll inside.
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: scaleToFit ? (scaledHeight || '100%') : '100%',
            }}
          >
            <HtmlFrame
              key={htmlSrc}
              src={htmlSrc}
              placeholder={thumbSrc}
              borderless
              mobile
              // Always pass the NATIVE width. Height only for decks (a real
              // number) → HtmlFrame's locked path. Auto-height → undefined →
              // HtmlFrame's scale-to-fit-width path.
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              onIframeRef={setFrameIframeEl}
              onScaledHeight={setScaledHeight}
            />
            {currentConcept && currentVersion && (
              <AnnotationOverlay
                annotations={annotations}
                annotationMode={annotationMode}
                viewMode="client"
                currentAuthor={clientComments.authorName}
                isAdmin={clientComments.isAdmin}
                onAdd={onAddAnnotation}
                onDelete={onDeleteAnnotation}
                onResolve={onResolveAnnotation}
                onReply={onReplyAnnotation}
                frameContext={{
                  client,
                  project,
                  conceptId: currentConcept.id,
                  versionId: currentVersion.id,
                  conceptLabel: currentConcept.label,
                  versionNumber: currentVersion.number,
                  filePath: `~/driftgrid/projects/${client}/${project}/${currentVersion.file}`,
                }}
                // Both remaining modes position pins by PERCENTAGE of this
                // wrapper (scrollable=false): scale-to-fit pins are % of the full
                // scaled design and scroll with the outer container natively;
                // deck pins are % of the fitted canvas. No iframe scroll-tracking.
                scrollable={false}
                iframeEl={frameIframeEl}
                pinNumberByAnnotationId={pinNumberByAnnotationId}
                layout="sheet"
              />
            )}
          </div>
        )}

        {/* One-time pinch-to-zoom hint — fixed above the bottom toolbar, fades on
            first scroll or after a few seconds. Tap to dismiss for good. */}
        {scaleToFit && (
          <button
            type="button"
            onClick={dismissPinchHint}
            aria-hidden={!pinchHint}
            tabIndex={pinchHint ? 0 : -1}
            style={{
              position: 'fixed',
              left: '50%',
              transform: `translateX(-50%) translateY(${pinchHint ? 0 : 8}px)`,
              bottom: 'calc(72px + env(safe-area-inset-bottom))',
              zIndex: 30,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.82)',
              backdropFilter: 'blur(8px)',
              color: 'rgba(255,255,255,0.82)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              opacity: pinchHint ? 1 : 0,
              pointerEvents: pinchHint ? 'auto' : 'none',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11V6a2 2 0 0 1 4 0v5" />
              <path d="M13 11V8a2 2 0 0 1 4 0v3" />
              <path d="M17 11.5V10a2 2 0 0 1 4 0v5a6 6 0 0 1-6 6h-2a7 7 0 0 1-5-2l-3-3a2 2 0 0 1 3-3l1 1" />
            </svg>
            Pinch to zoom
          </button>
        )}
      </div>

      {/* ===== Bottom toolbar: Comment toggle · All designs ===== */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 8,
          padding: '8px 12px calc(8px + env(safe-area-inset-bottom))',
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => setAnnotationMode(v => !v)}
          aria-pressed={annotationMode}
          style={{
            flex: 1,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 12,
            border: '1px solid ' + (annotationMode ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)'),
            background: annotationMode ? 'rgba(255,255,255,0.14)' : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={annotationMode ? 'white' : 'none'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {annotationMode ? 'Tap to place' : 'Comment'}
        </button>
        <button
          type="button"
          onClick={goFirst}
          aria-label="Back to first design"
          style={{
            minHeight: 48,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          All
        </button>
      </div>

      {/* Comments drawer — full-width bottom drawer on mobile */}
      <ClientCommentsHub
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        comments={clientComments.comments}
        concepts={concepts}
        client={client}
        project={project}
        authorName={clientComments.authorName}
        isAdmin={clientComments.isAdmin}
        onJumpTo={(conceptId, versionId) => {
          const ci = concepts.findIndex(c => c.id === conceptId);
          if (ci < 0) return;
          const vi = concepts[ci].versions.findIndex(v => v.id === versionId);
          if (vi < 0) return;
          onNavigate(ci, vi);
        }}
        onResolve={clientComments.resolveComment}
        onDelete={clientComments.deleteComment}
        mobile
      />

      <ToastContainer />
    </div>
  );
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    padding: '0 12px',
    border: 'none',
    background: 'transparent',
    color: disabled ? 'rgba(255,255,255,0.25)' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontWeight: 500,
  };
}
