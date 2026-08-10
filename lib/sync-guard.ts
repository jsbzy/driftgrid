/**
 * Sync-overwrite guard — decision logic.
 *
 * Pushing a project mirrors local state over the cloud copy. That's correct
 * when local is the only writer, but the cloud copy can also change (web
 * designer edits, another machine pushing). Without a check, a push silently
 * destroys those changes.
 *
 * Mechanism: after every successful push the client records the sha256 of the
 * manifest it uploaded (the sync marker). Before the next push it fetches the
 * hash of the manifest currently in cloud storage and compares:
 *
 *   cloud absent                     → safe (first publish)
 *   cloud hash == marker             → safe (cloud is exactly what we last pushed)
 *   cloud hash != marker, or marker  → conflict: someone else wrote the cloud
 *   missing while cloud exists         copy — require an explicit force.
 *
 * Pure module: no IO, no imports — usable from the CLI, API routes, and tests.
 */

export type SyncSafety =
  | { safe: true; reason: 'first-publish' | 'cloud-unchanged' }
  | { safe: false; reason: 'cloud-changed' | 'unknown-provenance' };

export interface CloudManifestState {
  exists: boolean;
  /** sha256 hex of the manifest.json bytes in cloud storage; null when absent. */
  hash: string | null;
}

/**
 * Decide whether overwriting the cloud copy is safe.
 *
 * @param lastPushedHash sha256 recorded after this machine's last push, or
 *                       null if this machine has never pushed the project.
 * @param cloud          current cloud manifest state.
 */
export function decideSyncSafety(
  lastPushedHash: string | null,
  cloud: CloudManifestState,
): SyncSafety {
  if (!cloud.exists) {
    return { safe: true, reason: 'first-publish' };
  }
  if (lastPushedHash === null) {
    // Cloud copy exists but this machine has no record of pushing it — we
    // can't tell whose work we'd overwrite.
    return { safe: false, reason: 'unknown-provenance' };
  }
  if (cloud.hash === lastPushedHash) {
    return { safe: true, reason: 'cloud-unchanged' };
  }
  return { safe: false, reason: 'cloud-changed' };
}

/** Human-readable explanation for a blocked push, shared by CLI + UI copy. */
export function explainBlockedSync(reason: 'cloud-changed' | 'unknown-provenance'): string {
  return reason === 'cloud-changed'
    ? 'The cloud copy changed since this machine last pushed (web edits or another machine). ' +
      'Pushing now would overwrite those changes.'
    : 'A cloud copy already exists but this machine has never pushed this project, ' +
      'so its contents are unknown. Pushing now would overwrite them.';
}
