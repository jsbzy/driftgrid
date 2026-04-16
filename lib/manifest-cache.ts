import { getManifest } from '@/lib/manifest';

// Module-scoped cache of parsed manifests. Thumbnail generation reads the
// same manifest once per concept+version, so a burst of thumbnail requests
// for a single project used to re-parse the JSON once per request.
//
// Callers that mutate a project's manifest (drift, branch, rounds API, etc.)
// must call `invalidateManifestCache(client, project)` immediately after
// writing so the next read sees fresh state instead of stale cache.

const cache = new Map<string, { data: Awaited<ReturnType<typeof getManifest>>; ts: number }>();
const TTL_MS = 5000;

export async function getCachedManifest(client: string, project: string) {
  const key = `${client}/${project}`;
  const existing = cache.get(key);
  if (existing && Date.now() - existing.ts < TTL_MS) return existing.data;
  const data = await getManifest(client, project);
  cache.set(key, { data, ts: Date.now() });
  return data;
}

export function invalidateManifestCache(client: string, project: string) {
  cache.delete(`${client}/${project}`);
}

export function clearManifestCache() {
  cache.clear();
}
