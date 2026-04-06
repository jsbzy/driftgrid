'use client';

import { useEffect, useRef, useCallback } from 'react';

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Max height as CSS value, default '80vh' */
  maxHeight?: string;
}

export function MobileBottomSheet({ open, onClose, title, children, maxHeight = '80vh' }: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Swipe down to dismiss
  const touchStart = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStart.current;
    if (delta > 80) onClose();
    touchStart.current = null;
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
        style={{
          background: 'var(--background)',
          borderTop: '1px solid var(--border)',
          maxHeight,
          animation: 'sheetSlideUp 250ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="w-8 h-1 rounded-full" style={{ background: 'var(--muted)', opacity: 0.3 }} />
        </div>
        {title && (
          <div
            className="px-4 pb-2 text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {title}
          </div>
        )}
        <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - 48px)`, paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
          {children}
        </div>
      </div>
      <style>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
