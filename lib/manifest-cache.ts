import type { Manifest } from '@/lib/types';

// Module-scoped cache of parsed manifests. Thumbnail generation reads the
// same manifest once per concept+version, so a burst of thumbnail requests
// for a single project used to re-parse the JSON once per request.
//
// Reads go through the storage dispatch (lib/storage) so the cache reflects the
// active backend — file, SQLite, or cloud. (Dynamic import avoids a static
// import cycle: lib/storage dynamically imports this module for invalidation.)
//
// Callers that mutate a project's manifest (drift, branch, rounds API, etc.)
// must call `invalidateManifestCache(client, project)` immediately after
// writing so the next read sees fresh state instead of stale cache.

const cache = new Map<string, { data: Manifest | null; ts: number }>();
const TTL_MS = 5000;

export async function getCachedManifest(client: string, project: string, userId: string | null = null) {
  const key = `${client}/${project}`;
  const existing = cache.get(key);
  if (existing && Date.now() - existing.ts < TTL_MS) return existing.data;
  const { getManifest } = await import('@/lib/storage');
  const data = await getManifest(userId, client, project);
  cache.set(key, { data, ts: Date.now() });
  return data;
}

export function invalidateManifestCache(client: string, project: string) {
  cache.delete(`${client}/${project}`);
}

export function clearManifestCache() {
  cache.clear();
}
