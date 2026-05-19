import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest, isCloudMode } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { CANVAS_PRESETS } from '@/lib/constants';
import { generateThumbnail } from '@/lib/thumbnails';
import { areValidSlugs } from '@/lib/slug';
import { findConceptAndVersion } from '@/lib/manifest-lookup';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client, project, conceptId, versionId } = body;

    if (!client || !project || !conceptId || !versionId) {
      return NextResponse.json(
        { error: 'Missing required fields: client, project, conceptId, versionId' },
        { status: 400 }
      );
    }

    if (!areValidSlugs(client, project)) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }

    const userId = isCloudMode() ? await getUserId() : null;
    const manifest = await getManifest(userId, client, project);
    if (!manifest) {
      return NextResponse.json(
        { error: `Manifest not found for ${client}/${project}` },
        { status: 404 }
      );
    }

    // Find the concept and version — searches all rounds, not just the latest
    // (manifest.concepts is the latest-round alias and would 404 here for
    // rounds projects requesting an older round's concept).
    const { concept, version } = findConceptAndVersion(manifest, conceptId, versionId);
    if (!concept || !version) {
      return NextResponse.json(
        { error: `Version ${versionId} not found in concept ${conceptId}` },
        { status: 404 }
      );
    }

    // Get canvas dimensions
    const preset = CANVAS_PRESETS[manifest.project.canvas];
    const width = typeof preset?.width === 'number' ? preset.width : 1440;
    const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';

    // Set up paths
    const projectDir = path.join(PROJECTS_DIR, client, project);
    const thumbsDir = path.join(projectDir, '.thumbs');
    await fs.mkdir(thumbsDir, { recursive: true });

    const thumbName = `${conceptId}-${versionId}`;
    const outputPath = path.join(thumbsDir, `${thumbName}.webp`);
    const htmlPath = path.resolve(projectDir, version.file);

    // Verify HTML file exists
    try {
      await fs.access(htmlPath);
    } catch {
      return NextResponse.json(
        { error: `HTML file not found: ${version.file}` },
        { status: 404 }
      );
    }

    // Generate the thumbnail
    await generateThumbnail(htmlPath, outputPath, width, height);

    // Update manifest with thumbnail path. Routed through lib/storage so the
    // write is serialized with all other manifest writers (drift, branch,
    // annotation, UI mutation) — bypassing this re-creates the lost-update race.
    version.thumbnail = `.thumbs/${thumbName}.webp`;
    await writeManifest(userId, client, project, manifest);

    // Read and return the generated thumbnail
    const thumbData = await fs.readFile(outputPath);

    return new NextResponse(thumbData, {
      headers: {
        'Content-Type': 'image/webp',
        'X-Thumbnail-Generated': 'true',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    return NextResponse.json(
      { error: 'Thumbnail generation failed', details: String(error) },
      { status: 500 }
    );
  }
}
