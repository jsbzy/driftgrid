import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';

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

  // Copy the HTML file
  const srcPath = path.join(projectDir, version.file);
  const destPath = path.join(projectDir, newFile);

  try {
    await fs.copyFile(srcPath, destPath);
  } catch {
    return NextResponse.json({ error: 'Failed to copy file' }, { status: 500 });
  }

  // Add new version to manifest
  const newVersion = {
    id: nextId,
    number: nextNumber,
    file: newFile,
    parentId: versionId,
    changelog: '',
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
