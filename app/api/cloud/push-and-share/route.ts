import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { pushFilesToCloud, createCloudShare, verifyToken, refreshAccessToken } from '@/lib/cloud-client';
import { areValidSlugs } from '@/lib/slug';

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

// Always upload regardless of size — images + docs + fonts
const ALWAYS_INCLUDE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico', '.bmp', '.tiff', '.heic',
  '.html', '.json', '.md', '.css', '.txt', '.woff', '.woff2',
]);

// Always skip unless includeMedia — video, audio, archives, design sources
const SKIP_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.7z',
  '.psd', '.sketch', '.fig', '.ai', '.xd',
]);

// Fallback for unknown extensions: skip if larger than this
const MAX_OTHER_BINARY_BYTES = 25 * 1024 * 1024;

type SkippedEntry = { path: string; bytes: number; ext: string; reason: 'ext' | 'size' };
type FileEntry = { path: string; content: string; contentType: string };

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
  const { client, project, accessToken: initialToken, refreshToken, includeMedia, roundId } = await request.json();

  if (!client || !project || !initialToken) {
    return NextResponse.json({ error: 'Missing client, project, or accessToken' }, { status: 400 });
  }

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        // --- Verify / refresh token ---
        send({ type: 'phase', phase: 'verifying' });
        let accessToken = initialToken;
        let newRefreshToken = refreshToken;

        const verifyResult = await verifyToken(accessToken).catch(() => null);
        if (!verifyResult?.valid) {
          if (refreshToken) {
            const refreshed = await refreshAccessToken(refreshToken);
            if (refreshed) {
              accessToken = refreshed.accessToken;
              newRefreshToken = refreshed.refreshToken;
              send({ type: 'newTokens', accessToken, refreshToken: newRefreshToken });
            } else {
              send({ type: 'needsAuth' });
              controller.close();
              return;
            }
          } else {
            send({ type: 'needsAuth' });
            controller.close();
            return;
          }
        }

        // --- Scan files ---
        send({ type: 'phase', phase: 'scanning' });
        const projectDir = path.join(PROJECTS_DIR, client, project);
        try {
          await fs.stat(projectDir);
        } catch {
          send({ type: 'error', error: 'Project not found locally' });
          controller.close();
          return;
        }

        // Curated-share filter: if any versions are starred in the active round,
        // upload only those versions' files (plus manifest and thumbs).
        // If nothing is starred, fall back to uploading everything (backward compat).
        const allowList = await computeStarredAllowList(projectDir, roundId);
        // Resolve round_number for the share row so republishing within the same
        // round reuses the same token.
        const roundNumber = await resolveRoundNumber(projectDir, roundId);

        const { files, skipped } = await collectFiles(projectDir, '', {
          includeMedia: !!includeMedia,
          allowList,
        });
        const brandDir = path.join(PROJECTS_DIR, client, 'brand');
        let brandEntries: FileEntry[] = [];
        let brandSkipped: SkippedEntry[] = [];
        try {
          await fs.stat(brandDir);
          const brand = await collectFiles(brandDir, '', { includeMedia: !!includeMedia });
          brandEntries = brand.files.map(f => ({
            path: `brand/${f.path}`,
            content: f.content,
            contentType: f.contentType,
          }));
          brandSkipped = brand.skipped.map(s => ({ ...s, path: `brand/${s.path}` }));
        } catch {
          // no brand dir
        }

        const allSkipped = [...skipped, ...brandSkipped];
        if (allSkipped.length > 0) {
          const skippedBytes = allSkipped.reduce((n, s) => n + s.bytes, 0);
          const byExt: Record<string, { count: number; bytes: number }> = {};
          for (const s of allSkipped) {
            const key = s.ext || '(no ext)';
            byExt[key] ||= { count: 0, bytes: 0 };
            byExt[key].count += 1;
            byExt[key].bytes += s.bytes;
          }
          send({
            type: 'skipped',
            entries: allSkipped,
            totalBytes: skippedBytes,
            byExt,
          });
        }

        const totalBytes = files.reduce((n, f) => n + f.content.length, 0)
          + brandEntries.reduce((n, f) => n + f.content.length, 0);
        const totalFiles = files.length + brandEntries.length;
        send({ type: 'phase', phase: 'pushing', totalFiles, totalBytes });

        // --- Push project files ---
        let uploadedSoFar = 0;
        let bytesSoFar = 0;
        const pushResult = await pushFilesToCloud(
          accessToken,
          client,
          project,
          files,
          (uploaded, _total, bytesUploaded) => {
            uploadedSoFar = uploaded;
            bytesSoFar = bytesUploaded;
            send({
              type: 'progress',
              uploaded: uploadedSoFar,
              total: totalFiles,
              bytesUploaded: bytesSoFar,
              totalBytes,
            });
          },
        );

        if (brandEntries.length > 0) {
          const projectBytes = files.reduce((n, f) => n + f.content.length, 0);
          await pushFilesToCloud(
            accessToken,
            client,
            project,
            brandEntries,
            (uploaded, _total, bytesUploaded) => {
              send({
                type: 'progress',
                uploaded: uploadedSoFar + uploaded,
                total: totalFiles,
                bytesUploaded: projectBytes + bytesUploaded,
                totalBytes,
              });
            },
            'client',
          );
        }

        if (!pushResult.success && pushResult.uploaded === 0) {
          send({ type: 'error', error: 'Failed to push files to cloud', details: pushResult.errors });
          controller.close();
          return;
        }

        // --- Create share link ---
        send({ type: 'phase', phase: 'sharing' });
        const shareResult = await createCloudShare(accessToken, client, project, roundNumber);
        if ('error' in shareResult) {
          if (shareResult.error === 'free_limit') {
            send({ type: 'freeLimit', filesUploaded: pushResult.uploaded });
          } else {
            send({ type: 'error', error: shareResult.error, filesUploaded: pushResult.uploaded });
          }
          controller.close();
          return;
        }

        send({
          type: 'done',
          shareUrl: shareResult.url,
          token: shareResult.token,
          filesUploaded: pushResult.uploaded,
          filesSkipped: allSkipped.length,
        });
        controller.close();
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Recursively collect files from a directory, applying the skip policy and
 * (optionally) a starred-versions allowlist for curated shares.
 */
