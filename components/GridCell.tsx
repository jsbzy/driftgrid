'use client';

interface GridCellProps {
  thumbnail: string | null;
  conceptLabel: string;
  versionNumber: number;
  isCurrent: boolean;
  isSelected?: boolean;
  onStar?: () => void;
  onClick: () => void;
  aspectRatio: string;
}

export function GridCell({
  thumbnail,
  conceptLabel,
  versionNumber,
  isCurrent,
  isSelected,
  onStar,
  onClick,
  aspectRatio,
}: GridCellProps) {
  return (
    <div className="w-full relative group">
      <button
        onClick={onClick}
        className="w-full text-left outline-none"
      >
        <div
          className="w-full overflow-hidden rounded transition-all"
          style={{
            aspectRatio,
            border: isSelected
              ? '2px solid #facc15'
              : isCurrent
                ? '2px solid var(--foreground)'
                : '1px solid rgba(0,0,0,0.1)',
            boxShadow: isSelected
              ? '0 0 0 1px rgba(250, 204, 21, 0.3), 0 2px 8px rgba(250, 204, 21, 0.15)'
              : isCurrent
                ? '0 2px 8px rgba(0,0,0,0.08)'
                : '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={`${conceptLabel} v${versionNumber}`}
              className="w-full h-full object-cover object-top"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--background)]">
              <span className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.4 }}>{conceptLabel}</span>
              <span className="text-[10px]" style={{ color: 'var(--foreground)', opacity: 0.25 }}>v{versionNumber}</span>
            </div>
          )}
        </div>
      </button>

      {/* Version label — bottom-left, always visible */}
      <div
        className="absolute bottom-1.5 left-2 text-[10px] font-medium px-1 rounded"
        style={{
          color: 'var(--foreground)',
          opacity: 0.4,
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(4px)',
        }}
      >
        v{versionNumber}
      </div>

      {/* Star button — always visible when selected, hover for unselected */}
      {onStar && (
        <button
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          className={`absolute top-2 right-2 p-1 rounded transition-all duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{
            background: isSelected ? 'rgba(250, 204, 21, 0.9)' : 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(4px)',
          }}
          title={isSelected ? 'Remove from selects' : 'Add to selects'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isSelected ? '#422006' : 'none'} stroke={isSelected ? '#422006' : 'white'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      )}
    </div>
  );
}
