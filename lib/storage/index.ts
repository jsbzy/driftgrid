import type { StorageAdapter } from './types';
import { LocalStorageAdapter } from './local';

export type { StorageAdapter, FileStat } from './types';
export { LocalStorageAdapter } from './local';

let _adapter: StorageAdapter | null = null;

/**
 * Get the storage adapter for the current runtime mode.
 * In local mode (default): returns LocalStorageAdapter.
 * In cloud mode: returns CloudStorageAdapter (when implemented).
 */
export function getStorage(): StorageAdapter {
  if (_adapter) return _adapter;

  const mode = process.env.DRIFTGRID_MODE || 'local';

  switch (mode) {
    case 'cloud':
      // CloudStorageAdapter will be implemented in Phase 4
      throw new Error(
        'Cloud storage adapter not yet implemented. Set DRIFTGRID_MODE=local or remove the env var.'
      );
    case 'local':
    default:
      _adapter = new LocalStorageAdapter();
      return _adapter;
  }
}

/**
 * Reset the cached adapter instance.
 * Useful for testing or switching modes at runtime.
 */
export function resetStorage(): void {
  _adapter = null;
}
