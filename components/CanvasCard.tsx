'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';

interface CanvasCardProps {
  thumbnail: string | null;
  conceptLabel: string;
  versionNumber: number;
  coordinate?: string;
  iterationLetter?: string;
  isCurrent: boolean;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isLatest?: boolean;
  filePath?: string;
  onStar?: () => void;
  onDelete?: () => void;
  onDrift?: () => void;
  onClick: (shiftKey?: boolean, metaKey?: boolean) => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CanvasCard = memo(function CanvasCard({
  thumbnail,
  conceptLabel,
  versionNumber,
  coordinate,
  iterationLetter,
  isCurrent,
  isSelected,
  isMultiSelected,
  isLatest,
  filePath,
  onStar,
  onDelete,
  onDrift,
  onClick,
  onDoubleClick,
  onContextMenu,
  x,
  y,
  width,
  height,
}: CanvasCardProps) {
  const [imgError, setImgError] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(thumbnail);

  useEffect(() => {
    setThumbSrc(thumbnail);
    setImgError(false);
  }, [thumbnail]);

  // No per-card stale checking — SSE file watcher handles cache busting via thumbVersion

  return (
    <div
      data-card
      className="absolute group"
      style={{
        left: x,
        top: y,
        width,
        height,
      }}
      onContextMenu={onContextMenu}
    >
      <button
        onClick={(e) => onClick(e.shiftKey, e.metaKey || e.ctrlKey)}
        onDoubleClick={onDoubleClick}
        className="w-full h-full text-left outline-none transition-transform duration-150 hover:-translate-y-0.5"
      >
        <div
          className="w-full h-full overflow-hidden rounded transition-all"
          style={{
            border: isMultiSelected
              ? '2px solid var(--accent-teal)'
              : isCurrent
                ? '2px solid var(--foreground)'
                : '1px solid var(--card-border)',
            boxShadow: isMultiSelected
              ? '0 0 0 2px rgba(45, 212, 191, 0.2)'
              : isCurrent
              ? 'var(--card-shadow-active)'
              : 'var(--card-shadow)',
            background: 'var(--card-bg)',
            position: 'relative',
          }}
        >
          {thumbSrc && !imgError ? (
            <>
              <img
                src={thumbSrc}
                alt={`${conceptLabel} v${versionNumber}`}
                className="w-full h-full object-cover object-top"
                draggable={false}
                onError={() => {
                  setImgError(true);
                  setTimeout(() => setImgError(false), 3000);
                }}
              />
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--background)]">
              <span className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.4 }}>{conceptLabel}</span>
              <span className="text-[10px]" style={{ color: 'var(--foreground)', opacity: 0.25 }}>v{versionNumber}</span>
            </div>
          )}
        </div>
      </button>

      {/* Grid coordinate — top-left */}
      {coordinate && (
        <div
          className="absolute top-1.5 left-2 text-[10px] font-semibold px-1 rounded pointer-events-none"
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            color: 'var(--foreground)',
            opacity: 0.15,
          }}
        >
          {coordinate}
        </div>
      )}

      {/* Iteration letter — bottom-right */}
      <div
        className="absolute bottom-1.5 right-2 text-[10px] font-medium px-1 rounded"
        style={{
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          color: 'var(--foreground)',
          opacity: 0.4,
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {iterationLetter || `v${versionNumber}`}
        {isLatest && (
          <span style={{
            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
            background: '#f59e0b', marginLeft: 4, verticalAlign: 'middle',
          }} />
        )}
      </div>

      {/* Star button — top-right corner */}
      {onStar && (
        <button
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          className="absolute top-2 right-2 p-1 rounded transition-all"
          style={{
            background: isSelected ? 'transparent' : 'transparent',
            opacity: isSelected ? 1 : 0.3,
            zIndex: 5,
          }}
          title={isSelected ? 'Remove from selects' : 'Add to selects (S)'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24"
            fill={isSelected ? '#facc15' : 'none'}
            stroke={isSelected ? '#facc15' : 'var(--foreground)'}
            strokeWidth="2"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      )}

    </div>
  );
});
