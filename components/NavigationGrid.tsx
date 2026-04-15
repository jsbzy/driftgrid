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

  // Synthesize arrow keypresses so mouse users get the same nav behavior as the
  // keyboard path (which already handles edge cases like round boundaries).
  const fireKey = useCallback((key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }, []);

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
                      ? '#fef3c7'
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

      {collapsedCount > 0 && (
        <>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: `${gap + 1}px 0` }} />
          <div style={{ textAlign: 'center', fontSize: 7, color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>
            +{collapsedCount}
          </div>
        </>
      )}

      {isClient && (
        <ClientNav fireKey={fireKey} />
      )}
    </div>
  );
});

function ClientNav({ fireKey }: { fireKey: (key: string) => void }) {
  const arrowBtn: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
    transition: 'opacity 0.15s ease, background 0.15s ease',
  };
  const hover = (enter: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLElement).style.opacity = enter ? '1' : '0.7';
  };

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button type="button" style={arrowBtn} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => fireKey('ArrowUp')} title="Previous version (↑)">↑</button>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={arrowBtn} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => fireKey('ArrowLeft')} title="Previous concept (←)">←</button>
        <button type="button" style={arrowBtn} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => fireKey('ArrowRight')} title="Next concept (→)">→</button>
      </div>
      <button type="button" style={arrowBtn} onMouseEnter={hover(true)} onMouseLeave={hover(false)} onClick={() => fireKey('ArrowDown')} title="Next version (↓)">↓</button>
      <div style={{
        marginTop: 6,
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 9,
        color: 'var(--muted)',
        opacity: 0.65,
        letterSpacing: '0.04em',
        display: 'flex',
        gap: 10,
      }}>
        <span><strong>G</strong> Toggle Grid</span>
        <span><strong>H</strong> Hide</span>
      </div>
    </div>
  );
}
