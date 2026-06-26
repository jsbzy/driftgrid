'use client';

import { useState, useCallback, useRef } from 'react';
import { toast } from '@/components/Toast';
import { getStoredCredentials, connectToCloud, storeCredentials } from '@/lib/cloud-auth';

export type SyncState = 'idle' | 'connecting' | 'syncing' | 'done' | 'error';

type StreamOutcome = 'done' | 'needsAuth' | 'error';

/**
 * Drives POST /api/cloud/sync — pushes the whole project to cloud and reports
 * progress. Self-sufficient on auth: if there's no cloud session (or it expires
 * mid-sync and can't refresh), it opens the sign-in popup directly — no detour
 * through Share — then proceeds / retries.
 */
export function useCloudSync(client: string, project: string) {
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncProgress, setSyncProgress] = useState('');
  const running = useRef(false);

  const runSync = useCallback(async () => {
    if (running.current) return;

    /** One sync attempt against the given token. Returns its terminal outcome. */
    const streamOnce = async (accessToken: string, refreshToken?: string): Promise<StreamOutcome> => {
      setSyncState('syncing');
      setSyncProgress('Verifying…');

      // Stall watchdog — abort if no event arrives for 45s.
      const controller = new AbortController();
      let lastEventAt = Date.now();
      const stall = setInterval(() => {
        if (Date.now() - lastEventAt > 45000) {
          clearInterval(stall);
          controller.abort();
        }
      }, 5000);

      try {
        const res = await fetch('/api/cloud/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client, project, accessToken, refreshToken, includeMedia: false }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          clearInterval(stall);
          toast(`Sync failed (${res.status})`, 'error');
          return 'error';
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let totalFiles = 0;
        let outcome: StreamOutcome | null = null;

        while (outcome === null) {
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
                storeCredentials({
                  ...(getStoredCredentials() || { accessToken: '' }),
                  accessToken: evt.accessToken as string,
                  refreshToken: evt.refreshToken as string,
                  expiresAt: Date.now() + 3600 * 1000,
                });
                break;
              }
              case 'needsAuth': outcome = 'needsAuth'; break;
              case 'error':
                toast((evt.error as string) || 'Sync failed', 'error');
                outcome = 'error';
                break;
              case 'done': {
                const n = (evt.filesUploaded as number) ?? 0;
                const sk = (evt.filesSkipped as number) || 0;
                toast(sk ? `Synced ✓ ${n} files · ${sk} skipped` : `Synced ✓ ${n} files`);
                outcome = 'done';
                break;
              }
            }
            if (outcome !== null) break;
          }
        }

        clearInterval(stall);
        return outcome ?? 'error';
      } catch {
        clearInterval(stall);
        toast(
          controller.signal.aborted
            ? 'Sync stalled — the project may be large or the network is unreachable.'
            : 'Could not reach DriftGrid Cloud. Check your connection.',
          'error',
        );
        return 'error';
      }
    };

    running.current = true;
    try {
      // Ensure a cloud session — sign in inline if there isn't one.
      let creds = getStoredCredentials();
      if (!creds?.accessToken) {
        setSyncState('connecting');
        setSyncProgress('Connecting…');
        creds = await connectToCloud();
        if (!creds?.accessToken) { setSyncState('idle'); setSyncProgress(''); return; }
      }

      let outcome = await streamOnce(creds.accessToken, creds.refreshToken);

      // Token died mid-flight and couldn't refresh → sign in inline, retry once.
      if (outcome === 'needsAuth') {
        setSyncState('connecting');
        setSyncProgress('Reconnecting…');
        const fresh = await connectToCloud();
        if (!fresh?.accessToken) { setSyncState('idle'); setSyncProgress(''); return; }
        outcome = await streamOnce(fresh.accessToken, fresh.refreshToken);
      }

      setSyncState(outcome === 'done' ? 'done' : 'error');
      setSyncProgress('');
      if (outcome === 'needsAuth') toast('Cloud sign-in needed to sync.', 'error');
    } finally {
      running.current = false;
    }
  }, [client, project]);

  return { syncState, syncProgress, runSync };
}
