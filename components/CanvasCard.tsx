'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';

interface CanvasCardProps {
  thumbnail: string | null;
  conceptLabel: string;
  versionNumber: number;
  iterationLetter?: string;
  isCurrent: boolean;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isLatest?: boolean;
  filePath?: string;
  mode?: string;
  demoSlot?: boolean;
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
  iterationLetter,
  isCurrent,
  isSelected,
  isMultiSelected,
  isLatest,
  filePath,
  mode,
  demoSlot,
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
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(thumbnail);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setThumbSrc(thumbnail);
    setImgError(false);
    setImgLoaded(false);
  }, [thumbnail]);

  // Handle images loaded from browser cache before React's onLoad fires
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setImgLoaded(true);
    }
  }, [thumbSrc]);

  return (
    <div
      data-card
      className="absolute group"
      style={{
        left: x,
        top: y,
        width,
        height,
        transition: 'left 0.5s cubic-bezier(0.16, 1, 0.3, 1), top 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onContextMenu={onContextMenu}
    >
      <button
        onClick={(e) => onClick(e.shiftKey, e.metaKey || e.ctrlKey)}
        onDoubleClick={onDoubleClick}
        className="w-full h-full text-left outline-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
      >
        <div
          className="w-full h-full overflow-hidden transition-all duration-150 card-inner"
          style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--card-border)',
            outline: isCurrent
              ? '2px solid var(--column-accent)'
              : isMultiSelected
              ? '1.5px solid var(--card-outline-focus)'
              : undefined,
            outlineOffset: isCurrent ? 3 : 2,
            opacity: (isMultiSelected || isCurrent) ? undefined : undefined,
            boxShadow: 'var(--card-shadow)',
            background: 'var(--card-bg)',
            position: 'relative',
          }}
        >
          {/* Latest version indicator — gold left edge bar */}
          {isLatest && (
            <div
              className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none"
              style={{
                width: 3,
                background: 'var(--selects-gold, #facc15)',
                borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
              }}
            />
          )}

          {demoSlot ? (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{
                background: 'transparent',
                border: '1.5px dashed var(--border)',
                borderRadius: 'inherit',
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.4 }}>
                Empty slot
              </div>
              <div style={{ fontSize: 11, opacity: 0.3, textAlign: 'center', padding: '0 24px', lineHeight: 1.5 }}>
                Direct your agent<br />to fill this in
              </div>
              <div style={{ fontSize: 9, opacity: 0.25, letterSpacing: '0.08em', marginTop: 4 }}>
                v{versionNumber}
              </div>
            </div>
          ) : thumbSrc && !imgError ? (
            <>
              {/* Lightweight placeholder while image loads */}
              {!imgLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--card-bg)]">
                  <span className="text-[10px]" style={{ color: 'var(--foreground)', opacity: 0.15 }}>
                    {iterationLetter || `v${versionNumber}`}
                  </span>
                </div>
              )}
              <img
                ref={imgRef}
                src={thumbSrc}
                alt={`${conceptLabel} v${versionNumber}`}
                className="w-full h-full object-cover object-top"
                style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.15s ease' }}
                draggable={false}
                decoding="async"
                onLoad={() => setImgLoaded(true)}
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


      {/* Iteration letter — bottom-right (no backdropFilter — too expensive during pan) */}
      <div
        className="absolute bottom-1.5 right-2 text-[10px] font-medium px-1 rounded"
        style={{
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          color: 'var(--foreground)',
          opacity: 0.4,
          background: 'rgba(255,255,255,0.85)',
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

      {/* Reorder hint — shown on current card, hidden in client mode */}
      {isCurrent && mode !== 'client' && (
        <div
          className="absolute -bottom-5 left-0 right-0 text-center pointer-events-none"
          style={{ fontSize: 9, opacity: 0.3, color: 'var(--foreground)', letterSpacing: '0.04em' }}
        >
          ⌥ arrows to move
        </div>
      )}

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
