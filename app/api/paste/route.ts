import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest, getRoundConcepts } from '@/lib/manifest';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function POST(request: Request) {
  const { client, project, sourceFile, sourceLabel, sourceNumber, targetConceptId, targetRoundId } = await request.json();

  if (!client || !project || !sourceFile || !targetConceptId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  // Find target concept in the correct round
  const roundData = getRoundConcepts(manifest, targetRoundId);
  const concepts = roundData?.concepts ?? manifest.concepts;

  const targetConcept = concepts.find(c => c.id === targetConceptId);
  if (!targetConcept) {
    return NextResponse.json({ error: 'Target concept not found' }, { status: 404 });
  }

  // Determine next version number in target concept
  const maxNumber = targetConcept.versions.length > 0
    ? Math.max(...targetConcept.versions.map(v => v.number))
    : 0;
  const nextNumber = maxNumber + 1;
  const nextId = `${targetConceptId}--v${nextNumber}`;

  // Determine file path in target concept's folder
  const conceptFolder = targetConcept.versions[0]?.file
    ? path.dirname(targetConcept.versions[0].file)
    : targetConceptId;
  const newFile = `${conceptFolder}/v${nextNumber}.html`;
  const projectDir = path.join(PROJECTS_DIR, client, project);

  // Copy the HTML file
  const srcPath = path.join(projectDir, sourceFile);
  const destPath = path.join(projectDir, newFile);

  try {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
  } catch {
    return NextResponse.json({ error: 'Failed to copy file' }, { status: 500 });
  }

  // Build changelog
  const fromLabel = sourceLabel ? `${sourceLabel} v${sourceNumber || '?'}` : 'clipboard';
  const changelog = `Pasted from ${fromLabel}`;

  // Add new version to target concept
  const newVersion = {
    id: nextId,
    number: nextNumber,
    file: newFile,
    parentId: null,
    changelog,
    visible: true,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  };

  targetConcept.versions.push(newVersion);
  await writeManifest(client, project, manifest);

  const absolutePath = path.resolve(destPath);
  return NextResponse.json({
    versionId: newVersion.id,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
    conceptLabel: targetConcept.label,
  });
}
