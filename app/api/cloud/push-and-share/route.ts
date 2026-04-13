import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { pushFilesToCloud, createCloudShare, verifyToken, refreshAccessToken } from '@/lib/cloud-client';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// MIME types by extension
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const TEXT_TYPES = new Set([
  'text/html', 'application/json', 'image/svg+xml', 'text/markdown',
  'text/css', 'text/plain',
]);

/**
 * POST /api/cloud/push-and-share — local orchestrator.
 *
 * Reads project files from the local filesystem, pushes them to the cloud,
 * and creates a share link. All in one call.
 *
 * Body: { client, project, accessToken, refreshToken }
 * Returns: { shareUrl, filesUploaded, email } or { error, needsAuth }
 */
export async function POST(request: Request) {
  const { client, project, accessToken: initialToken, refreshToken } = await request.json();

  if (!client || !project || !initialToken) {
    return NextResponse.json({ error: 'Missing client, project, or accessToken' }, { status: 400 });
  }

  // Verify the token (and refresh if needed)
  let accessToken = initialToken;
  let newRefreshToken = refreshToken;

  const verifyResult = await verifyToken(accessToken).catch(() => null);
  if (!verifyResult?.valid) {
    // Try to refresh
    if (refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        newRefreshToken = refreshed.refreshToken;
      } else {
        return NextResponse.json({ error: 'Session expired', needsAuth: true }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Session expired', needsAuth: true }, { status: 401 });
    }
  }

  // Collect project files from disk
  const projectDir = path.join(PROJECTS_DIR, client, project);
  try {
    await fs.stat(projectDir);
  } catch {
    return NextResponse.json({ error: 'Project not found locally' }, { status: 404 });
  }

  const files = await collectFiles(projectDir, '');

  // Push project files to cloud
  const pushResult = await pushFilesToCloud(accessToken, client, project, files);

  // Also push brand assets at client level (separate scope)
  const brandDir = path.join(PROJECTS_DIR, client, 'brand');
  try {
    await fs.stat(brandDir);
    const brandFiles = await collectFiles(brandDir, '');
    const brandEntries = brandFiles.map(f => ({
      path: `brand/${f.path}`,
      content: f.content,
      contentType: f.contentType,
    }));
    if (brandEntries.length > 0) {
      await pushFilesToCloud(accessToken, client, project, brandEntries, undefined, 'client');
    }
  } catch {
    // No brand directory — that's fine
  }
  if (!pushResult.success && pushResult.uploaded === 0) {
    return NextResponse.json({ error: 'Failed to push files to cloud', details: pushResult.errors }, { status: 500 });
  }

  // Create share link
  const shareResult = await createCloudShare(accessToken, client, project);
  if ('error' in shareResult) {
    // Files pushed successfully but share failed
    if (shareResult.error === 'free_limit') {
      return NextResponse.json({ error: 'free_limit', filesUploaded: pushResult.uploaded }, { status: 403 });
    }
    return NextResponse.json({ error: shareResult.error, filesUploaded: pushResult.uploaded }, { status: 500 });
  }

  return NextResponse.json({
    shareUrl: shareResult.url,
    token: shareResult.token,
    filesUploaded: pushResult.uploaded,
    // Return refreshed tokens if they changed
    ...(accessToken !== initialToken && {
      newAccessToken: accessToken,
      newRefreshToken,
    }),
  });
}

/**
 * Recursively collect all files from a directory.
 */
async function collectFiles(
  dir: string,
  prefix: string,
): Promise<Array<{ path: string; content: string; contentType: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; content: string; contentType: string }> = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, relPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isText = TEXT_TYPES.has(contentType);

      const raw = await fs.readFile(fullPath);
      const content = isText ? raw.toString('utf-8') : raw.toString('base64');

      files.push({ path: relPath, content, contentType });
    }
  }

  return files;
}
