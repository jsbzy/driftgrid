/**
 * Storage adapter — dispatches to filesystem (local) or Supabase Storage (cloud).
 * This is the single import point for all data access in API routes.
 *
 * In local mode (no SUPABASE_URL): userId is ignored, reads from projects/ directory.
 * In cloud mode: reads from Supabase Storage scoped to userId.
 */

import { isCloudMode } from './supabase';
import type { Manifest, ClientInfo } from './types';

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

export async function writeManifest(userId: string | null, client: string, project: string, manifest: Manifest): Promise<void> {
  if (isCloudMode() && userId) {
    const { writeManifestCloud } = await cloud();
    return writeManifestCloud(userId, client, project, manifest);
  }
  const { writeManifest } = await local();
  return writeManifest(client, project, manifest);
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
  const destPath = path.resolve(path.join(PROJECTS_DIR, client, project, filePath));
  if (!destPath.startsWith(path.resolve(PROJECTS_DIR))) return;
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
  const srcFull = pathMod.resolve(pathMod.join(PROJECTS_DIR, client, project, srcPath));
  const destFull = pathMod.resolve(pathMod.join(PROJECTS_DIR, client, project, destPath));
  if (!srcFull.startsWith(pathMod.resolve(PROJECTS_DIR))) return;
  if (!destFull.startsWith(pathMod.resolve(PROJECTS_DIR))) return;
  await fs.mkdir(pathMod.dirname(destFull), { recursive: true });
  try {
    await fs.copyFile(srcFull, destFull);
  } catch {
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
    if (!fullPath.startsWith(path.resolve(PROJECTS_DIR))) return null;
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

export { isCloudMode } from './supabase';
