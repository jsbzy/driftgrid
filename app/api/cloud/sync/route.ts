import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { pushFilesToCloud, verifyToken, refreshAccessToken } from '@/lib/cloud-client';
import { collectFiles, type FileEntry, type SkippedEntry } from '@/lib/cloud-files';
import { areValidSlugs } from '@/lib/slug';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

/**
 * POST /api/cloud/sync — local orchestrator. Pushes the WHOLE project (every
 * round, every version, the manifest, brand assets) to the cloud so the cloud
 * is a complete mirror of the local source of truth.
 *
 * This is the designer-owned counterpart to push-and-share: Sync makes cloud
 * complete (backup + multi-device + the basis for sharing); Share then curates
 * a public client link FROM what's synced. Unlike push-and-share, Sync applies
 * NO starred allowlist and creates NO share link.
 *
 * Body: { client, project, accessToken, refreshToken, includeMedia? }
 * Streams NDJSON: phase | skipped | progress | newTokens | needsAuth | done | error
 */
export async function POST(request: Request) {
  const { client, project, accessToken: initialToken, refreshToken, includeMedia } = await request.json();

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

        // --- Scan files (whole project, no allowlist) ---
        send({ type: 'phase', phase: 'scanning' });
        const projectDir = path.join(PROJECTS_DIR, client, project);
        try {
          await fs.stat(projectDir);
        } catch {
          send({ type: 'error', error: 'Project not found locally' });
          controller.close();
          return;
        }

        const { files, skipped } = await collectFiles(projectDir, '', {
          includeMedia: !!includeMedia,
          allowList: null, // full project — Sync pushes everything
        });

        const brandDir = path.join(PROJECTS_DIR, client, 'brand');
        let brandEntries: FileEntry[] = [];
        let brandSkipped: SkippedEntry[] = [];
        try {
          await fs.stat(brandDir);
          const brand = await collectFiles(brandDir, '', { includeMedia: !!includeMedia });
          brandEntries = brand.files.map(f => ({ path: `brand/${f.path}`, content: f.content, contentType: f.contentType }));
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
          send({ type: 'skipped', entries: allSkipped, totalBytes: skippedBytes, byExt });
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
            send({ type: 'progress', uploaded: uploadedSoFar, total: totalFiles, bytesUploaded: bytesSoFar, totalBytes });
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
              send({ type: 'progress', uploaded: uploadedSoFar + uploaded, total: totalFiles, bytesUploaded: projectBytes + bytesUploaded, totalBytes });
            },
            'client',
          );
        }

        if (!pushResult.success && pushResult.uploaded === 0) {
          send({ type: 'error', error: 'Failed to push files to cloud', details: pushResult.errors });
          controller.close();
          return;
        }

        send({
          type: 'done',
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
