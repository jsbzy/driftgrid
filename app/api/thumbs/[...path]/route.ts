import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { generateThumbnail } from '@/lib/thumbnails';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Track in-flight regenerations to avoid duplicate work
const regenerating = new Set<string>();

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
  const manifest = await getManifest(client, project);
  if (!manifest) return null;

  // Thumbnail filename is "{conceptId}-{versionId}.webp" (or legacy .png)
  const baseName = thumbFilename.replace(/\.(webp|png)$/, '');

  for (const concept of manifest.concepts) {
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
  fs.writeFile(cachedPath, resized).catch(() => {});

  return resized;
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

      // Kick off background regeneration if stale and not already in progress
      if (isStale && !regenerating.has(resolved)) {
        regenerating.add(resolved);
        generateThumbnail(info.htmlPath, resolved, info.width, info.height)
          .catch(err => console.error(`Background thumbnail regen failed for ${resolved}:`, err))
          .finally(() => regenerating.delete(resolved));
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
    // Thumbnail doesn't exist yet — generate it on first view
    const info = await findHtmlPathForThumb(client, project, thumbFilename);
    if (!info) {
      return new NextResponse('Not found', { status: 404 });
    }

    // Check if already generating
    if (regenerating.has(resolved)) {
      // Return a transparent 1x1 PNG placeholder while generating
      return new NextResponse(null, {
        status: 202,
        headers: { 'X-Thumbnail-Generating': 'true', 'Retry-After': '3' },
      });
    }

    regenerating.add(resolved);

    try {
      // Ensure .thumbs directory exists
      const thumbsDir = path.dirname(resolved);
      await fs.mkdir(thumbsDir, { recursive: true });

      await generateThumbnail(info.htmlPath, resolved, info.width, info.height);

      // Update manifest with thumbnail path
      const manifest = await getManifest(client, project);
      if (manifest) {
        let updated = false;
        for (const concept of manifest.concepts) {
          for (const version of concept.versions) {
            const expectedName = `${concept.id}-${version.id}`;
            if (expectedName === thumbFilename.replace(/\.(webp|png)$/, '')) {
              if (!version.thumbnail) {
                version.thumbnail = `.thumbs/${thumbFilename}`;
                updated = true;
              }
            }
          }
        }
        if (updated) {
          const { writeManifest } = await import('@/lib/manifest');
          await writeManifest(client, project, manifest);
        }
      }

      const data = await fs.readFile(resolved);
      return new NextResponse(data, {
        headers: { 'Content-Type': contentTypeForThumb(thumbFilename), 'Cache-Control': 'public, max-age=60' },
      });
    } catch (err) {
      console.error(`Thumbnail generation failed for ${resolved}:`, err);
      return new NextResponse('Generation failed', { status: 500 });
    } finally {
      regenerating.delete(resolved);
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
