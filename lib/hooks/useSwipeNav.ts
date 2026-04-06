'use client';

import { useRef, useCallback, useEffect } from 'react';

interface UseSwipeNavProps {
  enabled: boolean;
  onSwipeLeft: () => void;   // next concept
  onSwipeRight: () => void;  // prev concept
  onSwipeUp: () => void;     // next version (newer)
  onSwipeDown: () => void;   // prev version (older)
  containerRef: React.RefObject<HTMLElement | null>;
  /** Min px distance to count as a swipe */
  threshold?: number;
}

export function useSwipeNav({
  enabled,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  containerRef,
  threshold = 50,
}: UseSwipeNavProps) {
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const swiped = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    // Only single-finger swipes
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    swiped.current = false;
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStart.current || swiped.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.t;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Must complete within 500ms and exceed threshold
    if (dt > 500) { touchStart.current = null; return; }
    if (absDx < threshold && absDy < threshold) { touchStart.current = null; return; }

    swiped.current = true;

    if (absDx > absDy) {
      // Horizontal swipe
      if (dx < -threshold) onSwipeLeft();
      else if (dx > threshold) onSwipeRight();
    } else {
      // Vertical swipe
      if (dy < -threshold) onSwipeUp();
      else if (dy > threshold) onSwipeDown();
    }

    touchStart.current = null;
  }, [enabled, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, enabled, handleTouchStart, handleTouchEnd]);
}
