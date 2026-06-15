import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getCachedManifest } from '@/lib/manifest-cache';
import { isCloudMode } from '@/lib/supabase';
import { getAsset, writeManifest } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { CANVAS_PRESETS } from '@/lib/constants';
import { generateThumbnail } from '@/lib/thumbnails';
import { areValidSlugs } from '@/lib/slug';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Concurrent requests for the same thumbnail share ONE in-flight generation, so
// we never launch duplicate browsers or hand back a bodyless 202 that the client
// <img> reads as a load error. The slot clears when the promise settles (success
// OR failure) so a failed render can be retried on the next request.
const inflight = new Map<string, Promise<Buffer>>();

// Manifest cache now lives in lib/manifest-cache.ts so iterate/branch/rounds
// routes can invalidate it immediately after writes — stale thumbnails were
// showing up because this TTL-only cache held old manifests for up to 5s.

function contentTypeForThumb(filename: string): string {
  return filename.endsWith('.png') ? 'image/png' : 'image/webp';
}

/**
 * Given a thumbnail filename like "concept-1-v1.webp",
 * find the matching HTML file by looking up the manifest.
 */
async function findHtmlPathForThumb(
  client: string,
  project: string,
  thumbFilename: string
): Promise<{ htmlPath: string; conceptId: string; versionId: string; width: number; height: number | 'auto' } | null> {
  const manifest = await getCachedManifest(client, project);
  if (!manifest) return null;

  // Thumbnail filename is "{conceptId}-{versionId}.webp" (or legacy .png)
  const baseName = thumbFilename.replace(/\.(webp|png)$/, '');

  // Search all rounds (not just manifest.concepts which is the latest-round alias)
  const allConceptSets = manifest.rounds?.length
    ? manifest.rounds.map(r => r.concepts)
    : [manifest.concepts];

  for (const concepts of allConceptSets) {
    for (const concept of concepts) {
      for (const version of concept.versions) {
        const expectedName = `${concept.id}-${version.id}`;
        if (expectedName === baseName) {
          const projectDir = path.join(PROJECTS_DIR, client, project);
          const htmlPath = path.resolve(projectDir, version.file);

          // Use concept-level canvas override if set
          const canvasConfig = concept.canvas ?? manifest.project.canvas;
          let width: number;
          let height: number | 'auto';
          if (typeof canvasConfig === 'object' && canvasConfig !== null) {
            width = (canvasConfig as any).width ?? 1440;
            height = (canvasConfig as any).height ?? 'auto';
          } else {
            const preset = CANVAS_PRESETS[canvasConfig];
            width = typeof preset?.width === 'number' ? preset.width : 1440;
            height = typeof preset?.height === 'number' ? preset.height : 'auto';
          }

          return { htmlPath, conceptId: concept.id, versionId: version.id, width, height };
        }
      }
    }
  }

  return null;
}

/**
 * Resize a thumbnail to the requested width, caching the result.
 * Returns the resized buffer, or the original if no resize needed.
 */
