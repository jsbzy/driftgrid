import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import { emptyCanvasBoilerplate } from '@/lib/canvas-boilerplate';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function POST(request: Request) {
  const { client, project, conceptId, versionId } = await request.json();

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  const concept = manifest.concepts.find(c => c.id === conceptId);
  if (!concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }

  const version = concept.versions.find(v => v.id === versionId);
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Determine next version number
  const maxNumber = Math.max(...concept.versions.map(v => v.number));
  const nextNumber = maxNumber + 1;
  const nextId = `v${nextNumber}`;

  // Idempotency guard: prevent duplicate version creation (double-click race condition)
  if (concept.versions.some(v => v.id === nextId)) {
    const existing = concept.versions.find(v => v.id === nextId)!;
    const existingPath = path.resolve(path.join(PROJECTS_DIR, client, project, existing.file));
    return NextResponse.json({
      versionId: existing.id,
      versionNumber: existing.number,
      file: existing.file,
      absolutePath: existingPath,
    });
  }

  // Determine new file path (same concept folder, next version)
  const conceptFolder = path.dirname(version.file);
  const newFile = `${conceptFolder}/v${nextNumber}.html`;
  const projectDir = path.join(PROJECTS_DIR, client, project);
  const destPath = path.join(projectDir, newFile);

  // Write empty canvas boilerplate — the designer directs their agent to fill it in
  const boilerplate = emptyCanvasBoilerplate(
    typeof manifest.project.canvas === 'string' ? manifest.project.canvas : 'desktop',
    `${manifest.project.name} — ${concept.label} v${nextNumber}`,
  );

  try {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, boilerplate, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
  }

  // Add new version to manifest
  const newVersion = {
    id: nextId,
    number: nextNumber,
    file: newFile,
    parentId: null,
    changelog: 'New drift slot — empty',
    visible: true,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  };

  concept.versions.push(newVersion);
  await writeManifest(client, project, manifest);

  // Return the new version info + absolute path for clipboard
  const absolutePath = path.resolve(destPath);

  return NextResponse.json({
    versionId: nextId,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
  });
}
