'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';

interface CanvasCardProps {
  thumbnail: string | null;
  conceptLabel: string;
  versionNumber: number;
  isCurrent: boolean;
  isSelected?: boolean;
  isLatest?: boolean;
  filePath?: string;
  onStar?: () => void;
  onDelete?: () => void;
  onDrift?: () => void;
  onClick: (shiftKey?: boolean) => void;
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
  isCurrent,
  isSelected,
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
  const [isStale, setIsStale] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(thumbnail);
  const [isFading, setIsFading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync thumbSrc when thumbnail prop changes
  useEffect(() => {
    setThumbSrc(thumbnail);
    setIsStale(false);
    setIsFading(false);
    setImgError(false);
  }, [thumbnail]);

  // Stop polling on unmount or when thumbnail changes
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [thumbnail]);

  const handleImageLoad = useCallback(async (e: React.SyntheticEvent<HTMLImageElement>) => {
    const src = (e.target as HTMLImageElement).src;
    if (!src) return;

    try {
      // Abort any previous in-flight request
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const resp = await fetch(src, {
        method: 'HEAD',
        signal: abortRef.current.signal,
      });
      const stale = resp.headers.get('X-Thumbnail-Stale') === 'true';
      setIsStale(stale);

      if (stale) {
        // Poll every 3 seconds until the fresh thumbnail is ready (max 20 attempts = 60s)
        if (pollRef.current) clearInterval(pollRef.current);
        let pollCount = 0;
        const maxPolls = 20;
        pollRef.current = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            // Give up after max attempts
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            return;
          }
          try {
            const pollAbort = new AbortController();
            // Auto-abort after 5 seconds to avoid hanging requests
            const timeoutId = setTimeout(() => pollAbort.abort(), 5000);
            const check = await fetch(src, { method: 'HEAD', signal: pollAbort.signal });
            clearTimeout(timeoutId);
            const stillStale = check.headers.get('X-Thumbnail-Stale') === 'true';

            if (!stillStale) {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              // Fade transition: briefly dim, swap image, then fade in
              setIsFading(true);
              const bustUrl = src.includes('?')
                ? `${src.split('?')[0]}?v=${Date.now()}`
                : `${src}?v=${Date.now()}`;
              setThumbSrc(bustUrl);
              setTimeout(() => {
                setIsStale(false);
                setIsFading(false);
              }, 500);
            }
          } catch {
            // Network error during poll — will retry next interval
          }
        }, 3000);
      }
    } catch {
      // Fetch aborted or network error — ignore
    }
  }, []);

  return (
    <div
      data-card
      className="absolute group"
      style={{
        left: x,
        top: y,
        width,
        height,
        transition: 'transform 150ms ease-out',
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => { if (!isCurrent) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
    >
      <button
        onClick={(e) => onClick(e.shiftKey)}
        onDoubleClick={onDoubleClick}
        className="w-full h-full text-left outline-none"
      >
        <div
          className="w-full h-full overflow-hidden rounded transition-all"
          style={{
            border: isSelected
              ? '2px solid var(--selects-gold)'
              : isCurrent
                ? '2px solid var(--foreground)'
                : '1px solid var(--card-border)',
            boxShadow: isSelected
              ? 'var(--card-shadow-active)'
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
                loading="lazy"
                onLoad={handleImageLoad}
                onError={() => {
                  setImgError(true);
                  // Retry after 3s in case thumbnail is being generated
                  setTimeout(() => setImgError(false), 3000);
                }}
                style={{
                  imageRendering: 'auto' as const,
                  transition: isFading ? 'opacity 0.4s ease' : 'none',
                  opacity: isFading ? 0.6 : 1,
                }}
              />
              {/* Updated indicator — small dot in top-left */}
              {isStale && (
                <div
                  className="absolute top-2 left-2 pointer-events-none flex items-center gap-1.5 px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#facc15' }} />
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>UPDATING</span>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--background)]">
              <span className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.4 }}>{conceptLabel}</span>
              <span className="text-[10px]" style={{ color: 'var(--foreground)', opacity: 0.25 }}>v{versionNumber}</span>
            </div>
          )}
        </div>
      </button>

      {/* Version label */}
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
        {isLatest && (
          <span style={{
            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
            background: '#f59e0b', marginLeft: 4, verticalAlign: 'middle',
          }} />
        )}
      </div>

      {/* Action buttons — top-right, visible on hover */}
      <div className={`absolute top-2 right-2 flex items-center gap-1 transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {onDrift && (
          <button
            onClick={(e) => { e.stopPropagation(); onDrift(); }}
            className="p-1 rounded transition-all duration-200"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
            title="Drift — create new version and copy path"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
            </svg>
          </button>
        )}
        {filePath && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(filePath);
              const btn = e.currentTarget;
              btn.style.background = 'rgba(34,197,94,0.9)';
              setTimeout(() => { btn.style.background = 'rgba(0,0,0,0.35)'; }, 800);
            }}
            className="p-1 rounded transition-all duration-200"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
            title="Copy path to iterate with AI"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded transition-all duration-200"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
            title={`Delete v${versionNumber}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
        {onStar && (
          <button
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            className="p-1 rounded transition-all duration-200"
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


    </div>
  );
});
