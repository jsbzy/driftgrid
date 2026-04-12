'use client';

import { useState, useEffect, memo } from 'react';

interface CanvasCardProps {
  thumbnail: string | null;
  conceptLabel: string;
  versionNumber: number;
  iterationLetter?: string;
  isCurrent: boolean;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isLatest?: boolean;
  unread?: boolean;
  filePath?: string;
  mode?: string;
  demoSlot?: boolean;
  isEmptySlot?: boolean;
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
  unread,
  filePath,
  mode,
  demoSlot,
  isEmptySlot,
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
      {/* Selection ring — sibling of button so it's not clipped by overflow:hidden */}
      {isCurrent && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: -4,
            left: -4,
            right: -4,
            bottom: -4,
            borderRadius: 'calc(var(--radius-md) + 4px)',
            border: '3px solid #8b5cf6',
            boxSizing: 'border-box',
            zIndex: 20,
          }}
        />
      )}
      {isMultiSelected && !isCurrent && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            borderRadius: 'calc(var(--radius-md) + 2px)',
            border: '2px solid rgba(139, 92, 246, 0.5)',
            boxSizing: 'border-box',
            zIndex: 19,
          }}
        />
      )}
      {/* Unread indicator — small purple dot in top-right */}
      {unread && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: 10,
            right: 10,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#8b5cf6',
            boxShadow: '0 0 0 3px rgba(139, 92, 246, 0.15)',
            zIndex: 21,
          }}
        />
      )}
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
            boxShadow: 'var(--card-shadow)',
            background: 'var(--card-bg)',
            position: 'relative',
          }}
        >
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
          ) : isEmptySlot ? (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3"
              style={{
                background: '#0f0f0f',
                borderRadius: 'inherit',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.35 }}>
                Awaiting prompt
              </div>
              <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', padding: '0 24px', lineHeight: 1.5 }}>
                Press <span style={{ padding: '1px 6px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', fontSize: 11 }}>C</span> to prompt your agent
              </div>
              <div style={{ fontSize: 9, opacity: 0.2, letterSpacing: '0.08em', marginTop: 8 }}>
                v{versionNumber}
              </div>
            </div>
          ) : thumbSrc && !imgError ? (
            <img
              key={thumbSrc}
              src={thumbSrc}
              alt={`${conceptLabel} v${versionNumber}`}
              className="w-full h-full object-cover object-top"
              draggable={false}
              decoding="async"
              onError={() => {
                setImgError(true);
                setTimeout(() => setImgError(false), 3000);
              }}
            />
          ) : (
            <div className="w-full h-full bg-[var(--background)]" style={{ padding: '14% 12%' }}>
              {/* Content skeleton — indicates a design is loading */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8%', opacity: 0.12 }}>
                <div style={{ width: '35%', height: 8, borderRadius: 4, background: 'var(--foreground)' }} />
                <div style={{ width: '80%', height: 14, borderRadius: 4, background: 'var(--foreground)' }} />
                <div style={{ width: '65%', height: 14, borderRadius: 4, background: 'var(--foreground)' }} />
                <div style={{ marginTop: '4%', display: 'flex', flexDirection: 'column', gap: '6%' }}>
                  <div style={{ width: '90%', height: 6, borderRadius: 3, background: 'var(--foreground)' }} />
                  <div style={{ width: '75%', height: 6, borderRadius: 3, background: 'var(--foreground)' }} />
                  <div style={{ width: '85%', height: 6, borderRadius: 3, background: 'var(--foreground)' }} />
                </div>
                <div style={{ marginTop: '6%', width: '25%', height: 10, borderRadius: 4, background: 'var(--foreground)' }} />
              </div>
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
