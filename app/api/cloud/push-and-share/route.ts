import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { pushFilesToCloud, createCloudShare, verifyToken, refreshAccessToken } from '@/lib/cloud-client';
import { areValidSlugs } from '@/lib/slug';
import { collectFiles, type FileEntry, type SkippedEntry } from '@/lib/cloud-files';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

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
        const allowList = await computeStarredAllowList(projectDir, roundId, !!includeMedia);
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
  roundId: string | null | undefined,
  includeMedia: boolean,
): Promise<Set<string> | null> {
  try {
    const manifestRaw = await fs.readFile(path.join(projectDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw);

    type VersionLike = { id: string; file?: string; thumbnail?: string; starred?: boolean };
    type ConceptLike = { id: string; versions: VersionLike[] };
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

    type StarredEntry = { concept: ConceptLike; version: VersionLike };
    const starred: StarredEntry[] = [];
    for (const c of activeConcepts) {
      for (const v of c.versions ?? []) {
        if (v.starred) starred.push({ concept: c, version: v });
      }
    }

    if (starred.length === 0) return null; // Nothing curated → upload everything

    const allowed = new Set<string>();
    allowed.add('manifest.json'); // always push the manifest
    for (const { concept, version } of starred) {
      if (version.file) {
        allowed.add(version.file);
        allowed.add(version.file.replace(/\.html$/, '.feedback.md'));
      }
      // Derive thumb path from (concept.id, version.id) — same convention as
      // the local thumb route. version.thumbnail is ignored because it may be
      // cross-wired (legacy bug). The `-880w` low-zoom variant regenerates on
      // demand cloud-side.
      allowed.add(`.thumbs/${concept.id}-${version.id}.webp`);
    }

    // When the designer has opted into shipping media, also include any shared
    // media-like asset files the starred versions reference but that don't live
    // inside their per-version folders (e.g. project-wide audio/round-N/*.mp3,
    // assets/*.png). Without this, the allowList hides them from collectFiles
    // and they never reach Supabase, so <audio src="..."> 404s on the share.
    if (includeMedia) {
      await addSharedMediaPaths(projectDir, allowed);
    }
    return allowed;
  } catch {
    return null; // Manifest unreadable → fall back to pushing everything
  }
}

/**
 * Walk well-known shared-asset directories (audio/, assets/, media/) and add
 * every file under them to the allowList. These directories aren't versioned
 * per-concept; they hold round-wide or project-wide assets that the HTML
 * references via relative paths. Recursive so subfolders like audio/round-6
 * are included.
 */
async function addSharedMediaPaths(projectDir: string, allowed: Set<string>): Promise<void> {
  // Project-wide asset folders. Includes 'tools' because runtime helper scripts
  // (e.g. live-vo.js for audio narration) live there and the HTML references
  // them via relative paths — without them, <audio> tags load but nothing
  // ever calls .play().
  const SHARED_DIRS = ['audio', 'assets', 'media', 'tools'];
  for (const subdir of SHARED_DIRS) {
    const root = path.join(projectDir, subdir);
    try {
      await fs.stat(root);
    } catch {
      continue; // dir doesn't exist
    }
    await walkAndAdd(root, subdir, allowed);
  }
}

async function walkAndAdd(dir: string, relPrefix: string, allowed: Set<string>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await walkAndAdd(full, rel, allowed);
    } else if (entry.isFile()) {
      allowed.add(rel);
    }
  }
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
