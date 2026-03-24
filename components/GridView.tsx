'use client';

import type { Concept, WorkingSet, ViewMode } from '@/lib/types';
import { GridCell } from './GridCell';
import { SelectCell } from './SelectCell';

interface GridViewProps {
  concepts: Concept[];
  conceptIndex: number;
  versionIndex: number;
  onSelect: (conceptIndex: number, versionIndex: number) => void;
  client: string;
  project: string;
  aspectRatio: string;
  selections: Map<string, string>;
  onToggleSelect: () => void;
  onStarVersion: (conceptId: string, versionId: string) => void;
  workingSets: WorkingSet[];
  activeWorkingSetId: string | null;
  onSaveWorkingSet: () => void;
  onLoadWorkingSet: (id: string) => void;
  onClearSelections: () => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  mode?: ViewMode;
}

export function GridView({
  concepts,
  conceptIndex,
  versionIndex,
  onSelect,
  client,
  project,
  aspectRatio,
  selections,
  workingSets,
  activeWorkingSetId,
  onSaveWorkingSet,
  onLoadWorkingSet,
  onClearSelections,
  selectMode,
  onStarVersion,
  onToggleSelectMode,
  mode,
}: GridViewProps) {
  const hasSelections = selections.size > 0;
  const colStyle = concepts.length <= 2
    ? `repeat(${concepts.length}, minmax(0, 480px))`
    : `repeat(${concepts.length}, 1fr)`;

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Column headers */}
      <div
        className="grid gap-4 px-10 pt-8 pb-3"
        style={{ gridTemplateColumns: colStyle }}
      >
        {concepts.map(c => (
          <div
            key={c.id}
            className="text-[11px] font-semibold tracking-[0.08em] uppercase truncate"
            style={{ color: 'var(--foreground)', opacity: 0.5 }}
          >
            {c.label}
          </div>
        ))}
      </div>

      {/* Selects row — always visible in designer mode */}
      {mode !== 'client' && (
        <div className="px-10 pb-3">
          <div className="flex items-center gap-3 pb-2">
            <span className="text-[10px] font-medium tracking-[0.06em] uppercase" style={{ color: 'var(--foreground)', opacity: 0.35 }}>
              Selects
            </span>
            {hasSelections && (
              <>
                <button
                  onClick={onSaveWorkingSet}
                  className="text-[10px] tracking-wide hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--foreground)', opacity: 0.3 }}
                >
                  Save set
                </button>
                <button
                  onClick={onClearSelections}
                  className="text-[10px] tracking-wide hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--foreground)', opacity: 0.3 }}
                >
                  Clear
                </button>
              </>
            )}
            {/* Saved working set tabs */}
            {workingSets.length > 0 && (
              <>
                <span style={{ color: 'var(--foreground)', opacity: 0.15 }}>·</span>
                {workingSets.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => onLoadWorkingSet(ws.id)}
                    className="text-[10px] tracking-wide transition-opacity"
                    style={{
                      color: 'var(--foreground)',
                      opacity: ws.id === activeWorkingSetId ? 0.7 : 0.25,
                      fontWeight: ws.id === activeWorkingSetId ? 600 : 400,
                    }}
                  >
                    {ws.name}
                  </button>
                ))}
              </>
            )}
          </div>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: colStyle }}
          >
            {concepts.map((concept) => {
              const selectedVersionId = selections.get(concept.id);
              if (selectedVersionId) {
                const version = concept.versions.find(v => v.id === selectedVersionId);
                if (version) {
                  const thumbFilename = version.thumbnail?.replace('.thumbs/', '') || null;
                  const thumbSrc = thumbFilename
                    ? `/api/thumbs/${client}/${project}/${thumbFilename}`
                    : null;
                  const vi = concept.versions.indexOf(version);
                  const ci = concepts.indexOf(concept);
                  return (
                    <SelectCell
                      key={concept.id}
                      thumbnail={thumbSrc || ''}
                      conceptLabel={concept.label}
                      versionNumber={version.number}
                      aspectRatio={aspectRatio}
                      onClick={() => onSelect(ci, vi)}
                    />
                  );
                }
              }
              // Empty slot — dashed placeholder
              return (
                <div
                  key={concept.id}
                  className="w-full rounded"
                  style={{
                    aspectRatio,
                    border: '1px dashed rgba(0,0,0,0.1)',
                  }}
                />
              );
            })}
          </div>
          <div className="h-3" />
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />
        </div>
      )}

      {/* Grid body — independent columns, latest versions at top */}
      <div className="flex-1 overflow-auto px-10 pb-10">
        <div
          className="grid gap-4 items-start"
          style={{ gridTemplateColumns: colStyle }}
        >
          {concepts.map((concept, col) => {
            // Reverse: latest version first
            const reversed = [...concept.versions].reverse();
            return (
              <div key={concept.id} className="flex flex-col gap-4">
                {reversed.map((version) => {
                  // Map back to the original index for navigation
                  const row = concept.versions.indexOf(version);
                  const thumbFilename = version.thumbnail?.replace('.thumbs/', '') || null;
                  const thumbSrc = thumbFilename
                    ? `/api/thumbs/${client}/${project}/${thumbFilename}`
                    : null;
                  const isStarred = selections.get(concept.id) === version.id;
                  return (
                    <GridCell
                      key={version.id}
                      thumbnail={thumbSrc}
                      conceptLabel={concept.label}
                      versionNumber={version.number}
                      isCurrent={col === conceptIndex && row === versionIndex}
                      isSelected={isStarred}
                      onStar={() => onStarVersion(concept.id, version.id)}
                      onClick={() => onSelect(col, row)}
                      aspectRatio={aspectRatio}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
