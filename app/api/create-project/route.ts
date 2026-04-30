import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CANVAS_PRESETS } from '@/lib/constants';
import { conceptSlug } from '@/lib/letters';
import type { Manifest } from '@/lib/types';
import { areValidSlugs } from '@/lib/slug';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function POST(request: Request) {
  const { client: clientRaw, project: projectRaw, canvas } = await request.json();

  if (!clientRaw || !projectRaw) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  // Canvas is required — no default. Picking the wrong format causes designs
  // to be the wrong dimensions, which is hard to fix retroactively. Force the
  // caller to make this choice up front.
  if (!canvas || typeof canvas !== 'string') {
    return NextResponse.json(
      {
        error: 'canvas is required. Choose the format that matches your output.',
        valid: Object.keys(CANVAS_PRESETS),
        examples: {
          desktop: '1440px wide, scrollable — websites, dashboards',
          mobile: '375px wide, scrollable — app screens',
          'landscape-16-9': '1920×1080 — presentations, slides',
          'a4-portrait': '794×1123 — documents, one-pagers',
        },
      },
      { status: 400 },
    );
  }

  const client = slugify(clientRaw);
  const project = slugify(projectRaw);

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const canvasPreset = canvas;

  if (!CANVAS_PRESETS[canvasPreset]) {
    return NextResponse.json(
      { error: `Unknown canvas preset: ${canvasPreset}`, valid: Object.keys(CANVAS_PRESETS) },
      { status: 400 },
    );
  }

  const projectDir = path.join(PROJECTS_DIR, client, project);
  const conceptDir = path.join(projectDir, 'concept-1');
  const thumbsDir = path.join(projectDir, '.thumbs');
  const brandDir = path.join(PROJECTS_DIR, client, 'brand');

  // Check if project already exists
  try {
    await fs.stat(projectDir);
    return NextResponse.json({ error: `Project already exists: ${client}/${project}` }, { status: 409 });
  } catch {
    // Doesn't exist — good
  }

  // Create directories
  await fs.mkdir(conceptDir, { recursive: true });
  await fs.mkdir(thumbsDir, { recursive: true });

  // Create brand dir if needed
  try {
    await fs.stat(brandDir);
  } catch {
    await fs.mkdir(path.join(brandDir, 'assets'), { recursive: true });
    const clientName = client.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    await fs.writeFile(
      path.join(brandDir, 'guidelines.md'),
      `# ${clientName} Brand Guidelines\n\n## Colors\n- Primary: #000000\n- Secondary: #666666\n- Background: #FFFFFF\n\n## Typography\n- Heading: Inter\n- Body: Inter\n`,
      'utf-8',
    );
  }

  // Create manifest
  const now = new Date().toISOString();
  const conceptId = `concept-${generateId()}`;
  const versionId = `version-${generateId()}`;
  const projectName = project.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const preset = CANVAS_PRESETS[canvasPreset];
  const isLocked = !preset.responsive && typeof preset.height === 'number';
  const widthPx = typeof preset.width === 'number' ? preset.width : 1440;

  const manifest: Manifest = {
    project: {
      name: projectName,
      slug: project,
      client,
      canvas: canvasPreset,
      created: now,
      links: {},
    },
    concepts: [{
      id: conceptId,
      slug: conceptSlug('Concept 1'),
      label: 'Concept 1',
      description: '',
      position: 0,
      visible: true,
      versions: [{
        id: versionId,
        number: 1,
        file: 'concept-1/v1.html',
        parentId: null,
        changelog: 'Initial version',
        visible: true,
        starred: false,
        created: now,
        thumbnail: '',
      }],
    }],
    rounds: [],
    workingSets: [],
    comments: [],
    clientEdits: [],
  };

  await fs.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Create starter HTML
  const starterHtml = isLocked
    ? `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${projectName}</title>\n    <style>\n        * { margin: 0; padding: 0; box-sizing: border-box; }\n        html, body { width: 100%; height: 100vh; overflow: hidden; }\n        body { font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; display: flex; align-items: center; justify-content: center; background: #ffffff; color: #111111; }\n    </style>\n</head>\n<body>\n    <h1 style="font-size: 2rem; font-weight: 300; letter-spacing: 0.05em;">${projectName}</h1>\n</body>\n</html>`
    : `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${projectName}</title>\n    <style>\n        * { margin: 0; padding: 0; box-sizing: border-box; }\n        html, body { width: 100%; }\n        body { max-width: ${widthPx}px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; padding: 4rem 2rem; background: #ffffff; color: #111111; }\n    </style>\n</head>\n<body>\n    <h1 style="font-size: 2rem; font-weight: 300; letter-spacing: 0.05em;">${projectName}</h1>\n</body>\n</html>`;

  await fs.writeFile(path.join(conceptDir, 'v1.html'), starterHtml, 'utf-8');

  const absolutePath = path.resolve(conceptDir, 'v1.html');

  return NextResponse.json({
    client,
    project,
    conceptId,
    versionId,
    absolutePath,
    url: `/admin/${client}/${project}`,
  });
}
