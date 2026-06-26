'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from '@/components/Toast';

// Same localStorage store the SharePanel writes on connect, so signing in once
// (via Share) makes Sync work too. Shape: { accessToken, refreshToken, email, expiresAt }.
const STORAGE_KEY = 'driftgrid-cloud-auth';

type StoredCreds = { accessToken?: string; refreshToken?: string; email?: string; expiresAt?: number };

function getCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export type SyncState = 'idle' | 'syncing' | 'done' | 'error';

/**
 * Drives POST /api/cloud/sync — pushes the whole project to cloud and reports
 * progress. Mirrors the SharePanel stream consumer, minus the share step.
 */
export function useCloudSync(client: string, project: string) {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncProgress, setSyncProgress] = useState('');
  const running = useRef(false);

  const runSync = useCallback(async () => {
    if (running.current) return;

    const creds = getCreds();
    if (!creds?.accessToken) {
      toast('Connect to DriftGrid Cloud first — open Share to sign in.', 'error');
      return;
    }

    running.current = true;
    setSyncState('syncing');
    setSyncProgress('Verifying…');

    // Stall watchdog — surface an error if no event arrives for 45s.
    let lastEventAt = Date.now();
    const stall = setInterval(() => {
      if (Date.now() - lastEventAt > 45000) {
        clearInterval(stall);
        setSyncState('error');
        setSyncProgress('');
        toast('Sync stalled — the project may be large or the network is unreachable.', 'error');
        running.current = false;
      }
    }, 5000);

    try {
      const res = await fetch('/api/cloud/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client,
          project,
          accessToken: creds.accessToken,
          refreshToken: creds.refreshToken,
          includeMedia: false,
        }),
      });

      if (!res.ok || !res.body) {
        clearInterval(stall);
        setSyncState('error');
        setSyncProgress('');
        toast(`Sync failed (${res.status})`, 'error');
        running.current = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalFiles = 0;
      let finished = false;

      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          lastEventAt = Date.now();

          let evt: { type: string; [k: string]: unknown };
          try { evt = JSON.parse(line); } catch { continue; }

          switch (evt.type) {
            case 'phase': {
              if (evt.phase === 'verifying') setSyncProgress('Verifying…');
              else if (evt.phase === 'scanning') setSyncProgress('Scanning…');
              else if (evt.phase === 'pushing') {
                totalFiles = (evt.totalFiles as number) || 0;
                setSyncProgress(`0 / ${totalFiles}`);
              }
              break;
            }
            case 'progress': {
              const up = (evt.uploaded as number) ?? 0;
              const tot = (evt.total as number) || totalFiles;
              setSyncProgress(`${up} / ${tot}`);
              break;
            }
            case 'newTokens': {
              try {
                const merged = {
                  ...(getCreds() || {}),
                  accessToken: evt.accessToken as string,
                  refreshToken: evt.refreshToken as string,
                  expiresAt: Date.now() + 3600 * 1000,
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
              } catch { /* ignore */ }
              break;
            }
            case 'needsAuth': {
              clearInterval(stall);
              setSyncState('error');
              setSyncProgress('');
              toast('Cloud session expired — open Share to reconnect.', 'error');
              finished = true;
              break;
            }
            case 'error': {
              clearInterval(stall);
              setSyncState('error');
              setSyncProgress('');
              toast((evt.error as string) || 'Sync failed', 'error');
              finished = true;
              break;
            }
            case 'done': {
              clearInterval(stall);
              const n = (evt.filesUploaded as number) ?? 0;
              const sk = (evt.filesSkipped as number) || 0;
              setSyncState('done');
              setSyncProgress('');
              toast(sk ? `Synced ✓ ${n} files · ${sk} skipped` : `Synced ✓ ${n} files`);
              finished = true;
              break;
            }
          }
          if (finished) break;
        }
      }
      clearInterval(stall);
    } catch {
      clearInterval(stall);
      setSyncState('error');
      setSyncProgress('');
      toast('Could not reach DriftGrid Cloud. Check your connection.', 'error');
    } finally {
      running.current = false;
    }
  }, [client, project]);

  return { syncState, syncProgress, runSync };
}
