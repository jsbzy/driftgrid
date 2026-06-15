'use client';

import { useState, useEffect, useLayoutEffect } from 'react';

// useLayoutEffect warns when run during SSR. The hook is client-only in practice
// (it gates a 'use client' Viewer), but guard the import so it degrades to
// useEffect if ever evaluated on the server.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const QUERY = '(max-width: 768px)';

/**
 * Returns whether the viewport is mobile-sized.
 *
 *   - SSR-safe: returns `null` until mounted on the client, so callers can
 *     render a neutral loading shell instead of flashing the desktop tree or
 *     causing a hydration mismatch. Never branch on `typeof window` in render.
 *   - Width only (no `pointer: coarse`) so a narrow desktop window still gets
 *     the safe mobile path.
 *   - Subscribes to the MediaQueryList `change` event so it stays correct on
 *     rotate / resize.
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
