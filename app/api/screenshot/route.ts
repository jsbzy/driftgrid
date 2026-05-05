import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { CANVAS_PRESETS } from '@/lib/constants';
import { areValidSlugs } from '@/lib/slug';
import { chromium } from 'playwright';
import type { Manifest } from '@/lib/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

/**
 * POST /api/screenshot
 * Body: { client, project, conceptId, versionId, annotationId }
 * Renders the version's HTML at canvas dimensions and saves a PNG attachment
 * keyed to the annotation. Returns the absolute file path so it can be embedded
 * in a Copy-for-Agent payload.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client, project, conceptId, versionId, annotationId } = body;

    if (!client || !project || !conceptId || !versionId || !annotationId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!areValidSlugs(client, project)) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }

    const userId = await getUserId();
    const manifest = await getManifest(userId, client, project);
    if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const found = findConceptAndVersionAcrossRounds(manifest, conceptId, versionId);
    if (!found) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

    const preset = CANVAS_PRESETS[manifest.project.canvas];
    const width = typeof preset?.width === 'number' ? preset.width : 1440;
    const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';

    const projectDir = path.join(PROJECTS_DIR, client, project);
    const attachDir = path.join(projectDir, '.attachments');
    await fs.mkdir(attachDir, { recursive: true });

    // Stable filename: same annotation always overwrites its prior shot, so the
    // disk doesn't fill up with stale screenshots.
    const fileName = `${annotationId}.png`;
    const outputPath = path.join(attachDir, fileName);
    const htmlPath = path.resolve(projectDir, found.version.file);

    try {
      await fs.access(htmlPath);
    } catch {
      return NextResponse.json({ error: `HTML file not found: ${found.version.file}` }, { status: 404 });
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width, height: height === 'auto' ? 900 : height },
        deviceScaleFactor: 2,
      });
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: outputPath, type: 'png', fullPage: height === 'auto' });
    } finally {
      await browser.close();
    }

    return NextResponse.json({
      path: outputPath,
      relative: `projects/${client}/${project}/.attachments/${fileName}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? 'Screenshot failed' }, { status: 500 });
  }
}

function findConceptAndVersionAcrossRounds(manifest: Manifest, conceptId: string, versionId: string) {
  const tryConcept = (concepts: Manifest['concepts']) => {
    const concept = concepts?.find(c => c.id === conceptId);
    if (!concept) return null;
    const version = concept.versions.find(v => v.id === versionId);
    if (!version) return null;
    return { concept, version };
  };
  const top = tryConcept(manifest.concepts);
  if (top) return top;
  for (const r of manifest.rounds ?? []) {
    const got = tryConcept(r.concepts);
    if (got) return got;
  }
  return null;
}
