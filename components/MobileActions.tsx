'use client';

import { useState } from 'react';

interface MobileActionsProps {
  onStar: () => void;
  onDrift?: () => void;
  onAnnotate: () => void;
  onBranch?: () => void;
  isStarred?: boolean;
  isAnnotating?: boolean;
  isDesigner?: boolean;
}

export function MobileActions({
  onStar,
  onDrift,
  onAnnotate,
  onBranch,
  isStarred,
  isAnnotating,
  isDesigner,
}: MobileActionsProps) {
  const [expanded, setExpanded] = useState(false);

  const btnStyle = "flex items-center justify-center rounded-full transition-all";
  const subBtnSize = 40;
  const mainBtnSize = 48;

  return (
    <div className="md:hidden fixed bottom-20 right-4 z-40 flex flex-col-reverse items-center gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Sub-actions (shown when expanded) */}
      {expanded && (
        <div className="flex flex-col-reverse items-center gap-2" style={{ animation: 'fabExpand 150ms ease-out' }}>
          {/* Star */}
          <button
            onClick={() => { onStar(); setExpanded(false); }}
            className={btnStyle}
            style={{
              width: subBtnSize,
              height: subBtnSize,
              background: isStarred ? '#facc15' : 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
            title="Star"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isStarred ? '#fff' : 'none'} stroke="white" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>

          {/* Drift — designer only */}
          {isDesigner && onDrift && (
            <button
              onClick={() => { onDrift(); setExpanded(false); }}
              className={btnStyle}
              style={{
                width: subBtnSize,
                height: subBtnSize,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
              title="New version"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
              </svg>
            </button>
          )}

          {/* Branch — designer only */}
          {isDesigner && onBranch && (
            <button
              onClick={() => { onBranch(); setExpanded(false); }}
              className={btnStyle}
              style={{
                width: subBtnSize,
                height: subBtnSize,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
              title="New concept"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </button>
          )}

          {/* Annotate */}
          <button
            onClick={() => { onAnnotate(); setExpanded(false); }}
            className={btnStyle}
            style={{
              width: subBtnSize,
              height: subBtnSize,
              background: isAnnotating ? 'var(--accent-orange)' : 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
            title="Comment"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isAnnotating ? 'white' : 'none'} stroke="white" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={btnStyle}
        style={{
          width: mainBtnSize,
          height: mainBtnSize,
          background: expanded ? 'var(--foreground)' : 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          transform: expanded ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 200ms ease, background 200ms ease',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <style>{`
        @keyframes fabExpand {
          from { opacity: 0; transform: scale(0.8) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