async function getResized(
  fullPath: string,
  data: Buffer,
  requestedWidth: number,
): Promise<Buffer> {
  // Build cached path: foo.webp → foo-440w.webp
  const ext = path.extname(fullPath);
  const cachedPath = fullPath.replace(ext, `-${requestedWidth}w${ext}`);

  // Check if cached resize exists and is newer than the full-res file
  try {
    const [cachedStat, fullStat] = await Promise.all([
      fs.stat(cachedPath),
      fs.stat(fullPath),
    ]);
    if (cachedStat.mtimeMs >= fullStat.mtimeMs) {
      return await fs.readFile(cachedPath);
    }
  } catch {
    // No cached file — generate it
  }

  const resized = await sharp(data)
    .resize({ width: requestedWidth, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  // Cache to disk (fire and forget)
  fs.writeFile(cachedPath, resized).catch((err) => {
    // Don't fail the request when the cache write fails (response is already
    // heading out with `resized`), but surface the reason so disk-full or
    // perm errors don't silently pile up.
    console.warn('[thumbs] cache write failed', { cachedPath, message: err instanceof Error ? err.message : String(err) });
  });

  return resized;
}

/**
 * Generate one thumbnail to disk and return its bytes, deduped by output path.
 * Concurrent callers for the same thumbnail await the same promise (one browser
 * render, one manifest write) instead of racing — and all receive the image.
 */
function generateThumbOnce(
  resolved: string,
  info: { htmlPath: string; width: number; height: number | 'auto' },
  client: string,
  project: string,
  thumbFilename: string,
): Promise<Buffer> {
  const existing = inflight.get(resolved);
  if (existing) return existing;

  const p = (async () => {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await generateThumbnail(info.htmlPath, resolved, info.width, info.height);

    // Record the canonical thumbnail path on the manifest. Self-heal a
    // non-canonical value, and break after the first exact match so repeated
    // legacy concept IDs across rounds don't all get the same thumb. Routed
    // through lib/storage.writeManifest so this write is serialized with every
    // other manifest writer (per-(client,project) lock + cache invalidation).
    const expectedBase = thumbFilename.replace(/\.(webp|png)$/, '');
    const canonicalThumb = `.thumbs/${thumbFilename}`;
    const manifest = await getCachedManifest(client, project);
    if (manifest) {
      let updated = false;
      const allConceptSets = manifest.rounds?.length
        ? manifest.rounds.map(r => r.concepts)
        : [manifest.concepts];
      outer: for (const concepts of allConceptSets) {
        for (const concept of concepts) {
          for (const version of concept.versions) {
            if (`${concept.id}-${version.id}` !== expectedBase) continue;
            if (version.thumbnail !== canonicalThumb) {
              version.thumbnail = canonicalThumb;
              updated = true;
            }
            break outer; // first exact match wins
          }
        }
      }
      if (updated) {
        const userId = isCloudMode() ? await getUserId() : null;
        await writeManifest(userId, client, project, manifest);
      }
    }

    return await fs.readFile(resolved);
  })();

  inflight.set(resolved, p);
  const done = () => { if (inflight.get(resolved) === p) inflight.delete(resolved); };
  p.then(done, done);
  return p;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  // Expected: [client, project, filename.png]
  if (pathParts.length < 3) {
    return new NextResponse('Not found', { status: 404 });
  }

  const client = pathParts[0];
  const project = pathParts[1];
  const thumbFilename = pathParts.slice(2).join('/');

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  // Cloud mode: serve from Supabase Storage (no generation, no resize)
  if (isCloudMode()) {
    const userId = await getUserId();
    if (userId) {
      const data = await getAsset(userId, client, project, `.thumbs/${thumbFilename}`);
      if (data) {
        return new NextResponse(new Uint8Array(data), {
          headers: {
            'Content-Type': thumbFilename.endsWith('.png') ? 'image/png' : 'image/webp',
            'Cache-Control': 'public, max-age=300',
          },
        });
      }
    }
    return new NextResponse('Not found', { status: 404 });
  }

  // Parse optional resize width: ?w=440
  const url = new URL(_request.url);
  const requestedWidth = parseInt(url.searchParams.get('w') || '0', 10) || 0;

  const filePath = path.join(
    PROJECTS_DIR,
    client,
    project,
    '.thumbs',
    thumbFilename
  );

  // Security: ensure path doesn't escape projects dir
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(resolved);
    const thumbStat = await fs.stat(resolved);

    // Check staleness: compare HTML mtime vs thumbnail mtime
    let isStale = false;
    const info = await findHtmlPathForThumb(client, project, thumbFilename);

    if (info) {
      try {
        const htmlStat = await fs.stat(info.htmlPath);
        isStale = htmlStat.mtimeMs > thumbStat.mtimeMs;
      } catch {
        // HTML file missing — not stale, just orphaned
      }

      // Kick off background regeneration if stale and not already generating.
      if (isStale && !inflight.has(resolved)) {
        generateThumbOnce(resolved, info, client, project, thumbFilename)
          .catch(err => console.error(`Background thumbnail regen failed for ${resolved}:`, err));
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': contentTypeForThumb(thumbFilename),
      'Cache-Control': isStale ? 'no-cache' : 'public, max-age=60',
    };

    if (isStale) {
      headers['X-Thumbnail-Stale'] = 'true';
    }

    // Serve resized version if ?w= is specified
    const responseData = requestedWidth > 0
      ? await getResized(resolved, data, requestedWidth)
      : data;

    return new NextResponse(new Uint8Array(responseData), { headers });
  } catch {
    // Thumbnail doesn't exist yet — generate it on first view. Concurrent requests
    // for the same thumbnail share ONE generation (generateThumbOnce) and all
    // receive the image, so a cold grid never produces a 202-as-error retry storm.
    const info = await findHtmlPathForThumb(client, project, thumbFilename);
    if (!info) {
      return new NextResponse('Not found', { status: 404 });
    }

    try {
      const data = await generateThumbOnce(resolved, info, client, project, thumbFilename);
      return new NextResponse(new Uint8Array(data), {
        headers: { 'Content-Type': contentTypeForThumb(thumbFilename), 'Cache-Control': 'public, max-age=60' },
      });
    } catch (err) {
      console.error(`Thumbnail generation failed for ${resolved}:`, err);
      return new NextResponse('Generation failed', { status: 500 });
    }
  }
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  if (pathParts.length < 3) {
    return new NextResponse(null, { status: 404 });
  }

  const client = pathParts[0];
  const project = pathParts[1];
  const thumbFilename = pathParts.slice(2).join('/');

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const filePath = path.join(
    PROJECTS_DIR,
    client,
    project,
    '.thumbs',
    thumbFilename
  );

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const thumbStat = await fs.stat(resolved);

    let isStale = false;
    const info = await findHtmlPathForThumb(client, project, thumbFilename);

    if (info) {
      try {
        const htmlStat = await fs.stat(info.htmlPath);
        isStale = htmlStat.mtimeMs > thumbStat.mtimeMs;
      } catch {
        // HTML file missing
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': contentTypeForThumb(thumbFilename),
      'Content-Length': String(thumbStat.size),
    };

    if (isStale) {
      headers['X-Thumbnail-Stale'] = 'true';
    }

    return new NextResponse(null, { headers });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
