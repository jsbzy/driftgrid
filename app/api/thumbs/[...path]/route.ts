import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { generateThumbnail } from '@/lib/thumbnails';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Track in-flight regenerations to avoid duplicate work
const regenerating = new Set<string>();

/**
 * Given a thumbnail filename like "concept-1-v1.png",
 * find the matching HTML file by looking up the manifest.
 */
async function findHtmlPathForThumb(
  client: string,
  project: string,
  thumbFilename: string
): Promise<{ htmlPath: string; conceptId: string; versionId: string; width: number; height: number | 'auto' } | null> {
  const manifest = await getManifest(client, project);
  if (!manifest) return null;

  // Thumbnail filename is "{conceptId}-{versionId}.png"
  const baseName = thumbFilename.replace(/\.png$/, '');

  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      const expectedName = `${concept.id}-${version.id}`;
      if (expectedName === baseName) {
        const projectDir = path.join(PROJECTS_DIR, client, project);
        const htmlPath = path.resolve(projectDir, version.file);

        const preset = CANVAS_PRESETS[manifest.project.canvas];
        const width = typeof preset?.width === 'number' ? preset.width : 1440;
        const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';

        return { htmlPath, conceptId: concept.id, versionId: version.id, width, height };
      }
    }
  }

  return null;
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
      'Content-Type': 'image/png',
      'Cache-Control': isStale ? 'no-cache' : 'public, max-age=60',
    };

    if (isStale) {
      headers['X-Thumbnail-Stale'] = 'true';
    }

    return new NextResponse(data, { headers });
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
            if (expectedName === thumbFilename.replace(/\.png$/, '')) {
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
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
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
      'Content-Type': 'image/png',
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
