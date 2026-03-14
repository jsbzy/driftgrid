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
  onToggleSelectMode,
  mode,
}: GridViewProps) {
  const maxVersions = Math.max(...concepts.map(c => c.versions.length));
  const gridCols = `48px repeat(${concepts.length}, 1fr)`;
  const hasSelections = selections.size > 0;

  // Build the thumbnail row for a given set of selections
  const renderSelectsRow = (sels: Map<string, string>) => (
    <div
      className="grid gap-3 px-8 pb-2"
      style={{ gridTemplateColumns: gridCols }}
    >
      <div />
      {concepts.map((concept) => {
        const selectedVersionId = sels.get(concept.id);

        if (selectedVersionId) {
          const version = concept.versions.find(v => v.id === selectedVersionId);
          if (version) {
            const thumbSrc = version.thumbnail
              ? `/api/thumbs/${client}/${project}/${version.id}.png`
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

        // Empty slot
        return (
          <div
            key={concept.id}
            className="w-full rounded-sm"
            style={{
              aspectRatio,
              border: '1px dashed var(--border)',
            }}
            onClick={() => {
              if (!selectMode) onToggleSelectMode();
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Column headers */}
      <div
        className="grid gap-3 px-8 pt-8 pb-3"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div />
        {concepts.map(c => (
          <div
            key={c.id}
            className="text-[10px] font-medium tracking-widest uppercase text-[var(--muted)] truncate"
          >
            {c.label}
          </div>
        ))}
      </div>

      {/* Selects area — designer mode only */}
      {mode !== 'client' && (
        <>
          {/* Set tabs + controls */}
          <div className="flex items-center gap-3 px-8 pb-2">
            {/* Edit / Done toggle */}
            <button
              onClick={onToggleSelectMode}
              className="text-[10px] tracking-wide transition-colors whitespace-nowrap"
              style={{
                color: selectMode ? 'var(--foreground)' : 'var(--border)',
              }}
            >
              {selectMode ? 'Done' : 'Edit'}
            </button>

            {/* Saved set tabs */}
            {workingSets.length > 0 && (
              <span className="text-[var(--border)]">·</span>
            )}
            {workingSets.map(ws => (
              <button
                key={ws.id}
                onClick={() => onLoadWorkingSet(ws.id)}
                className="text-[10px] tracking-wide transition-colors"
                style={{
                  color: ws.id === activeWorkingSetId
                    ? 'var(--foreground)'
                    : 'var(--muted)',
                  fontWeight: ws.id === activeWorkingSetId ? 500 : 400,
                }}
              >
                {ws.name}
              </button>
            ))}

            {/* Save / Clear actions */}
            {hasSelections && (
              <>
                <span className="text-[var(--border)]">·</span>
                <button
                  onClick={onSaveWorkingSet}
                  className="text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Save set
                </button>
                <button
                  onClick={onClearSelections}
                  className="text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Active selects row */}
          {renderSelectsRow(selections)}

          {/* Spacer */}
          <div className="h-4" />
        </>
      )}

      {/* Grid body */}
      <div className="flex-1 overflow-auto px-8 pb-8">
        <div className="flex flex-col gap-3">
          {Array.from({ length: maxVersions }, (_, row) => (
            <div
              key={row}
              className="grid gap-3"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="flex items-center justify-end pr-2 text-[10px] text-[var(--muted)] tracking-wide">
                v{row + 1}
              </div>
              {concepts.map((concept, col) => {
                const version = concept.versions[row];
                if (!version) {
                  return <div key={`${col}-${row}`} />;
                }
                const thumbSrc = version.thumbnail
                  ? `/api/thumbs/${client}/${project}/${version.id}.png`
                  : null;
                return (
                  <GridCell
                    key={`${col}-${row}`}
                    thumbnail={thumbSrc}
                    conceptLabel={concept.label}
                    versionNumber={version.number}
                    isCurrent={col === conceptIndex && row === versionIndex}
                    isSelected={selections.get(concept.id) === version.id}
                    onClick={() => onSelect(col, row)}
                    aspectRatio={aspectRatio}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
