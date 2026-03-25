'use client';

import { useRef, useEffect, useState, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from 'react';
import type { Concept, Round, ViewMode } from '@/lib/types';
import { computeCanvasLayout, getColumnBounds, getCardBounds } from '@/lib/hooks/useCanvasLayout';
import { useCanvasTransform } from '@/lib/hooks/useCanvasTransform';
import { CanvasCard } from './CanvasCard';
import { ContextMenu } from './ContextMenu';
import type { ZoomLevel } from '@/lib/hooks/useKeyboardNav';

export interface CanvasViewHandle {
  /** Animates the canvas to zoom into a specific card */
  zoomToCard: (ci: number, vi: number) => void;
}

interface CanvasViewProps {
  concepts: Concept[];
  rounds: Round[];
  conceptIndex: number;
  versionIndex: number;
  onSelect: (conceptIndex: number, versionIndex: number) => void;
  onHighlight: (conceptIndex: number, versionIndex: number) => void;
  client: string;
  project: string;
  aspectRatio: string;
  selections: Map<string, string>;
  onStarVersion: (conceptId: string, versionId: string) => void;
  onDeleteVersion: (conceptId: string, versionId: string) => void;
  onDriftVersion: (conceptId: string, versionId: string) => void;
  onBranchVersion: (conceptId: string, versionId: string) => void;
  onMoveConceptLeft: (conceptIdx?: number) => void;
  onMoveConceptRight: (conceptIdx?: number) => void;
  onReorderConcepts: (newOrder: string[]) => void;
  mode?: ViewMode;
  zoomLevel: ZoomLevel;
  onZoomLevelChange: (level: ZoomLevel) => void;
  /** If set, canvas starts zoomed to this card rect (for smooth transition from frame) */
  initialCardBounds?: { x: number; y: number; w: number; h: number } | null;
}

export const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView({
  concepts,
  rounds,
  conceptIndex,
  versionIndex,
  onSelect,
  onHighlight,
  client,
  project,
  aspectRatio,
  selections,
  onStarVersion,
  onDeleteVersion,
  onDriftVersion,
  onBranchVersion,
  onMoveConceptLeft,
  onMoveConceptRight,
  onReorderConcepts,
  mode,
  zoomLevel,
  onZoomLevelChange,
  initialCardBounds,
}, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const [thumbVersion, setThumbVersion] = useState(0);

  // Collapsed rounds state — all rounds collapsed by default
  const [collapsedRounds, setCollapsedRounds] = useState<Set<string>>(new Set());
  const collapsedRoundsInitialized = useRef(false);
  useEffect(() => {
    if (collapsedRoundsInitialized.current) return;
    if (!concepts.length) return;
    // Collect all roundIds that appear in versions
    const roundIds = new Set<string>();
    for (const c of concepts) {
      for (const v of c.versions) {
        if (v.roundId) roundIds.add(v.roundId);
      }
    }
    if (roundIds.size > 0) {
      setCollapsedRounds(roundIds);
      collapsedRoundsInitialized.current = true;
    }
  }, [concepts]);

  const layout = useMemo(
    () => computeCanvasLayout(concepts, aspectRatio, rounds, collapsedRounds),
    [concepts, aspectRatio, rounds, collapsedRounds]
  );
  const {
    transform,
    animating,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    fitAll,
    zoomToRect,
    setTransform,
    isPanning,
    spaceHeld,
    recentlyPanned,
  } = useCanvasTransform(viewportRef);

  const [arrangeMode] = useState(false); // kept for card layer opacity
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ci: number; vi: number } | null>(null);
  // Flag to prevent zoom level effect from firing during the initial card transition
  const skipNextZoomEffect = useRef(false);

  // Expose zoomToCard to parent (Viewer) for smooth enter transitions
  useImperativeHandle(ref, () => ({
    zoomToCard: (ci: number, vi: number) => {
      const bounds = getCardBounds(layout, ci, vi);
      zoomToRect(bounds, 40);
    },
  }), [layout, zoomToRect]);

  // Fit all on mount — or start zoomed to card if transitioning from frame
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || hasInitialized.current) return;
    hasInitialized.current = true;
    if (initialCardBounds) {
      // Start zoomed into the card (no animation) — then the zoom level effect will animate out
      const padding = 40;
      const vpW = el.clientWidth;
      const vpH = el.clientHeight;
      const scale = Math.min(
        (vpW - padding * 2) / initialCardBounds.w,
        (vpH - padding * 2) / initialCardBounds.h,
      );
      const tx = vpW / 2 - (initialCardBounds.x + initialCardBounds.w / 2) * scale;
      const ty = vpH / 2 - (initialCardBounds.y + initialCardBounds.h / 2) * scale;
      setTransform({ scale, tx, ty }, false);
      // After a brief frame, animate to the target zoom level
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (zoomLevel === 'overview') {
            // Compute fitAll transform but apply with animation
            const fitPad = 40;
            const fitScale = Math.min(
              (el.clientWidth - fitPad * 2) / layout.totalWidth,
              (el.clientHeight - fitPad * 2) / layout.totalHeight,
              1,
            );
            const fitTx = (el.clientWidth - layout.totalWidth * fitScale) / 2;
            const fitTy = (el.clientHeight - layout.totalHeight * fitScale) / 2;
            setTransform({ scale: fitScale, tx: fitTx, ty: fitTy }, true);
          } else {
            const bounds = zoomLevel === 'z1' ? getColumnBounds(layout, conceptIndex) : getCardBounds(layout, conceptIndex, versionIndex);
            const pad = zoomLevel === 'z1' ? 40 : zoomLevel === 'z2' ? 30 : zoomLevel === 'z3' ? 20 : 40;
            zoomToRect(bounds, pad);
          }
        });
      });
    } else {
      fitAll(layout.totalWidth, layout.totalHeight, el.clientWidth, el.clientHeight);
    }
  }, [layout.totalWidth, layout.totalHeight, fitAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // No ResizeObserver — fitAll only on mount. Manual zoom controls handle the rest.

  // Apply zoom transform for a given level (does NOT update state — that's the caller's job)
  const handleZoomToLevel = useCallback((level: ZoomLevel) => {
    const el = viewportRef.current;
    if (!el) return;

    if (level === 'overview') {
      fitAll(layout.totalWidth, layout.totalHeight, el.clientWidth, el.clientHeight);
    } else if (level === 'z1') {
      // Zoom to concept column top — see the full column
      const bounds = getColumnBounds(layout, conceptIndex);
      zoomToRect(bounds, 40);
    } else if (level === 'z2') {
      // Zoom closer — see ~3 cards in the column
      const cardBounds = getCardBounds(layout, conceptIndex, versionIndex);
      const expanded = {
        x: cardBounds.x - layout.cardWidth * 0.1,
        y: cardBounds.y - layout.cardHeight * 0.8,
        w: cardBounds.w + layout.cardWidth * 0.2,
        h: cardBounds.h + layout.cardHeight * 1.6,
      };
      zoomToRect(expanded, 30);
    } else if (level === 'z3') {
      // Zoom to ~1.5 cards — current card prominent with neighbors visible
      const cardBounds = getCardBounds(layout, conceptIndex, versionIndex);
      const expanded = {
        x: cardBounds.x - layout.cardWidth * 0.15,
        y: cardBounds.y - layout.cardHeight * 0.25,
        w: cardBounds.w + layout.cardWidth * 0.3,
        h: cardBounds.h + layout.cardHeight * 0.5,
      };
      zoomToRect(expanded, 20);
    } else if (level === 'z4') {
      // Zoom to single card — fills the viewport, still on canvas
      const bounds = getCardBounds(layout, conceptIndex, versionIndex);
      zoomToRect(bounds, 40);
    }
  }, [layout, conceptIndex, versionIndex, fitAll, zoomToRect]);

  // Apply zoom when zoomLevel prop changes (from Viewer/keyboard nav)
  const lastAppliedZoom = useRef<string>('');
  const prevZoomLevel = useRef<ZoomLevel>(zoomLevel);
  useEffect(() => {
    const key = `${zoomLevel}-${conceptIndex}-${versionIndex}`;
    if (key === lastAppliedZoom.current) return;
    lastAppliedZoom.current = key;
    // Skip on first mount — fitAll handles that
    if (!hasInitialized.current) return;
    // Skip if we're doing a card transition animation (the init effect handles it)
    if (skipNextZoomEffect.current) {
      skipNextZoomEffect.current = false;
      return;
    }

    const zoomLevelChanged = prevZoomLevel.current !== zoomLevel;
    prevZoomLevel.current = zoomLevel;

    // Only re-zoom when the zoom level itself changes, not on card navigation
    if (!zoomLevelChanged) return;

    handleZoomToLevel(zoomLevel);
  }, [zoomLevel, conceptIndex, versionIndex, handleZoomToLevel]);

  // Column selection: arrow keys to reorder, Escape to deselect
  useEffect(() => {
    if (selectedColumn === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedColumn(null);
        return;
      }
      if (e.key === 'ArrowLeft' && selectedColumn > 0) {
        e.preventDefault();
        e.stopPropagation();
        onMoveConceptLeft(selectedColumn);
        setSelectedColumn(selectedColumn - 1);
        return;
      }
      if (e.key === 'ArrowRight' && selectedColumn < concepts.length - 1) {
        e.preventDefault();
        e.stopPropagation();
        onMoveConceptRight(selectedColumn);
        setSelectedColumn(selectedColumn + 1);
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedColumn, concepts.length, onMoveConceptLeft, onMoveConceptRight]);

  // Attach wheel listener with passive:false to prevent browser back/forward gestures
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => onWheel(e as unknown as React.WheelEvent);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onWheel]);

  // SSE file watcher
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    function connect() {
      es = new EventSource('/api/watch');
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file-changed' && data.client === client && data.project === project) {
            setThumbVersion(v => v + 1);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es?.close(); reconnectTimeout = setTimeout(connect, 5000); };
    }
    connect();
    return () => { es?.close(); if (reconnectTimeout) clearTimeout(reconnectTimeout); };
  }, [client, project]);

  const handleThumbnailClick = useCallback((ci: number, vi: number, shiftKey?: boolean) => {
    if (isPanning || spaceHeld || arrangeMode || recentlyPanned.current) return;
    if (shiftKey) {
      // Shift+click: toggle star without changing highlight
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) onStarVersion(concept.id, version.id);
      return;
    }
    if (ci === conceptIndex && vi === versionIndex) {
      // Already selected — zoom to this card
      onZoomLevelChange('z4');
    } else {
      onHighlight(ci, vi);
    }
  }, [isPanning, spaceHeld, arrangeMode, conceptIndex, versionIndex, onHighlight, onZoomLevelChange, concepts, onStarVersion]);

  const handleThumbnailDoubleClick = useCallback((ci: number, vi: number) => {
    if (isPanning || spaceHeld || arrangeMode || recentlyPanned.current) return;
    onSelect(ci, vi);
  }, [isPanning, spaceHeld, arrangeMode, onSelect]);

  const handleCardContextMenu = useCallback((ci: number, vi: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, ci, vi });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Double-click background to fit all — skip if target is a card or if panning
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (isPanning || spaceHeld) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-card]')) return;
    const el = viewportRef.current;
    if (!el) return;
    fitAll(layout.totalWidth, layout.totalHeight, el.clientWidth, el.clientHeight);
    onZoomLevelChange('overview');
  }, [isPanning, spaceHeld, layout.totalWidth, layout.totalHeight, fitAll, onZoomLevelChange]);

  // Pinch zoom in past z4 threshold → enter frame
  const enterFrameThreshold = useRef(false);
  useEffect(() => {
    if (!viewportRef.current || layout.cards.length === 0) return;
    const el = viewportRef.current;
    // Calculate what scale z4 would be
    const cardBounds = getCardBounds(layout, conceptIndex, versionIndex);
    if (cardBounds.w === 0) return;
    const z4Scale = Math.min(
      (el.clientWidth - 80) / cardBounds.w,
      (el.clientHeight - 80) / cardBounds.h,
    );
    // If we're 30% past z4 scale, enter the frame
    if (transform.scale > z4Scale * 1.15 && !enterFrameThreshold.current) {
      enterFrameThreshold.current = true;
      onSelect(conceptIndex, versionIndex);
    } else if (transform.scale <= z4Scale * 1.15) {
      enterFrameThreshold.current = false;
    }
  }, [transform.scale, layout, conceptIndex, versionIndex, onSelect]);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--canvas)' }}>
      <div
        ref={viewportRef}
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Navigation hints + zoom level indicator */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4"
          style={{ opacity: spaceHeld ? 0 : 1, transition: 'opacity 0.3s ease' }}>
          <span style={{ fontSize: 9, color: 'var(--foreground)', opacity: 0.2, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>
            Scroll to pan · ⌘ Scroll to zoom · Double-click to fit
          </span>
        </div>

        {/* Dot grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)',
            backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
            backgroundPosition: `${transform.tx % (24 * transform.scale)}px ${transform.ty % (24 * transform.scale)}px`,
          }}
        />

        {/* Zoom percentage */}
        <div
          className="absolute bottom-3 right-3 z-10 pointer-events-none"
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--foreground)',
            opacity: 0.25,
            letterSpacing: '0.04em',
          }}
        >
          {Math.round(transform.scale * 100)}%
        </div>

        {/* Canvas layer */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transition: animating ? 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            willChange: 'transform',
          }}
        >
          {/* Selects row — one slot per concept column */}
          {layout.selectsSlots.map(slot => {
            const concept = concepts[slot.conceptIndex];
            const selectedVid = selections.get(slot.conceptId);
            const selectedVersion = selectedVid
              ? concept?.versions.find(v => v.id === selectedVid)
              : null;
            const thumbFilename = selectedVersion?.thumbnail?.replace('.thumbs/', '') || null;
            const thumbSrc = thumbFilename
              ? `/api/thumbs/${client}/${project}/${thumbFilename}?v=${thumbVersion}`
              : null;

            return (
              <div
                key={`sel-${slot.conceptId}`}
                className="absolute"
                style={{
                  left: slot.x,
                  top: slot.y,
                  width: layout.cardWidth,
                  height: layout.selectsHeight,
                }}
              >
                {selectedVersion ? (
                  <div
                    className="w-full h-full rounded overflow-hidden cursor-pointer transition-all"
                    style={{
                      border: '2px solid var(--selects-gold)',
                      boxShadow: '0 0 0 1px rgba(250, 204, 21, 0.2)',
                      background: 'var(--card-bg)',
                    }}
                    onClick={() => {
                      const vi = concept.versions.findIndex(v => v.id === selectedVid);
                      if (vi >= 0) handleThumbnailClick(slot.conceptIndex, vi);
                    }}
                    onDoubleClick={() => {
                      const vi = concept.versions.findIndex(v => v.id === selectedVid);
                      if (vi >= 0) handleThumbnailDoubleClick(slot.conceptIndex, vi);
                    }}
                  >
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt={`Select: ${concept.label}`}
                        className="w-full h-full object-cover object-top"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
                          v{selectedVersion.number}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="w-full h-full rounded"
                    style={{
                      border: '1px dashed var(--border)',
                      opacity: 0.3,
                    }}
                  />
                )}
              </div>
            );
          })}

          {layout.labels.map(label => (
            <div
              key={label.conceptId}
              data-card
              className="absolute flex items-center gap-2 cursor-pointer"
              style={{
                left: label.x,
                top: label.y,
                width: layout.cardWidth,
                zIndex: selectedColumn === label.conceptIndex ? 10 : undefined,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedColumn(prev =>
                  prev === label.conceptIndex ? null : label.conceptIndex
                );
              }}
            >
              <span
                className="font-semibold tracking-[0.08em] uppercase truncate flex-1 transition-all"
                style={{
                  fontSize: selectedColumn === label.conceptIndex ? 13 : 11,
                  color: 'var(--foreground)',
                  opacity: selectedColumn === label.conceptIndex ? 1 : 0.5,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: selectedColumn === label.conceptIndex ? '1px solid var(--foreground)' : '1px solid transparent',
                  background: selectedColumn === label.conceptIndex ? 'rgba(0,0,0,0.04)' : undefined,
                }}
              >
                {label.label}
                {selectedColumn === label.conceptIndex && (
                  <span style={{ fontSize: 9, opacity: 0.4, marginLeft: 8, fontWeight: 400, letterSpacing: '0.04em' }}>
                    ← → to move
                  </span>
                )}
              </span>
              {(() => {
                const concept = concepts[label.conceptIndex];
                if (!concept?.branchedFrom) return null;
                const sourceConcept = concepts.find(c => c.id === concept.branchedFrom?.conceptId);
                if (!sourceConcept) return null;
                const sourceVersion = sourceConcept.versions.find(v => v.id === concept.branchedFrom?.versionId);
                return (
                  <span
                    style={{
                      fontSize: 8,
                      color: 'var(--muted)',
                      opacity: 0.5,
                      fontFamily: 'var(--font-mono, monospace)',
                      marginLeft: 4,
                    }}
                  >
                    ← {sourceConcept.label}{sourceVersion ? ` v${sourceVersion.number}` : ''}
                  </span>
                );
              })()}
            </div>
          ))}

          {/* Round dividers */}
          {layout.dividers.map(div => (
            <div
              key={`divider-${div.roundId}-${div.conceptIndex}`}
              data-card
              className="absolute cursor-pointer"
              style={{
                left: div.x,
                top: div.y,
                width: div.width,
                height: 24,
                zIndex: 10,
              }}
              onClick={() => {
                setCollapsedRounds(prev => {
                  const next = new Set(prev);
                  if (next.has(div.roundId)) {
                    next.delete(div.roundId);
                  } else {
                    next.add(div.roundId);
                  }
                  return next;
                });
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: '100%',
              }}>
                <div style={{
                  flex: 1,
                  height: 1,
                  background: 'var(--border)',
                }} />
                <span style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono, monospace)',
                  letterSpacing: '0.06em',
                  color: 'var(--muted)',
                  whiteSpace: 'nowrap',
                }}>
                  {div.roundName}
                  {collapsedRounds.has(div.roundId) && ` (${div.versionCount})`}
                </span>
                <div style={{
                  flex: 1,
                  height: 1,
                  background: 'var(--border)',
                }} />
              </div>
            </div>
          ))}

          <CardLayer
            layout={layout}
            concepts={concepts}
            conceptIndex={conceptIndex}
            versionIndex={versionIndex}
            client={client}
            project={project}
            thumbVersion={thumbVersion}
            selections={selections}
            arrangeMode={arrangeMode}
            onStarVersion={onStarVersion}
            onDeleteVersion={onDeleteVersion}
            onDriftVersion={onDriftVersion}
            onThumbnailClick={handleThumbnailClick}
            onThumbnailDoubleClick={handleThumbnailDoubleClick}
            onCardContextMenu={handleCardContextMenu}
          />
        </div>
      </div>

      {contextMenu && (() => {
        const concept = concepts[contextMenu.ci];
        const version = concept?.versions[contextMenu.vi];
        if (!concept || !version) return null;
        const isStarred = selections.get(concept.id) === version.id;
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            isStarred={isStarred}
            onStar={() => { onStarVersion(concept.id, version.id); closeContextMenu(); }}
            onDrift={() => { onDriftVersion(concept.id, version.id); closeContextMenu(); }}
            onBranch={() => { onBranchVersion(concept.id, version.id); closeContextMenu(); }}
            onCopyPath={() => {
              navigator.clipboard.writeText(`~/drift/projects/${client}/${project}/${version.file}`);
              closeContextMenu();
            }}
            onDelete={() => { onDeleteVersion(concept.id, version.id); closeContextMenu(); }}
            onZoomToCard={() => {
              const bounds = getCardBounds(layout, contextMenu.ci, contextMenu.vi);
              zoomToRect(bounds, 40);
              onZoomLevelChange('z4');
              closeContextMenu();
            }}
            onClose={closeContextMenu}
          />
        );
      })()}
    </div>
  );
});

