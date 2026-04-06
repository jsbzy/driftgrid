'use client';

import type { Annotation } from '@/lib/types';

interface MobileAnnotationListProps {
  annotations: Annotation[];
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onPinTap?: (annotation: Annotation) => void;
  conceptLabel?: string;
  versionLabel?: string;
}

export function MobileAnnotationList({
  annotations,
  onResolve,
  onDelete,
  onPinTap,
  conceptLabel,
  versionLabel,
}: MobileAnnotationListProps) {
  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6" style={{ minHeight: 200 }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ opacity: 0.3 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <div className="mt-3 text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          No feedback yet
        </div>
        <div className="mt-1 text-[10px]" style={{ color: 'var(--muted)', opacity: 0.5, fontFamily: 'var(--font-mono, monospace)' }}>
          Tap the + button to add a comment
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      {/* Header */}
      {(conceptLabel || versionLabel) && (
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] tracking-wide" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            {conceptLabel} {versionLabel && `· ${versionLabel}`} · {annotations.length} comment{annotations.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Annotation items */}
      {annotations.map((annotation, index) => (
        <div
          key={annotation.id}
          className="flex items-start gap-3 px-4 py-3 border-b"
          style={{
            borderColor: 'var(--border)',
            opacity: annotation.resolved ? 0.5 : 1,
          }}
          onClick={() => onPinTap?.(annotation)}
        >
          {/* Pin number */}
          <div
            className="shrink-0 flex items-center justify-center rounded-full"
            style={{
              width: 24,
              height: 24,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              color: '#fff',
              background: annotation.isClient ? 'var(--accent-orange)' : 'var(--foreground)',
            }}
          >
            {index + 1}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div
              className="text-xs leading-relaxed"
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--foreground)',
                textDecoration: annotation.resolved ? 'line-through' : 'none',
                wordBreak: 'break-word',
              }}
            >
              {annotation.text}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[9px]" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                {annotation.isClient ? annotation.author : 'designer'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0 flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onResolve(annotation.id); }}
              className="p-2 rounded-md transition-colors"
              style={{
                background: annotation.resolved ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: annotation.resolved ? 'rgb(34,197,94)' : 'var(--muted)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(annotation.id); }}
              className="p-2 rounded-md transition-colors"
              style={{ color: 'var(--muted)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
