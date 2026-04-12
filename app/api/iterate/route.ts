import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest, writeHtmlFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { driftPromptBoilerplate } from '@/lib/canvas-boilerplate';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function POST(request: Request) {
  const { client, project, conceptId, versionId } = await request.json();

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
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

  // Write the drift-prompt boilerplate
  const boilerplate = driftPromptBoilerplate(
    typeof manifest.project.canvas === 'string' ? manifest.project.canvas : 'desktop',
    `${manifest.project.name} — ${concept.label} v${nextNumber}`,
    concept.label,
    nextNumber,
  );

  await writeHtmlFile(userId, client, project, newFile, boilerplate);

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
  await writeManifest(userId, client, project, manifest);

  // Return the new version info + absolute path for clipboard
  const absolutePath = path.resolve(path.join(PROJECTS_DIR, client, project, newFile));

  return NextResponse.json({
    versionId: nextId,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
  });
}
