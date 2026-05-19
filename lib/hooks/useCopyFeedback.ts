'use client';

import { useCallback, useRef, useState } from 'react';
import { copyTextSafely } from '@/lib/clipboard';

/**
 * Shared "copy to clipboard + flash 'Copied!'" UI pattern.
 *
 * Replaces the inline `setCopied(true); setTimeout(() => setCopied(false), 2000)`
 * dance that was duplicated across 6+ components. Uses `copyTextSafely` so it
 * works on insecure origins (the `driftgrid.local` over plain HTTP case) — the
 * raw `navigator.clipboard.writeText` calls those components had don't.
 *
 * Returns the boolean `copied` for label/toast rendering, and a `copy(text)`
 * function. Reuses one timer so rapid copies don't stack timeouts.
 */
export function useCopyFeedback(durationMs: number = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    const ok = await copyTextSafely(text);
    if (!ok) return false;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, durationMs);
    return true;
  }, [durationMs]);

  return { copied, copy };
}
