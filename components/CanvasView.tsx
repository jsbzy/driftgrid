'use client';

import { useRef, useEffect, useState, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from 'react';
import type { Concept, ViewMode } from '@/lib/types';
import { computeCanvasLayout, getColumnBounds, getCardBounds, GRID_SIZE } from '@/lib/hooks/useCanvasLayout';
import type { CanvasLayout } from '@/lib/hooks/useCanvasLayout';
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
  conceptIndex: number;
  versionIndex: number;
  onSelect: (conceptIndex: number, versionIndex: number) => void;
  onHighlight: (conceptIndex: number, versionIndex: number) => void;
  client: string;
  project: string;
  aspectRatio: string;
  selections: Set<string>;
  onStarVersion: (conceptId: string, versionId: string) => void;
  onDeleteVersion: (conceptId: string, versionId: string) => void;
  onDeleteConcept?: (conceptId: string) => void;
  onInsertConcept?: (label: string, afterConceptIndex?: number) => void;
  onRenameConcept?: (conceptId: string, newLabel: string) => void;
  onHideVersion?: (conceptId: string, versionId: string) => void;
  onDriftToProject?: (conceptId: string, versionId: string) => void;
  multiSelected: Set<string>;
  onMultiSelectToggle: (key: string) => void;
  onMultiSelectClear: () => void;
  onDriftVersion: (conceptId: string, versionId: string) => void;
  onBranchVersion: (conceptId: string, versionId: string) => void;
  onMoveConceptLeft: (conceptIdx?: number) => void;
  onMoveConceptRight: (conceptIdx?: number) => void;
  onReorderConcepts: (newOrder: string[]) => void;
  onReorderVersions: (conceptId: string, newVersionOrder: string[]) => void;
  onMoveCardBetweenColumns: (fromCi: number, vi: number, toCi: number) => void;
  rounds?: { id: string; name: string; number: number }[];
  activeRoundId?: string | null;
  onSendToRound?: (conceptId: string, versionId: string, targetRoundId: string) => void;
  onSendToNewRound?: (conceptId: string, versionId: string) => void;
  mode?: ViewMode;
  zoomLevel: ZoomLevel;
  onZoomLevelChange: (level: ZoomLevel) => void;
  showHidden?: boolean;
  /** If set, canvas starts zoomed to this card rect (for smooth transition from frame) */
  initialCardBounds?: { x: number; y: number; w: number; h: number } | null;
}

