'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimatedDots } from './AnimatedDots';

interface EditToggleProps {
  editMode: boolean;
  onToggleEdit: () => void;
  editCount: number;
  hasEdits: boolean;
  viewEdited: boolean;
  onToggleView: (edited: boolean) => void;
  onExportPdf?: () => Promise<void> | void;
  onExportHtml?: () => Promise<void> | void;
  onClearEdits?: () => void;
}

export function EditToggle({
  editMode,
  onToggleEdit,
  editCount,
  hasEdits,
  viewEdited,
  onToggleView,
  onExportPdf,
  onExportHtml,
  onClearEdits,
}: EditToggleProps) {
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);
  // When editing, we're always on Revision
  const showingEdited = editMode || viewEdited;

  return (
    <div className="flex items-center gap-3 text-[10px] tracking-wide">
      {/* Original / Revision tabs — visible whenever edits exist */}
      {hasEdits && (
        <>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => { if (editMode) onToggleEdit(); onToggleView(false); }}
              className="px-1.5 py-0.5 rounded-sm transition-colors"
              style={{
                color: !showingEdited ? 'var(--foreground)' : 'var(--muted)',
                backgroundColor: !showingEdited ? 'rgba(0,0,0,0.05)' : 'transparent',
                fontWeight: !showingEdited ? 500 : 400,
              }}
            >
              Original
            </button>
            <button
              onClick={() => onToggleView(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm transition-colors"
              style={{
                color: showingEdited ? 'rgb(20, 184, 166)' : 'var(--muted)',
                backgroundColor: showingEdited ? 'rgba(20, 184, 166, 0.08)' : 'transparent',
                fontWeight: showingEdited ? 500 : 400,
              }}
            >
              <span>Revision</span>
              <span
                className="inline-flex items-center justify-center rounded-full text-[8px] font-medium leading-none"
                style={{
                  width: 14,
                  height: 14,
                  backgroundColor: showingEdited ? 'rgb(20, 184, 166)' : 'var(--muted)',
                  color: 'white',
                }}
              >
                {editCount}
              </span>
            </button>
          </div>
          <span className="text-[var(--border)]">&middot;</span>
        </>
      )}

      {/* Edit mode toggle — label + mini switch */}
      <button
        onClick={onToggleEdit}
        className="flex items-center gap-1.5 transition-colors hover:opacity-80"
        style={{ color: editMode ? 'rgb(20, 184, 166)' : 'var(--muted)' }}
      >
        <span>Edit Mode</span>
        {/* Mini toggle switch */}
        <span
          className="relative inline-flex items-center rounded-full transition-colors"
          style={{
            width: 24,
            height: 13,
            backgroundColor: editMode ? 'rgb(20, 184, 166)' : 'rgba(0,0,0,0.15)',
          }}
        >
          <span
            className="inline-block rounded-full bg-white transition-transform"
            style={{
              width: 9,
              height: 9,
              transform: editMode ? 'translateX(13px)' : 'translateX(2px)',
            }}
          />
        </span>
      </button>

      {/* Clear Edits — visible when editing and edits exist */}
      {editMode && hasEdits && onClearEdits && (
        <>
          <span className="text-[var(--border)]">&middot;</span>
          <button
            onClick={onClearEdits}
            className="transition-colors hover:opacity-80"
            style={{ color: 'var(--muted)' }}
          >
            Clear Edits
          </button>
        </>
      )}

      {/* Export dropdown */}
      {(onExportPdf || onExportHtml) && (
        <>
          <span className="text-[var(--border)]">&middot;</span>
          <div ref={exportRef} className="relative">
            <button
              onClick={editMode ? undefined : () => setExportOpen(v => !v)}
              className="transition-colors"
              style={{
                color: editMode ? 'var(--border)' : exporting ? 'var(--muted)' : 'var(--muted)',
                cursor: editMode ? 'default' : 'pointer',
              }}
            >
              {exporting ? <><span>Exporting</span><AnimatedDots /></> : 'Export'}
            </button>
            {exportOpen && !editMode && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] py-1 rounded-sm border border-[var(--border)] bg-[var(--background)] shadow-sm">
                {onExportPdf && (
                  <button
                    onClick={async () => {
                      setExportOpen(false);
                      setExporting(true);
                      try { await onExportPdf(); } finally { setExporting(false); }
                    }}
                    className="block w-full text-left px-3 py-1.5 text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[rgba(0,0,0,0.04)] transition-colors"
                  >
                    PDF
                  </button>
                )}
                {onExportHtml && (
                  <button
                    onClick={async () => {
                      setExportOpen(false);
                      setExporting(true);
                      try { await onExportHtml(); } finally { setExporting(false); }
                    }}
                    className="block w-full text-left px-3 py-1.5 text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[rgba(0,0,0,0.04)] transition-colors"
                  >
                    HTML
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
