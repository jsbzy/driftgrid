'use client';

interface EditToggleProps {
  editMode: boolean;
  onToggleEdit: () => void;
  editCount: number;
  hasEdits: boolean;
  viewEdited: boolean;
  onToggleView: (edited: boolean) => void;
  onExportPdf?: () => void;
}

export function EditToggle({
  editMode,
  onToggleEdit,
  editCount,
  hasEdits,
  viewEdited,
  onToggleView,
  onExportPdf,
}: EditToggleProps) {
  // When editing, we're always on Alt
  const showingEdited = editMode || viewEdited;

  return (
    <div className="flex items-center gap-3 text-[10px] tracking-wide">
      {/* Original / Alt tabs — visible whenever edits exist */}
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
              <span>Alt</span>
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

      {/* Export PDF — always visible, disabled during edit mode */}
      {onExportPdf && (
        <>
          <span className="text-[var(--border)]">&middot;</span>
          <button
            onClick={editMode ? undefined : onExportPdf}
            className="transition-colors"
            style={{
              color: editMode ? 'var(--border)' : 'var(--muted)',
              cursor: editMode ? 'default' : 'pointer',
            }}
          >
            Export PDF
          </button>
        </>
      )}
    </div>
  );
}
