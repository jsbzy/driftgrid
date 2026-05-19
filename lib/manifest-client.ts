/**
 * Client-side manifest fetch/write helper.
 *
 * Adds optimistic-concurrency on top of the raw fetch:
 *   • `fetchManifest` reads the ETag header and stores it.
 *   • `putManifest` echoes the stored ETag as `If-Match` so the server can
 *     reject (412) when the on-disk manifest has changed between read and
 *     write. Without this, two tabs (or a tab + a server-side writer) can
 *     silently lose each other's updates.
 *
 * Currently scoped to local + cloud `/api/manifest/[client]/[project]` —
 * does NOT yet route through the share endpoint (`/api/s/...`).
 */
import { toast } from '@/components/Toast';
import type { Manifest } from './types';
import type { KeyedMutator } from 'swr';

// Module-level cache keyed by the manifest URL (matches SWR's key shape).
const etagCache = new Map<string, string>();

function key(client: string, project: string): string {
  return `/api/manifest/${client}/${project}`;
}

// ───────────────────────────────────────────────────────────────────────────
// "Manifest busy" tracker — local (this tab only).
//
// Counts in-flight manifest-writing operations. While > 0, the UI dims grid
// cards and disables destructive shortcuts so the user can't pile mutations
// on top of an in-flight save (the most common cause of 412 retries).
//
// Scope:
//   • `putManifest` increments/decrements automatically.
//   • Drift / branch / paste fetches go through `trackManifestWrite()` from
//     useManifestMutations so they participate too.
//   • Comments / annotations / navigation do NOT increment — they're either
//     append-only or pure local state.
//
// Cross-tab/agent busy state is NOT covered (would require an SSE event from
// lib/storage.writeManifest). Future work — see Shape B in the design doc.
// ───────────────────────────────────────────────────────────────────────────

let busyCount = 0;
const busyListeners = new Set<(busy: boolean) => void>();

function notifyBusy() {
  const isBusy = busyCount > 0;
  for (const fn of busyListeners) fn(isBusy);
}

/**
 * Subscribe to the busy state. Returns the unsubscribe function.
 * Most consumers should use the `useManifestBusy` React hook below instead.
 */
export function subscribeManifestBusy(listener: (busy: boolean) => void): () => void {
  busyListeners.add(listener);
  // Fire immediately so the subscriber gets the current state.
  listener(busyCount > 0);
  return () => { busyListeners.delete(listener); };
}

/**
 * Wrap a manifest-writing operation so the UI knows it's in flight. Use this
 * for any fetch that mutates manifest state outside `putManifest` — drift,
 * branch, paste, document-create, etc. The counter decrements even on throw.
 */
export async function trackManifestWrite<T>(op: () => Promise<T>): Promise<T> {
  busyCount += 1;
  notifyBusy();
  try {
    return await op();
  } finally {
    busyCount -= 1;
    notifyBusy();
  }
}

/**
 * Shorthand for `trackManifestWrite(() => fetch(...))`. Use at every UI fetch
 * that mutates the manifest (paste, rounds, drift-to-project, etc.) so the
 * busy indicator lights up for the user.
 */
export function trackedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  return trackManifestWrite(() => fetch(input, init));
}

/**
 * SWR fetcher for the manifest endpoint. Captures the ETag header so we can
 * echo it on subsequent PUTs. Use as the fetcher in your `useSWR(...)` call.
 */
export async function fetchManifestForSwr(url: string): Promise<Manifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
  const etag = res.headers.get('etag');
  if (etag) etagCache.set(url, etag);
  return res.json();
}

interface PutOptions {
  /** SWR mutate for this manifest — called on 412 to force a fresh read. */
  mutate?: KeyedMutator<Manifest>;
  /** If true, suppress the "manifest changed elsewhere" toast on 412. */
  silent?: boolean;
}

export type PutResult =
  | { ok: true }
  | { ok: false; status: number; reason: 'conflict' | 'validation' | 'unknown'; details?: unknown };

/**
 * PUT a manifest with optimistic concurrency. On 412 (manifest changed
 * since the client last read it), triggers a refetch via `mutate` and toasts
 * the user. The caller is expected to abandon the in-flight optimistic
 * mutation — auto-retry would require a transform function (deferred to a
 * later iteration once we see how often 412 actually fires in practice).
 */
export async function putManifest(
  client: string,
  project: string,
  manifest: Manifest,
  options: PutOptions = {},
): Promise<PutResult> {
  return trackManifestWrite(async () => {
    const url = key(client, project);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const ifMatch = etagCache.get(url);
    if (ifMatch) headers['If-Match'] = ifMatch;

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(manifest),
    });

    const newEtag = res.headers.get('etag');
    if (newEtag) etagCache.set(url, newEtag);

    if (res.status === 412) {
      if (!options.silent) {
        toast('Manifest changed elsewhere — refreshing. Try your action again.', 'error');
      }
      if (options.mutate) await options.mutate();
      return { ok: false, status: 412, reason: 'conflict' };
    }

    if (res.status === 422) {
      const body = await res.json().catch(() => ({}));
      if (!options.silent) {
        toast(`Manifest validation failed: ${(body.details ?? []).slice(0, 2).join('; ')}`, 'error');
      }
      return { ok: false, status: 422, reason: 'validation', details: body };
    }

    if (!res.ok) {
      if (!options.silent) toast(`Save failed (${res.status})`, 'error');
      return { ok: false, status: res.status, reason: 'unknown' };
    }

    return { ok: true };
  });
}

/**
 * Reset the stored ETag for a project — call after switching projects so a
 * stale ETag from the previous project doesn't get sent on the next PUT.
 * SWR mounts/unmounts naturally, so this is rarely needed.
 */
export function forgetManifestEtag(client: string, project: string): void {
  etagCache.delete(key(client, project));
}
