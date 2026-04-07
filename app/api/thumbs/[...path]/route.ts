import { NextResponse } from 'next/server';
import path from 'path';
import sharp from 'sharp';
import { getManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { generateThumbnail } from '@/lib/thumbnails';
import { getStorage } from '@/lib/storage';

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
): Promise<{ htmlRelative: string; conceptId: string; versionId: string; width: number; height: number | 'auto' } | null> {
  const manifest = await getManifest(client, project);
  if (!manifest) return null;

  // Thumbnail filename is "{conceptId}-{versionId}.webp" (or legacy .png)
  const baseName = thumbFilename.replace(/\.(webp|png)$/, '');

  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      const expectedName = `${concept.id}-${version.id}`;
      if (expectedName === baseName) {
        const htmlRelative = path.join(client, project, version.file);

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

        return { htmlRelative, conceptId: concept.id, versionId: version.id, width, height };
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
  thumbRelative: string,
  data: Buffer,
  requestedWidth: number,
): Promise<Buffer> {
  const storage = getStorage();
  // Build cached path: foo.webp → foo-440w.webp
  const ext = path.extname(thumbRelative);
  const cachedRelative = thumbRelative.replace(ext, `-${requestedWidth}w${ext}`);

  // Check if cached resize exists and is newer than the full-res file
  try {
    const [cachedStat, fullStat] = await Promise.all([
      storage.stat(cachedRelative),
      storage.stat(thumbRelative),
    ]);
    if (cachedStat && fullStat && cachedStat.mtimeMs >= fullStat.mtimeMs) {
      return await storage.readFile(cachedRelative);
    }
  } catch {
    // No cached file — generate it
  }

  const resized = await sharp(data)
    .resize({ width: requestedWidth, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  // Cache to disk (fire and forget)
  storage.writeFile(cachedRelative, resized).catch(() => {});

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
  const storage = getStorage();
  const thumbRelative = path.join(client, project, '.thumbs', thumbFilename);

  // Security: validate path
  if (!storage.validatePath(thumbRelative)) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Parse optional resize width: ?w=440
  const url = new URL(_request.url);
  const requestedWidth = parseInt(url.searchParams.get('w') || '0', 10) || 0;

  try {
    const data = await storage.readFile(thumbRelative);
    const thumbStat = await storage.stat(thumbRelative);

    // Check staleness: compare HTML mtime vs thumbnail mtime
    let isStale = false;
    const info = await findHtmlPathForThumb(client, project, thumbFilename);

    if (info && thumbStat) {
      const htmlStat = await storage.stat(info.htmlRelative);
      if (htmlStat) {
        isStale = htmlStat.mtimeMs > thumbStat.mtimeMs;
      }

      // Kick off background regeneration if stale and not already in progress
      const thumbKey = `${client}/${project}/${thumbFilename}`;
      if (isStale && !regenerating.has(thumbKey)) {
        const htmlAbsolute = storage.resolvePath(info.htmlRelative);
        const thumbAbsolute = storage.resolvePath(thumbRelative);
        if (htmlAbsolute && thumbAbsolute) {
          regenerating.add(thumbKey);
          generateThumbnail(htmlAbsolute, thumbAbsolute, info.width, info.height)
            .catch(err => console.error(`Background thumbnail regen failed for ${thumbKey}:`, err))
            .finally(() => regenerating.delete(thumbKey));
        }
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
      ? await getResized(thumbRelative, data, requestedWidth)
      : data;

    return new NextResponse(new Uint8Array(responseData), { headers });
  } catch {
    // Thumbnail doesn't exist yet — generate it on first view
    const info = await findHtmlPathForThumb(client, project, thumbFilename);
    if (!info) {
      return new NextResponse('Not found', { status: 404 });
    }

    const thumbKey = `${client}/${project}/${thumbFilename}`;

    // Check if already generating
    if (regenerating.has(thumbKey)) {
      return new NextResponse(null, {
        status: 202,
        headers: { 'X-Thumbnail-Generating': 'true', 'Retry-After': '3' },
      });
    }

    // Thumbnail generation requires absolute paths (Puppeteer)
    const htmlAbsolute = storage.resolvePath(info.htmlRelative);
    const thumbAbsolute = storage.resolvePath(thumbRelative);
    if (!htmlAbsolute || !thumbAbsolute) {
      return new NextResponse('Thumbnail generation not available in cloud mode', { status: 501 });
    }

    regenerating.add(thumbKey);

    try {
      await storage.mkdir(path.join(client, project, '.thumbs'));
      await generateThumbnail(htmlAbsolute, thumbAbsolute, info.width, info.height);

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

      const data = await storage.readFile(thumbRelative);
      return new NextResponse(new Uint8Array(data), {
        headers: { 'Content-Type': contentTypeForThumb(thumbFilename), 'Cache-Control': 'public, max-age=60' },
      });
    } catch (err) {
      console.error(`Thumbnail generation failed for ${thumbKey}:`, err);
      return new NextResponse('Generation failed', { status: 500 });
    } finally {
      regenerating.delete(thumbKey);
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
  const storage = getStorage();
  const thumbRelative = path.join(client, project, '.thumbs', thumbFilename);

  if (!storage.validatePath(thumbRelative)) {
    return new NextResponse(null, { status: 404 });
  }

  const thumbStat = await storage.stat(thumbRelative);
  if (!thumbStat) {
    return new NextResponse(null, { status: 404 });
  }

  let isStale = false;
  const info = await findHtmlPathForThumb(client, project, thumbFilename);

  if (info) {
    const htmlStat = await storage.stat(info.htmlRelative);
    if (htmlStat) {
      isStale = htmlStat.mtimeMs > thumbStat.mtimeMs;
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
}
