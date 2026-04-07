import type { StorageAdapter } from './types';
import { LocalStorageAdapter } from './local';

export type { StorageAdapter, FileStat } from './types';
export { LocalStorageAdapter } from './local';
export { CloudStorageAdapter } from './cloud';

let _adapter: StorageAdapter | undefined;

/**
 * Get the storage adapter for the current runtime mode.
 * In local mode (default): returns LocalStorageAdapter.
 * In cloud mode: returns CloudStorageAdapter.
 *
 * For cloud mode, the workspace ID must be set via setCloudWorkspace()
 * before calling getStorage(). This is typically done in middleware
 * after authenticating the user.
 */
export function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;

  const mode = process.env.DRIFTGRID_MODE || 'local';

  switch (mode) {
    case 'cloud': {
      // In cloud mode without a workspace context, fall back to a
      // "no workspace" adapter that throws on operations.
      // Routes should call getCloudStorage(workspaceId) instead.
      const { CloudStorageAdapter } = require('./cloud');
      const workspaceId = _currentWorkspaceId;
      if (!workspaceId) {
        throw new Error(
          'Cloud storage requires a workspace context. ' +
          'Call setCloudWorkspace(id) before getStorage(), ' +
          'or use getCloudStorage(workspaceId) directly.'
        );
      }
      const adapter: StorageAdapter = new CloudStorageAdapter(workspaceId);
      _adapter = adapter;
      return adapter;
    }
    case 'local':
    default:
      _adapter = new LocalStorageAdapter();
      return _adapter;
  }
}

// ─── Cloud workspace context ────────────────────────────

let _currentWorkspaceId: string | undefined;

/**
 * Set the current workspace ID for cloud storage.
 * Called by middleware after authenticating the user.
 */
export function setCloudWorkspace(workspaceId: string): void {
  _currentWorkspaceId = workspaceId;
  _adapter = undefined; // Reset cached adapter to pick up new workspace
}

/**
 * Get a cloud storage adapter for a specific workspace.
 * Use this when you need to access a different workspace's files
 * (e.g., admin operations).
 */
export function getCloudStorage(workspaceId: string): StorageAdapter {
  const { CloudStorageAdapter } = require('./cloud');
  return new CloudStorageAdapter(workspaceId);
}

/**
 * Reset the cached adapter instance.
 * Useful for testing or switching modes at runtime.
 */
export function resetStorage(): void {
  _adapter = undefined;
  _currentWorkspaceId = undefined;
}