import type { CanvasLayout } from '@/lib/hooks/useCanvasLayout';

/**
 * Extracted card layer component. Memoized so that transform changes
 * (which only affect the parent's CSS transform) don't re-render cards.
 * Each card gets stable callbacks via useCallback with the concept/version ids
 * captured in the closure, so CanvasCard's React.memo can bail out properly.
 */
const CardLayer = memo(function CardLayer({
  layout,
  concepts,
  conceptIndex,
  versionIndex,
  client,
  project,
  thumbVersion,
  selections,
  arrangeMode,
  onStarVersion,
  onDeleteVersion,
  onDriftVersion,
  onThumbnailClick,
  onThumbnailDoubleClick,
  onCardContextMenu,
}: {
  layout: CanvasLayout;
  concepts: Concept[];
  conceptIndex: number;
  versionIndex: number;
  client: string;
  project: string;
  thumbVersion: number;
  selections: Map<string, string>;
  arrangeMode: boolean;
  onStarVersion: (conceptId: string, versionId: string) => void;
  onDeleteVersion: (conceptId: string, versionId: string) => void;
  onDriftVersion: (conceptId: string, versionId: string) => void;
  onThumbnailClick: (ci: number, vi: number, shiftKey?: boolean) => void;
  onThumbnailDoubleClick: (ci: number, vi: number) => void;
  onCardContextMenu: (ci: number, vi: number, e: React.MouseEvent) => void;
}) {
  return (
    <div style={{ opacity: arrangeMode ? 0.3 : 1, transition: 'opacity 0.2s ease', pointerEvents: arrangeMode ? 'none' : 'auto' }}>
      {layout.cards.map(pos => {
        const concept = concepts[pos.conceptIndex];
        const version = concept.versions[pos.versionIndex];
        // Always compute a thumb URL — the API will auto-generate on first request
        const thumbFilename = version.thumbnail?.replace('.thumbs/', '')
          || `${concept.id}-${version.id}.png`;
        const thumbSrc = `/api/thumbs/${client}/${project}/${thumbFilename}?v=${thumbVersion}`;
        const isStarred = selections.get(concept.id) === version.id;
        const isLatest = pos.versionIndex === concept.versions.length - 1;

        return (
          <CanvasCard
            key={`${pos.conceptId}-${pos.versionId}`}
            thumbnail={thumbSrc}
            conceptLabel={concept.label}
            versionNumber={version.number}
            isCurrent={pos.conceptIndex === conceptIndex && pos.versionIndex === versionIndex}
            isSelected={isStarred}
            isLatest={isLatest}
            filePath={`~/drift/projects/${client}/${project}/${version.file}`}
            onStar={() => onStarVersion(concept.id, version.id)}
            onDelete={() => onDeleteVersion(concept.id, version.id)}
            onDrift={() => onDriftVersion(concept.id, version.id)}
            onClick={(shiftKey) => onThumbnailClick(pos.conceptIndex, pos.versionIndex, shiftKey)}
            onDoubleClick={() => onThumbnailDoubleClick(pos.conceptIndex, pos.versionIndex)}
            onContextMenu={(e) => onCardContextMenu(pos.conceptIndex, pos.versionIndex, e)}
            x={pos.x}
            y={pos.y}
            width={layout.cardWidth}
            height={layout.cardHeight}
          />
        );
      })}
    </div>
  );
});
