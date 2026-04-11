'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Tracks which versions the user has "viewed" (opened in frame view).
 * Versions not in the viewed set are "unread" and get a subtle indicator dot.
 *
 * Storage:
 * - Local mode: localStorage `driftgrid-viewed-{client}-{project}` per project
 * - Demo/share mode: in-memory only (refresh resets)
 *
 * On first project load, all existing versions are bulk-marked as read so the grid
 * doesn't light up entirely. Future versions added after that load are unread by default.
 */
export function useUnreadVersions(
  client: string,
  project: string,
  isDemoMode: boolean = false,
) {
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const initialized = useRef(false);
  const storageKey = `driftgrid-viewed-${client}-${project}`;

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    if (isDemoMode) {
      // Demo mode: start with empty set (everything is read on first load below)
      initialized.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setViewed(new Set(JSON.parse(raw)));
      }
    } catch {
      // ignore
    }
    initialized.current = true;
  }, [storageKey, isDemoMode]);

  /** Mark a version as read (call when user opens it in frame view). */
  const markRead = useCallback((conceptId: string, versionId: string) => {
    const key = `${conceptId}:${versionId}`;
    setViewed(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      if (!isDemoMode) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [storageKey, isDemoMode]);

  /** Bulk-mark a list of version keys as read. Used on first project load. */
  const markAllRead = useCallback((keys: string[]) => {
    setViewed(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const k of keys) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      if (!changed) return prev;
      if (!isDemoMode) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [storageKey, isDemoMode]);

  /** Check if a version is unread (true) or already viewed (false). */
  const isUnread = useCallback((conceptId: string, versionId: string) => {
    return !viewed.has(`${conceptId}:${versionId}`);
  }, [viewed]);

  return { isUnread, markRead, markAllRead, initialized: initialized.current };
}
