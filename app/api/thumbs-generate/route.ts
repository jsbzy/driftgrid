import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { generateThumbnail } from '@/lib/thumbnails';
import { getStorage } from '@/lib/storage';

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

    const manifest = await getManifest(client, project);
    if (!manifest) {
      return NextResponse.json(
        { error: `Manifest not found for ${client}/${project}` },
        { status: 404 }
      );
    }

    // Find the concept and version
    const concept = manifest.concepts.find(c => c.id === conceptId);
    if (!concept) {
      return NextResponse.json(
        { error: `Concept ${conceptId} not found` },
        { status: 404 }
      );
    }

    const version = concept.versions.find(v => v.id === versionId);
    if (!version) {
      return NextResponse.json(
        { error: `Version ${versionId} not found in concept ${conceptId}` },
        { status: 404 }
      );
    }

    // Get canvas dimensions
    const preset = CANVAS_PRESETS[manifest.project.canvas];
    const width = typeof preset?.width === 'number' ? preset.width : 1440;
    const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';

    const storage = getStorage();
    const thumbsRelative = path.join(client, project, '.thumbs');
    await storage.mkdir(thumbsRelative);

    const thumbName = `${conceptId}-${versionId}`;
    const thumbRelative = path.join(thumbsRelative, `${thumbName}.webp`);
    const htmlRelative = path.join(client, project, version.file);

    // Thumbnail generation requires absolute paths (Puppeteer needs filesystem access)
    const htmlAbsolute = storage.resolvePath(htmlRelative);
    const thumbAbsolute = storage.resolvePath(thumbRelative);

    if (!htmlAbsolute || !thumbAbsolute) {
      return NextResponse.json(
        { error: 'Cannot resolve file paths (cloud mode requires different thumbnail strategy)' },
        { status: 501 }
      );
    }

    // Verify HTML file exists
    if (!(await storage.exists(htmlRelative))) {
      return NextResponse.json(
        { error: `HTML file not found: ${version.file}` },
        { status: 404 }
      );
    }

    // Generate the thumbnail
    await generateThumbnail(htmlAbsolute, thumbAbsolute, width, height);

    // Update manifest with thumbnail path
    version.thumbnail = `.thumbs/${thumbName}.webp`;
    await writeManifest(client, project, manifest);

    // Read and return the generated thumbnail
    const thumbData = await storage.readFile(thumbRelative);

    return new NextResponse(new Uint8Array(thumbData), {
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
