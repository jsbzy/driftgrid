'use client';

import { memo, useCallback } from 'react';

interface NavigationGridProps {
  conceptIndex: number;
  versionIndex: number;
  versionCounts: number[];
  selections?: Map<string, string>;
  conceptIds?: string[];
  /** versionIds[conceptIdx][versionIdx] = versionId */
  versionIds?: string[][];
  inSelectsRow?: boolean;
}

const MAX_VISIBLE_ROWS = 8;

export const NavigationGrid = memo(function NavigationGrid({
  conceptIndex,
  versionIndex,
  versionCounts,
  selections,
  conceptIds,
  versionIds,
  inSelectsRow = false,
}: NavigationGridProps) {
  const conceptCount = versionCounts.length;
  const maxVersions = versionCounts.length > 0 ? Math.max(...versionCounts) : 0;
  const cell = 10;
  const gap = 3;

  const hasSelections = selections && selections.size > 0;

  const currentConceptCount = versionCounts[conceptIndex] ?? 0;
  const currentRow = currentConceptCount - 1 - versionIndex;

  let startRow = 0;
  const visibleRows = Math.min(maxVersions, MAX_VISIBLE_ROWS);

  if (maxVersions > MAX_VISIBLE_ROWS) {
    startRow = Math.max(0, Math.min(currentRow - Math.floor(visibleRows / 2), maxVersions - visibleRows));
  }

  const hasOverflowTop = startRow > 0;
  const hasOverflowBottom = startRow + visibleRows < maxVersions;

  // Check if a version at (col, mappedIndex) is the selected version for that concept
  const isSelectedVersion = useCallback((col: number, mappedIndex: number): boolean => {
    if (!selections || !conceptIds || !versionIds) return false;
    const cid = conceptIds[col];
    const selectedVid = selections.get(cid);
    if (!selectedVid) return false;
    const vid = versionIds[col]?.[mappedIndex];
    return vid === selectedVid;
  }, [selections, conceptIds, versionIds]);

  return (
    <div
      className="fixed bottom-14 right-14 z-50"
      style={{ opacity: 0.45 }}
    >
      {/* Selects row at top */}
      {hasSelections && conceptIds && (
        <>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${conceptCount}, ${cell}px)`,
              gap: `${gap}px`,
              marginBottom: gap + 2,
            }}
          >
            {conceptIds.map((cid, col) => {
              const hasSelect = selections.has(cid);
              const isActive = inSelectsRow && col === conceptIndex;
              return (
                <div
                  key={`sel-${col}`}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: 2,
                    background: hasSelect ? '#facc15' : undefined,
                    border: isActive
                      ? '2px solid var(--foreground)'
                      : hasSelect
                        ? undefined
                        : '1px dashed rgba(0,0,0,0.08)',
                    boxShadow: isActive ? '0 0 0 1px var(--foreground)' : undefined,
                  }}
                />
              );
            })}
          </div>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', marginBottom: gap + 2 }} />
        </>
      )}

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
            return (
              <div
                key={`${col}-${row}`}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 2,
                  background: isCurrent
                    ? 'var(--foreground)'
                    : isStarred
                      ? '#facc15'
                      : undefined,
                  border: isCurrent || isStarred
                    ? undefined
                    : '1px solid var(--border)',
                }}
              />
            );
          });
        })}
      </div>

      {hasOverflowBottom && (
        <div style={{ textAlign: 'center', fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>···</div>
      )}
    </div>
  );
});
