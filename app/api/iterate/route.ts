import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import { getStorage } from '@/lib/storage';

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

  const storage = getStorage();

  // Idempotency guard: prevent duplicate version creation (double-click race condition)
  if (concept.versions.some(v => v.id === nextId)) {
    const existing = concept.versions.find(v => v.id === nextId)!;
    const absolutePath = storage.resolvePath(path.join(client, project, existing.file));
    return NextResponse.json({
      versionId: existing.id,
      versionNumber: existing.number,
      file: existing.file,
      absolutePath,
    });
  }

  // Determine new file path (same concept folder, next version)
  const conceptFolder = path.dirname(version.file);
  const newFile = `${conceptFolder}/v${nextNumber}.html`;

  // Copy the HTML file
  const srcPath = path.join(client, project, version.file);
  const destPath = path.join(client, project, newFile);

  try {
    await storage.copyFile(srcPath, destPath);
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
  const absolutePath = storage.resolvePath(path.join(client, project, newFile));

  return NextResponse.json({
    versionId: nextId,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
  });
}
