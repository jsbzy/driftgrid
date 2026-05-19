'use client';

import { useEffect, useState } from 'react';
import { subscribeManifestBusy } from '@/lib/manifest-client';

/**
 * Returns true while a manifest-writing operation is in flight on this tab.
 *
 * Use to:
 *   • dim/disable destructive shortcuts (drift, branch, delete, reorder, star)
 *   • show a "Saving…" indicator
 *   • gate other manifest writers so the user can't pile retries
 *
 * Annotations / comments do NOT trigger busy — they're append-only and use a
 * separate file path. Navigation, zoom, and round-switching are pure local
 * state and also don't trigger.
 *
 * Local to this tab only. For cross-tab/agent busy state we'd need an SSE
 * broadcast from `lib/storage.writeManifest` (deferred).
 */
export function useManifestBusy(): boolean {
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeManifestBusy(setBusy), []);
  return busy;
}
