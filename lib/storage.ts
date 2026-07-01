/**
 * Storage adapter — dispatches to filesystem (local) or Supabase Storage (cloud).
 * This is the single import point for all data access in API routes.
 *
 * In local mode (no SUPABASE_URL): userId is ignored, reads from projects/ directory.
 * In cloud mode: reads from Supabase Storage scoped to userId.
 */

import { isCloudMode } from './supabase';
import type { Manifest, ClientInfo } from './types';
import { validateManifestForWrite } from './manifest-validate';

/** Thrown by writeManifest when the payload fails structural validation. */
export class ManifestValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Manifest validation failed: ${errors.join('; ')}`);
    this.name = 'ManifestValidationError';
  }
}

// Lazy imports to avoid loading Supabase SDK in local mode
async function cloud() {
  return await import('./supabase-storage');
}

async function local() {
  return await import('./manifest');
}

export async function getManifest(userId: string | null, client: string, project: string): Promise<Manifest | null> {
  if (isCloudMode() && userId) {
    const { getManifestCloud } = await cloud();
    return getManifestCloud(userId, client, project);
  }
  const { getManifest } = await local();
  return getManifest(client, project);
}

/**
 * Per-(client, project) write serializer. All manifest writes through this
 * module are queued on a single in-process Promise chain per project so that
 * parallel route handlers (UI mutation + thumbnail regen + drift + annotation)
 * can't interleave a read-modify-write and lose each other's updates.
 *
 * Caveat: this is in-process. If a second Next.js server or a CLI tool writes
 * the same manifest concurrently, this won't protect against it. For the
 * current single-server, MCP-not-wired-up setup, this is sufficient. Upgrade
 * to a cross-process file lock (proper-lockfile) when MCP or multi-process
 * writers come online.
 */
const writeChain = new Map<string, Promise<unknown>>();

function serializeManifestWrite<T>(client: string, project: string, op: () => Promise<T>): Promise<T> {
  const key = `${client}/${project}`;
  const prev = writeChain.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(op);
  writeChain.set(key, next);
  // Clean up the map entry once this op resolves (only if it's still the tail).
  next.finally(() => {
    if (writeChain.get(key) === next) writeChain.delete(key);
  });
  return next;
}

export async function writeManifest(userId: string | null, client: string, project: string, manifest: Manifest): Promise<void> {
  // Structural validation up front — refuses to write a manifest that's
  // missing rounds/concepts entirely or has duplicated IDs. On failure we
  // save the rejected payload to manifest.json.rejected-<ts>.json (local
  // mode) for inspection, then throw. The route layer maps this to 422.
  const validation = validateManifestForWrite(manifest);
  if (!validation.ok) {
    if (!isCloudMode()) {
      try {
        const { promises: fs } = await import('fs');
        const pathMod = await import('path');
        const rejectedPath = pathMod.join(
          process.cwd(),
          'projects',
          client,
          project,
          `manifest.json.rejected-${Date.now()}.json`,
        );
        await fs.writeFile(rejectedPath, JSON.stringify(manifest, null, 2), 'utf-8');
      } catch {
        /* save-aside is best-effort */
      }
    }
    throw new ManifestValidationError(validation.errors);
  }

  return serializeManifestWrite(client, project, async () => {
    // Invalidate the in-process manifest cache on every write so thumbnail
    // regeneration (and other readers) don't serve stale data for up to 5s.
    const { invalidateManifestCache } = await import('./manifest-cache');
    invalidateManifestCache(client, project);
    try {
      if (isCloudMode() && userId) {
        const { writeManifestCloud } = await cloud();
        await writeManifestCloud(userId, client, project, manifest);
        return;
      }
      const { writeManifest } = await local();
      await writeManifest(client, project, manifest);
    } finally {
      invalidateManifestCache(client, project);
    }
  });
}

export async function getClients(userId: string | null): Promise<ClientInfo[]> {
  if (isCloudMode() && userId) {
    const { getClientsCloud } = await cloud();
    return getClientsCloud(userId);
  }
  const { getClients } = await local();
  return getClients();
}

export async function writeHtmlFile(userId: string | null, client: string, project: string, filePath: string, content: string): Promise<void> {
  if (isCloudMode() && userId) {
    const { writeHtmlFileCloud } = await cloud();
    return writeHtmlFileCloud(userId, client, project, filePath, content);
  }
  // Local mode: write to filesystem
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  const root = path.resolve(PROJECTS_DIR) + path.sep;
  const destPath = path.resolve(path.join(PROJECTS_DIR, client, project, filePath));
  // Trailing separator so a sibling like `projects-x` can't satisfy the prefix.
  if (!destPath.startsWith(root)) return;
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, content, 'utf-8');
}

export async function copyFile(userId: string | null, client: string, project: string, srcPath: string, destPath: string): Promise<void> {
  if (isCloudMode() && userId) {
    const { copyFileCloud } = await cloud();
    return copyFileCloud(userId, client, project, srcPath, destPath);
  }
  // Local mode: copy on filesystem
  const { promises: fs } = await import('fs');
  const pathMod = await import('path');
  const PROJECTS_DIR = pathMod.join(process.cwd(), 'projects');
  const projectsRoot = pathMod.resolve(PROJECTS_DIR) + pathMod.sep;
  const srcFull = pathMod.resolve(pathMod.join(PROJECTS_DIR, client, project, srcPath));
  const destFull = pathMod.resolve(pathMod.join(PROJECTS_DIR, client, project, destPath));
  if (!srcFull.startsWith(projectsRoot)) return;
  if (!destFull.startsWith(projectsRoot)) return;
  await fs.mkdir(pathMod.dirname(destFull), { recursive: true });
  try {
    await fs.copyFile(srcFull, destFull);
  } catch (err) {
    // Placeholder keeps the copy from hard-failing, but log it — a placeholder
    // board is silent data loss otherwise.
    console.error(`[copyFile] source missing, wrote placeholder: ${srcFull}`, err);
    await fs.writeFile(destFull, '<!-- copied -->', 'utf-8');
  }
}

export async function getHtmlFile(userId: string | null, client: string, project: string, filePath: string): Promise<string | null> {
  if (isCloudMode() && userId) {
    const { getHtmlFileCloud } = await cloud();
    return getHtmlFileCloud(userId, client, project, filePath);
  }
  const { getHtmlFile } = await local();
  return getHtmlFile(client, project, filePath);
}

export async function getAsset(userId: string | null, client: string, project: string, filePath: string): Promise<Buffer | null> {
  if (isCloudMode() && userId) {
    const { getAssetCloud } = await cloud();
    return getAssetCloud(userId, client, project, filePath);
  }
  // Local mode: read from filesystem
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  try {
    const fullPath = path.resolve(path.join(PROJECTS_DIR, client, project, filePath));
    if (!fullPath.startsWith(path.resolve(PROJECTS_DIR) + path.sep)) return null;
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

export { isCloudMode } from './supabase';
