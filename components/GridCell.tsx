'use client';

interface GridCellProps {
  thumbnail: string | null;
  conceptLabel: string;
  versionNumber: number;
  isCurrent: boolean;
  isSelected?: boolean;
  onClick: () => void;
  aspectRatio: string;
}

export function GridCell({
  thumbnail,
  conceptLabel,
  versionNumber,
  isCurrent,
  isSelected,
  onClick,
  aspectRatio,
}: GridCellProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left group outline-none"
    >
      <div
        className="w-full overflow-hidden rounded-sm transition-colors"
        style={{
          aspectRatio,
          border: isCurrent
            ? '2px solid var(--foreground)'
            : isSelected
              ? '1px solid var(--muted)'
              : '1px solid var(--border)',
        }}
        onMouseEnter={(e) => {
          if (!isCurrent && !isSelected) (e.currentTarget.style.borderColor = 'var(--muted)');
        }}
        onMouseLeave={(e) => {
          if (!isCurrent && !isSelected) (e.currentTarget.style.borderColor = 'var(--border)');
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
            <span className="text-xs font-medium text-[var(--foreground)] opacity-60">{conceptLabel}</span>
            <span className="text-[10px] text-[var(--muted)]">v{versionNumber}</span>
          </div>
        )}
      </div>
    </button>
  );
}