async function collectFiles(
  dir: string,
  prefix: string,
  opts: { includeMedia: boolean; allowList?: Set<string> | null },
): Promise<{ files: FileEntry[]; skipped: SkippedEntry[] }> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: FileEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Directory pruning: if allowList exists, skip folders entirely when no path under them is allowed.
      if (opts.allowList && !anyAllowedUnder(relPath, opts.allowList)) continue;
      const child = await collectFiles(fullPath, relPath, opts);
      files.push(...child.files);
      skipped.push(...child.skipped);
      continue;
    }

    // Starred-allowlist check: silently drop files outside the curated set.
    // These aren't reported as "skipped" — they're deliberately excluded.
    if (opts.allowList && !opts.allowList.has(relPath)) continue;

    const ext = path.extname(entry.name).toLowerCase();

    // Skip policy — size/type filters still apply even inside the curated set.
    if (!opts.includeMedia) {
      if (SKIP_EXTS.has(ext)) {
        const stat = await fs.stat(fullPath);
        skipped.push({ path: relPath, bytes: stat.size, ext, reason: 'ext' });
        continue;
      }
      if (!ALWAYS_INCLUDE_EXTS.has(ext)) {
        const stat = await fs.stat(fullPath);
        if (stat.size > MAX_OTHER_BINARY_BYTES) {
          skipped.push({ path: relPath, bytes: stat.size, ext, reason: 'size' });
          continue;
        }
      }
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isText = TEXT_TYPES.has(contentType);
    const raw = await fs.readFile(fullPath);
    const content = isText ? raw.toString('utf-8') : raw.toString('base64');
    files.push({ path: relPath, content, contentType });
  }

  return { files, skipped };
}

/**
 * Compute the set of file paths (relative to projectDir) that should be uploaded
 * for a curated share — only files referenced by starred versions in the active
 * round, plus the manifest itself. Returns `null` if nothing is starred (fallback
 * = upload all).
 *
 * Round resolution order:
 *   1. `roundId` passed in → use that exact round
 *   2. No rounds in the manifest → use the top-level `concepts` array
 *   3. No roundId given but rounds exist → use the LAST round (the current one)
 */
async function computeStarredAllowList(
  projectDir: string,
  roundId?: string | null,
): Promise<Set<string> | null> {
  try {
    const manifestRaw = await fs.readFile(path.join(projectDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw);

    type VersionLike = { file?: string; thumbnail?: string; starred?: boolean };
    type ConceptLike = { versions: VersionLike[] };
    type RoundLike = { id: string; concepts: ConceptLike[] };
    const topConcepts: ConceptLike[] = Array.isArray(manifest.concepts) ? manifest.concepts : [];
    const rounds: RoundLike[] = Array.isArray(manifest.rounds) ? manifest.rounds : [];

    // Pick the concepts array for the active round only.
    let activeConcepts: ConceptLike[] = [];
    if (rounds.length > 0) {
      const match = roundId ? rounds.find(r => r.id === roundId) : null;
      activeConcepts = match ? match.concepts : rounds[rounds.length - 1].concepts;
    } else {
      activeConcepts = topConcepts;
    }

    const starred: VersionLike[] = [];
    for (const c of activeConcepts) {
      for (const v of c.versions ?? []) {
        if (v.starred) starred.push(v);
      }
    }

    if (starred.length === 0) return null; // Nothing curated → upload everything

    const allowed = new Set<string>();
    allowed.add('manifest.json'); // always push the manifest
    for (const v of starred) {
      if (v.file) {
        allowed.add(v.file);
        allowed.add(v.file.replace(/\.html$/, '.feedback.md'));
      }
      if (v.thumbnail) {
        // Upload only the primary thumbnail. The `-880w` low-zoom variant is
        // regenerated on-demand by the cloud thumb endpoint — no need to ship it.
        allowed.add(v.thumbnail);
      }
    }
    return allowed;
  } catch {
    return null; // Manifest unreadable → fall back to pushing everything
  }
}

/** Returns true if any path in the allowList starts with the given directory prefix. */
function anyAllowedUnder(dirPrefix: string, allowList: Set<string>): boolean {
  const prefix = dirPrefix + '/';
  for (const p of allowList) {
    if (p === dirPrefix || p.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Resolve the round.number to use when keying the share row.
 *   - roundId given + matches a round → that round's number
 *   - no roundId but rounds exist → the last round's number (current one)
 *   - no rounds in manifest → null (legacy flat layout; one share for the project)
 */
async function resolveRoundNumber(
  projectDir: string,
  roundId?: string | null,
): Promise<number | null> {
  try {
    const raw = await fs.readFile(path.join(projectDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(raw);
    type RoundLike = { id: string; number: number };
    const rounds: RoundLike[] = Array.isArray(manifest.rounds) ? manifest.rounds : [];
    if (rounds.length === 0) return null;
    const match = roundId ? rounds.find(r => r.id === roundId) : null;
    const active = match ?? rounds[rounds.length - 1];
    return typeof active.number === 'number' ? active.number : null;
  } catch {
    return null;
  }
}
