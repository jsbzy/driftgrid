'use client';

import { memo, useCallback } from 'react';

interface NavigationGridProps {
  conceptIndex: number;
  versionIndex: number;
  versionCounts: number[];
  selections?: Set<string>;
  conceptIds?: string[];
  /** versionIds[conceptIdx][versionIdx] = versionId */
  versionIds?: string[][];
  /** Number of versions hidden in collapsed rounds */
  collapsedCount?: number;
  /** The version.number of the currently selected version */
  currentVersionNumber?: number;
  /** Viewer mode. In client mode we suppress the gold starred coloring and surface
   *  the only two keybinds that matter to clients (`G` to toggle grid / `H` to hide),
   *  plus arrow buttons for mouse-only navigation. */
  mode?: 'designer' | 'client' | string;
  /** Click handler — when provided, the minimap dots become clickable and jump to
   *  the corresponding concept/version. Without this, the minimap is a pure indicator. */
  onNavigate?: (conceptIndex: number, versionIndex: number) => void;
}

const MAX_VISIBLE_ROWS = 8;

export const NavigationGrid = memo(function NavigationGrid({
  conceptIndex,
  versionIndex,
  versionCounts,
  selections,
  conceptIds,
  versionIds,
  collapsedCount = 0,
  currentVersionNumber,
  mode,
  onNavigate,
}: NavigationGridProps) {
  const conceptCount = versionCounts.length;
  const maxVersions = versionCounts.length > 0 ? Math.max(...versionCounts) : 0;
  const cell = 10;
  const gap = 3;
  const isClient = mode === 'client';

  const currentConceptCount = versionCounts[conceptIndex] ?? 0;
  const currentRow = currentConceptCount - 1 - versionIndex;

  let startRow = 0;
  const visibleRows = Math.min(maxVersions, MAX_VISIBLE_ROWS);

  if (maxVersions > MAX_VISIBLE_ROWS) {
    startRow = Math.max(0, Math.min(currentRow - Math.floor(visibleRows / 2), maxVersions - visibleRows));
  }

  const hasOverflowTop = startRow > 0;
  const hasOverflowBottom = startRow + visibleRows < maxVersions;

  // Check if a version at (col, mappedIndex) is the selected version for that concept.
  // In client mode we return `false` so the cells render in neutral grey — the gold
  // star color is noise when every version in a curated share is starred by definition.
  const isSelectedVersion = useCallback((col: number, mappedIndex: number): boolean => {
    if (isClient) return false;
    if (!selections || !conceptIds || !versionIds) return false;
    const cid = conceptIds[col];
    const vid = versionIds[col]?.[mappedIndex];
    if (!cid || !vid) return false;
    return selections.has(`${cid}:${vid}`);
  }, [isClient, selections, conceptIds, versionIds]);

  return (
    <div
      className="fixed bottom-14 right-14 z-50"
      style={{ opacity: 0.55 }}
    >
      {hasOverflowTop && (
        <div style={{ textAlign: 'center', fontSize: 8, color: 'var(--muted)', marginBottom: 2 }}>···</div>
      )}

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${conceptCount}, ${cell}px)`,
          gap: `${gap}px`,
        }}
      >
        {Array.from({ length: visibleRows }, (_, ri) => {
          const row = startRow + ri;
          return Array.from({ length: conceptCount }, (_, col) => {
            const mappedIndex = versionCounts[col] - 1 - row;
            const exists = mappedIndex >= 0 && row < versionCounts[col];
            if (!exists)
              return (
                <div
                  key={`${col}-${row}`}
                  style={{ width: cell, height: cell }}
                />
              );
            const isCurrent = col === conceptIndex && mappedIndex === versionIndex;
            const isStarred = isSelectedVersion(col, mappedIndex);
            const baseStyle: React.CSSProperties = {
              width: cell,
              height: cell,
              borderRadius: 2,
              background: isCurrent
                ? 'var(--foreground)'
                : isStarred
                  ? '#fef3c7'
                  : undefined,
              border: isCurrent || isStarred
                ? undefined
                : '1px solid var(--border)',
            };
            if (!onNavigate) {
              return <div key={`${col}-${row}`} style={baseStyle} />;
            }
            return (
              <button
                key={`${col}-${row}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(col, mappedIndex);
                }}
                aria-label={`Jump to concept ${col + 1}, version ${(versionCounts[col] ?? 0) - mappedIndex}`}
                style={{
                  ...baseStyle,
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease, opacity 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) e.currentTarget.style.transform = 'scale(1.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              />
            );
          });
        })}
      </div>

      {hasOverflowBottom && (
        <div style={{ textAlign: 'center', fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>···</div>
      )}

      {collapsedCount > 0 && (
        <>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: `${gap + 1}px 0` }} />
          <div style={{ textAlign: 'center', fontSize: 7, color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>
            +{collapsedCount}
          </div>
        </>
      )}
    </div>
  );
});