export const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView({
  concepts,
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
  onDeleteConcept,
  onInsertConcept,
  onRenameConcept,
  onHideVersion,
  onDriftToProject,
  multiSelected,
  onMultiSelectToggle,
  onMultiSelectClear,
  onDriftVersion,
  onBranchVersion,
  onMoveConceptLeft,
  onMoveConceptRight,
  onReorderConcepts,
  onReorderVersions,
  onMoveCardBetweenColumns,
  rounds,
  activeRoundId,
  onSendToRound,
  onSendToNewRound,
  mode,
  zoomLevel,
  onZoomLevelChange,
  showHidden,
  initialCardBounds,
}, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const [thumbVersion, setThumbVersion] = useState(0);

  const layout = useMemo(
    () => computeCanvasLayout(concepts, aspectRatio),
    [concepts, aspectRatio]
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
    setPanTransform,
    isPanning,
    panAnimating,
    spaceHeld,
    recentlyPanned,
  } = useCanvasTransform(viewportRef);

  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null); // conceptId being edited
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ci: number; vi: number } | null>(null);
  // Flag to prevent zoom level effect from firing during the initial card transition
  const skipNextZoomEffect = useRef(false);
  // Flag to suppress auto-pan during reorder operations
  const skipReorderPan = useRef(false);

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
          handleZoomToLevel(zoomLevel);
        });
      });
    } else {
      fitAll(layout.totalWidth, layout.totalHeight, el.clientWidth, el.clientHeight);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps — runs once on mount, intentionally ignores initialCardBounds/zoomLevel changes
  }, [layout.totalWidth, layout.totalHeight, fitAll]);

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
    // Skip auto-pan during reorder — viewport should stay put
    if (skipReorderPan.current) {
      skipReorderPan.current = false;
      return;
    }

    const zoomLevelChanged = prevZoomLevel.current !== zoomLevel;
    prevZoomLevel.current = zoomLevel;

    // Zoom level changed → apply the new zoom level (e.g., ` 1 2 3 4 keys, trackpad)
    if (zoomLevelChanged) {
      handleZoomToLevel(zoomLevel);
      return;
    }

    // Navigation at z2/z3/z4: pan to keep selected card visible (don't change scale)
    if (zoomLevel !== 'z2' && zoomLevel !== 'z3' && zoomLevel !== 'z4') return;

    const el = viewportRef.current;
    if (!el) return;

    const cardBounds = getCardBounds(layout, conceptIndex, versionIndex);
    if (cardBounds.w === 0) return;

    // Card position in screen coordinates
    const screenX = cardBounds.x * transform.scale + transform.tx;
    const screenY = cardBounds.y * transform.scale + transform.ty;
    const screenW = cardBounds.w * transform.scale;
    const screenH = cardBounds.h * transform.scale;

    const vpW = el.clientWidth;
    const vpH = el.clientHeight;
    const pad = 40;

    // If card is fully visible, don't move
    if (
      screenX >= pad &&
      screenY >= pad &&
      screenX + screenW <= vpW - pad &&
      screenY + screenH <= vpH - pad
    ) return;

    // Pan minimum distance to bring card into view (not centering)
    let newTx = transform.tx;
    let newTy = transform.ty;

    if (screenX < pad) {
      newTx = pad - cardBounds.x * transform.scale;
    } else if (screenX + screenW > vpW - pad) {
      newTx = (vpW - pad) - (cardBounds.x + cardBounds.w) * transform.scale;
    }

    if (screenY < pad) {
      newTy = pad - cardBounds.y * transform.scale;
    } else if (screenY + screenH > vpH - pad) {
      newTy = (vpH - pad) - (cardBounds.y + cardBounds.h) * transform.scale;
    }

    setPanTransform({ scale: transform.scale, tx: newTx, ty: newTy });
  }, [zoomLevel, conceptIndex, versionIndex, handleZoomToLevel, layout, transform, setPanTransform]);

  // Column selection: Escape to deselect
  useEffect(() => {
    if (selectedColumn === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedColumn(null);
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedColumn]);

  // Alt+Arrow reordering (columns left/right, cards up/down/between columns)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || !e.key.startsWith('Arrow')) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (contextMenu) return;

      e.preventDefault();
      e.stopPropagation();
      skipReorderPan.current = true;

      if (e.key === 'ArrowLeft') {
        if (selectedColumn !== null) {
          // Column selected: move column left
          if (selectedColumn <= 0) return;
          onMoveConceptLeft(selectedColumn);
          setSelectedColumn(selectedColumn - 1);
        } else {
          // Card focused: move card to left column
          onMoveCardBetweenColumns(conceptIndex, versionIndex, conceptIndex - 1);
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (selectedColumn !== null) {
          // Column selected: move column right
          if (selectedColumn >= concepts.length - 1) return;
          onMoveConceptRight(selectedColumn);
          setSelectedColumn(selectedColumn + 1);
        } else {
          // Card focused: move card to right column
          onMoveCardBetweenColumns(conceptIndex, versionIndex, conceptIndex + 1);
        }
        return;
      }

      // Up/Down only apply to cards, not columns
      if (selectedColumn !== null) return;

      if (e.key === 'ArrowUp') {
        const concept = concepts[conceptIndex];
        if (!concept || versionIndex >= concept.versions.length - 1) return;
        const ids = concept.versions.map(v => v.id);
        const [moved] = ids.splice(versionIndex, 1);
        ids.splice(versionIndex + 1, 0, moved);
        onReorderVersions(concept.id, ids);
        onHighlight(conceptIndex, versionIndex + 1);
        return;
      }

      if (e.key === 'ArrowDown') {
        const concept = concepts[conceptIndex];
        if (!concept || versionIndex <= 0) return;
        const ids = concept.versions.map(v => v.id);
        const [moved] = ids.splice(versionIndex, 1);
        ids.splice(versionIndex - 1, 0, moved);
        onReorderVersions(concept.id, ids);
        onHighlight(conceptIndex, versionIndex - 1);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [conceptIndex, versionIndex, concepts, selectedColumn, contextMenu, onMoveConceptLeft, onMoveConceptRight, onReorderVersions, onMoveCardBetweenColumns, onHighlight]);

  // Shift+Arrow multi-select (extend selection while navigating)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.shiftKey || !e.key.startsWith('Arrow')) return;
      if (e.altKey) return; // Alt+Shift combo — ignore
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (contextMenu) return;

      e.preventDefault();
      e.stopPropagation();

      // Add current card to selection (anchor on first Shift+Arrow)
      const currentConcept = concepts[conceptIndex];
      if (currentConcept) {
        const currentVersion = currentConcept.versions[versionIndex];
        if (currentVersion) {
          const currentKey = `${currentConcept.id}:${currentVersion.id}`;
          if (!multiSelected.has(currentKey)) {
            onMultiSelectToggle(currentKey);
          }
        }
      }

      // Compute destination
      let nextCi = conceptIndex;
      let nextVi = versionIndex;

      if (e.key === 'ArrowRight' && conceptIndex < concepts.length - 1) {
        nextCi = conceptIndex + 1;
        const currentCount = concepts[conceptIndex]?.versions.length ?? 0;
        const visualRow = currentCount - 1 - versionIndex;
        const nextCount = concepts[nextCi]?.versions.length ?? 0;
        nextVi = Math.max(0, nextCount - 1 - Math.min(visualRow, nextCount - 1));
      } else if (e.key === 'ArrowLeft' && conceptIndex > 0) {
        nextCi = conceptIndex - 1;
        const currentCount = concepts[conceptIndex]?.versions.length ?? 0;
        const visualRow = currentCount - 1 - versionIndex;
        const prevCount = concepts[nextCi]?.versions.length ?? 0;
        nextVi = Math.max(0, prevCount - 1 - Math.min(visualRow, prevCount - 1));
      } else if (e.key === 'ArrowUp') {
        const maxVi = (concepts[conceptIndex]?.versions.length ?? 1) - 1;
        nextVi = Math.min(versionIndex + 1, maxVi);
      } else if (e.key === 'ArrowDown') {
        nextVi = Math.max(versionIndex - 1, 0);
      }

      if (nextCi === conceptIndex && nextVi === versionIndex) return;

      // Add destination card to selection
      const destConcept = concepts[nextCi];
      const destVersion = destConcept?.versions[nextVi];
      if (destConcept && destVersion) {
        const destKey = `${destConcept.id}:${destVersion.id}`;
        if (!multiSelected.has(destKey)) {
          onMultiSelectToggle(destKey);
        }
      }

      onHighlight(nextCi, nextVi);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [conceptIndex, versionIndex, concepts, contextMenu, multiSelected, onMultiSelectToggle, onHighlight]);

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

  const handleThumbnailClick = useCallback((ci: number, vi: number, shiftKey?: boolean, metaKey?: boolean) => {
    if (isPanning || spaceHeld || recentlyPanned.current) return;
    if (shiftKey || metaKey) {
      // Shift/Cmd+click: toggle multi-select
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) {
        onMultiSelectToggle(`${concept.id}:${version.id}`);
      }
      return;
    }
    // Clear multi-select on regular click
    if (multiSelected.size > 0) onMultiSelectClear();
    if (ci === conceptIndex && vi === versionIndex) {
      onZoomLevelChange('z4');
    } else {
      onHighlight(ci, vi);
    }
  }, [isPanning, spaceHeld, conceptIndex, versionIndex, onHighlight, onZoomLevelChange, concepts, multiSelected]);

  const handleThumbnailDoubleClick = useCallback((ci: number, vi: number) => {
    if (isPanning || spaceHeld || recentlyPanned.current) return;
    onSelect(ci, vi);
  }, [isPanning, spaceHeld, onSelect]);

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
        onClick={() => { if (selectedColumn !== null) setSelectedColumn(null); }}
      >

        {/* Grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              `linear-gradient(var(--grid-line) 0.5px, transparent 0.5px),
               linear-gradient(90deg, var(--grid-line) 0.5px, transparent 0.5px)`,
            backgroundSize: `${GRID_SIZE * transform.scale}px ${GRID_SIZE * transform.scale}px`,
            backgroundPosition: `${transform.tx % (GRID_SIZE * transform.scale)}px ${transform.ty % (GRID_SIZE * transform.scale)}px`,
          }}
        />

        {/* Empty state */}
        {layout.cards.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
              <div style={{ fontSize: 14, color: 'var(--foreground)', opacity: 0.25, fontWeight: 500, marginBottom: 8 }}>
                No versions yet
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.3 }}>
                Press D to drift your first iteration
              </div>
            </div>
          </div>
        )}

        {/* Branding */}
        <div
          className="absolute bottom-3 left-3 z-10 pointer-events-none"
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--foreground)',
            opacity: 0.1,
            letterSpacing: '0.06em',
          }}
        >
          DriftGrid
        </div>

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
            transition: animating
              ? 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
              : panAnimating
                ? 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
                : 'none',
            willChange: 'transform',
          }}
        >

          {/* Selected column highlight */}
          {selectedColumn !== null && layout.labels[selectedColumn] && (() => {
            const label = layout.labels[selectedColumn];
            const columnCards = layout.cards.filter(c => c.conceptIndex === selectedColumn);
            const lastCard = columnCards.length > 0 ? columnCards.reduce((a, b) => a.y > b.y ? a : b) : null;
            const columnBottom = lastCard ? lastCard.y + layout.cardHeight : label.y + 40;
            return (
              <div className="absolute pointer-events-none transition-all duration-200"
                style={{
                  left: label.x - 12, top: label.y - 12,
                  width: layout.cardWidth + 24, height: columnBottom - label.y + 24,
                  border: '1.5px solid var(--column-accent)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--column-tint)',
                }}
              />
            );
          })()}

          {/* Concept labels */}
          {layout.labels.map(label => {
            const concept = concepts[label.conceptIndex];
            const hasSelect = concept?.versions.some(v => selections.has(`${label.conceptId}:${v.id}`)) ?? false;
            return (
              <div
                key={label.conceptId}
                data-card
                className="absolute flex items-center gap-2 cursor-pointer"
                style={{
                  left: label.x,
                  top: label.y,
                  width: layout.cardWidth,
                  transition: 'left 0.5s cubic-bezier(0.16, 1, 0.3, 1), top 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedColumn(prev => prev === label.conceptIndex ? null : label.conceptIndex);
                }}
              >
                <span className="font-semibold tracking-[0.08em] uppercase truncate flex-1 transition-all"
                  style={{
                    fontSize: 13,
                    color: 'var(--foreground)',
                    opacity: selectedColumn === label.conceptIndex ? 1 : 0.7,
                    fontWeight: selectedColumn === label.conceptIndex ? 700 : 600,
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  {label.label}
                  {hasSelect && (
                    <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: 'var(--selects-gold)', marginLeft: 6, verticalAlign: 'middle' }} />
                  )}
                  {selectedColumn === label.conceptIndex && (
                    <span style={{ fontSize: 9, opacity: 0.35, marginLeft: 8, fontWeight: 400, letterSpacing: '0.04em' }}>
                      ⌥ arrows to reorder
                    </span>
                  )}
                </span>
                {/* Branch source indicator */}
                {(() => {
                  const concept = concepts[label.conceptIndex];
                  if (!concept?.branchedFrom) return null;
                  const sourceConcept = concepts.find(c => c.id === concept.branchedFrom?.conceptId);
                  if (!sourceConcept) return null;
                  const sourceVersion = sourceConcept.versions.find(v => v.id === concept.branchedFrom?.versionId);
                  return (
                    <span style={{ fontSize: 8, color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)', marginLeft: 4 }}>
                      ← {sourceConcept.label}{sourceVersion ? ` v${sourceVersion.number}` : ''}
                    </span>
                  );
                })()}
                {selectedColumn === label.conceptIndex && onDeleteConcept && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConcept(label.conceptId);
                    }}
                    className="ml-auto p-1 rounded hover:bg-[rgba(255,0,0,0.08)] transition-colors group/trash"
                    title="Delete concept"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" className="group-hover/trash:stroke-red-500 transition-colors">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* Insert concept "+" zones between columns and at the end */}
          {onInsertConcept && layout.labels.length > 0 && mode !== 'client' && (
            <>
              {/* Between each pair of columns */}
              {layout.labels.map((label, i) => {
                if (i === 0) return null; // no zone before the first column
                const prevLabel = layout.labels[i - 1];
                const gapX = prevLabel.x + layout.cardWidth;
                const gapWidth = label.x - gapX;
                return (
                  <InsertZone
                    key={`insert-${i}`}
                    x={gapX}
                    y={label.y}
                    width={gapWidth}
                    height={layout.cardHeight + 40}
                    afterIndex={i - 1}
                    onInsert={onInsertConcept}
                  />
                );
              })}
              {/* After the last column */}
              {(() => {
                const last = layout.labels[layout.labels.length - 1];
                return (
                  <InsertZone
                    key="insert-end"
                    x={last.x + layout.cardWidth}
                    y={last.y}
                    width={layout.columnGap + 40}
                    height={layout.cardHeight + 40}
                    afterIndex={layout.labels.length - 1}
                    onInsert={onInsertConcept}
                  />
                );
              })()}
            </>
          )}

          <CardLayer
            layout={layout}
            concepts={concepts}
            conceptIndex={conceptIndex}
            versionIndex={versionIndex}
            client={client}
            project={project}
            thumbVersion={thumbVersion}
            selections={selections}
            showHidden={showHidden}
            transform={transform}
            viewportRef={viewportRef}
            onStarVersion={onStarVersion}
            onDeleteVersion={onDeleteVersion}
            onDriftVersion={onDriftVersion}
            onThumbnailClick={handleThumbnailClick}
            onThumbnailDoubleClick={handleThumbnailDoubleClick}
            onCardContextMenu={handleCardContextMenu}
            multiSelected={multiSelected}
            mode={mode}
          />
        </div>
      </div>

      {contextMenu && (() => {
        const concept = concepts[contextMenu.ci];
        const version = concept?.versions[contextMenu.vi];
        if (!concept || !version) return null;
        const isStarred = selections.has(`${concept.id}:${version.id}`);
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            isStarred={isStarred}
            onStar={() => { onStarVersion(concept.id, version.id); closeContextMenu(); }}
            onDrift={() => { onDriftVersion(concept.id, version.id); closeContextMenu(); }}
            onBranch={() => { onBranchVersion(concept.id, version.id); closeContextMenu(); }}
            onCopyPath={() => {
              navigator.clipboard.writeText(`~/driftgrid/projects/${client}/${project}/${version.file}`);
              closeContextMenu();
            }}
            onHide={() => { onHideVersion?.(concept.id, version.id); closeContextMenu(); }}
            onDriftToProject={() => { onDriftToProject?.(concept.id, version.id); closeContextMenu(); }}
            onDelete={() => { onDeleteVersion(concept.id, version.id); closeContextMenu(); }}
            rounds={rounds}
            activeRoundId={activeRoundId ?? undefined}
            onSendToRound={onSendToRound ? (roundId) => { onSendToRound(concept.id, version.id, roundId); closeContextMenu(); } : undefined}
            onSendToNewRound={onSendToNewRound ? () => { onSendToNewRound(concept.id, version.id); closeContextMenu(); } : undefined}
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

/**
 * Hover "+" zone rendered in the gap between columns.
 * Appears as a faint vertical line with a "+" circle on hover.
 */
function InsertZone({ x, y, width, height, afterIndex, onInsert }: {
  x: number; y: number; width: number; height: number;
  afterIndex: number;
  onInsert: (label: string, afterConceptIndex?: number) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      data-card
      className="absolute flex items-start justify-center"
      style={{ left: x, top: y, width, height, cursor: 'pointer', zIndex: hovered ? 20 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        const label = window.prompt('Concept name:');
        if (label?.trim()) onInsert(label.trim(), afterIndex);
      }}
    >
      {/* Vertical line */}
      <div
        style={{
          width: 1,
          height: '100%',
          background: 'var(--foreground)',
          opacity: hovered ? 0.15 : 0,
          transition: 'opacity 0.15s ease',
        }}
      />
      {/* "+" circle */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          top: -4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: hovered ? 'var(--foreground)' : 'transparent',
          color: hovered ? 'var(--background)' : 'transparent',
          fontSize: 14,
          fontWeight: 300,
          lineHeight: 1,
          opacity: hovered ? 0.6 : 0,
          transition: 'all 0.15s ease',
          pointerEvents: 'none',
        }}
      >
        +
      </div>
    </div>
  );
}

/**
 * Extracted card layer with viewport culling. Only renders cards visible
 * in the current viewport + a 1-card buffer for smooth panning.
 * Individual CanvasCards use React.memo to bail out on stable props.
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
  showHidden,
  transform,
  viewportRef,
  onStarVersion,
  onDeleteVersion,
  onDriftVersion,
  onThumbnailClick,
  multiSelected,
  onThumbnailDoubleClick,
  onCardContextMenu,
  mode,
}: {
  layout: CanvasLayout;
  concepts: Concept[];
  conceptIndex: number;
  versionIndex: number;
  client: string;
  project: string;
  thumbVersion: number;
  selections: Set<string>;
  showHidden?: boolean;
  transform: { scale: number; tx: number; ty: number };
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onStarVersion: (conceptId: string, versionId: string) => void;
  onDeleteVersion: (conceptId: string, versionId: string) => void;
  onDriftVersion: (conceptId: string, versionId: string) => void;
  onThumbnailClick: (ci: number, vi: number, shiftKey?: boolean, metaKey?: boolean) => void;
  multiSelected: Set<string>;
  onThumbnailDoubleClick: (ci: number, vi: number) => void;
  onCardContextMenu: (ci: number, vi: number, e: React.MouseEvent) => void;
  mode?: string;
}) {
  // Viewport culling: only render cards visible in the current view + buffer
  const vpW = viewportRef.current?.clientWidth ?? 2000;
  const vpH = viewportRef.current?.clientHeight ?? 2000;
  const buffer = layout.cardWidth;
  const left = -transform.tx / transform.scale - buffer;
  const top = -transform.ty / transform.scale - buffer;
  const right = left + vpW / transform.scale + buffer * 2;
  const bottom = top + vpH / transform.scale + buffer * 2;

  return (
    <div>
      {layout.cards.map(pos => {
        // Cull cards outside visible region
        if (
          pos.x + layout.cardWidth < left ||
          pos.x > right ||
          pos.y + layout.cardHeight < top ||
          pos.y > bottom
        ) return null;

        const concept = concepts[pos.conceptIndex];
        if (!concept) return null;
        const version = concept.versions[pos.versionIndex];
        if (!version) return null;
        const isHidden = version.visible === false;
        // Skip hidden versions unless showHidden is enabled
        if (isHidden && !showHidden) return null;
        // Always compute a thumb URL — the API will auto-generate on first request
        const thumbFilename = version.thumbnail?.replace('.thumbs/', '')
          || `${concept.id}-${version.id}.webp`;
        // Use small thumbnails at low zoom, full-res at high zoom (z3/z4)
        const thumbW = transform.scale < 0.5 ? '&w=880' : '';
        const thumbSrc = `/api/thumbs/${client}/${project}/${thumbFilename}?v=${thumbVersion}${thumbW}`;
        const isStarred = selections.has(`${concept.id}:${version.id}`);
        const isLatest = pos.versionIndex === concept.versions.length - 1;

        return (
          <div key={`${pos.conceptIndex}-${pos.versionIndex}`}
            style={{ opacity: isHidden ? 0.3 : 1, transition: 'opacity 0.15s ease' }}
          >
            <CanvasCard
              thumbnail={thumbSrc}
              conceptLabel={concept.label}
              versionNumber={version.number}
              iterationLetter={`v${version.number}`}
              isCurrent={pos.conceptIndex === conceptIndex && pos.versionIndex === versionIndex}
              isSelected={isStarred}
              isLatest={isLatest}
              isMultiSelected={multiSelected.has(`${concept.id}:${version.id}`)}
              filePath={`~/driftgrid/projects/${client}/${project}/${version.file}`}
              mode={mode}
              onStar={() => onStarVersion(concept.id, version.id)}
              onDelete={() => onDeleteVersion(concept.id, version.id)}
              onDrift={() => onDriftVersion(concept.id, version.id)}
              onClick={(shiftKey, metaKey) => onThumbnailClick(pos.conceptIndex, pos.versionIndex, shiftKey, metaKey)}
              onDoubleClick={() => onThumbnailDoubleClick(pos.conceptIndex, pos.versionIndex)}
              onContextMenu={(e) => onCardContextMenu(pos.conceptIndex, pos.versionIndex, e)}
              x={pos.x}
              y={pos.y}
              width={layout.cardWidth}
              height={layout.cardHeight}
            />
          </div>
        );
      })}
    </div>
  );
});
