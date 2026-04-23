'use client';

import { useEffect, useRef, useState } from 'react';
import type { Version } from '@/lib/types';

/**
 * SSE hot reload — listens for file changes in dev mode and bumps
 * a version counter to trigger iframe refresh.
 */
export function useHotReload(
  viewMode: 'frame' | 'grid',
  client: string,
  project: string,
  currentVersion: Version | undefined
) {
  const currentVersionRef = useRef(currentVersion);
  currentVersionRef.current = currentVersion;
  const [frameVersion, setFrameVersion] = useState(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (viewMode !== 'frame') return;

    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const qs = new URLSearchParams({ client, project }).toString();
      es = new EventSource(`/api/watch?${qs}`);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'file-changed') return;
          const cv = currentVersionRef.current;
          if (!cv) return;
          const changedFile = (data.file as string).replace(/\\/g, '/');
          const versionFile = cv.file.replace(/\\/g, '/');
          if (versionFile === changedFile || versionFile.endsWith('/' + changedFile) || changedFile.endsWith('/' + versionFile)) {
            setFrameVersion(v => v + 1);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es?.close(); reconnectTimeout = setTimeout(connect, 5000); };
    }
    connect();
    return () => { es?.close(); if (reconnectTimeout) clearTimeout(reconnectTimeout); };
  }, [viewMode, client, project]);

  return frameVersion;
}
