import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import { conceptSlug } from '@/lib/letters';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export async function POST(request: Request) {
  const { client, project, conceptId, versionId, label } = await request.json();

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  const sourceConcept = manifest.concepts.find(c => c.id === conceptId);
  if (!sourceConcept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }

  const sourceVersion = sourceConcept.versions.find(v => v.id === versionId);
  if (!sourceVersion) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const projectDir = path.join(PROJECTS_DIR, client, project);

  // Determine next concept folder number by scanning existing concept-N folders
  const entries = await fs.readdir(projectDir);
  let maxN = 0;
  for (const entry of entries) {
    const match = entry.match(/^concept-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  const nextN = maxN + 1;
  const newFolder = `concept-${nextN}`;

  // Create the new concept folder
  await fs.mkdir(path.join(projectDir, newFolder), { recursive: true });

  // Copy the source HTML file to the new concept folder as v1.html
  const srcPath = path.join(projectDir, sourceVersion.file);
  const newFile = `${newFolder}/v1.html`;
  const destPath = path.join(projectDir, newFile);

  try {
    await fs.copyFile(srcPath, destPath);
  } catch {
    return NextResponse.json({ error: 'Failed to copy file' }, { status: 500 });
  }

  // Determine source version number for description
  const sourceVersionNumber = sourceVersion.number;
  const sourceConceptLabel = sourceConcept.label;

  // Create new concept and version IDs
  const newConceptId = `concept-${generateId()}`;
  const newVersionId = `version-${generateId()}`;

  // Build the new concept entry
  const newLabel = label || `Concept ${nextN}`;
  const newConcept = {
    id: newConceptId,
    slug: conceptSlug(newLabel),
    label: newLabel,
    description: `Branched from ${sourceConceptLabel} v${sourceVersionNumber}`,
    position: manifest.concepts.length,
    visible: true,
    branchedFrom: { conceptId, versionId },
    versions: [{
      id: newVersionId,
      number: 1,
      file: newFile,
      parentId: null,
      changelog: `Branched from ${sourceConceptLabel} v${sourceVersionNumber}`,
      visible: true,
      starred: false,
      created: new Date().toISOString(),
      thumbnail: '',
    }],
  };

  manifest.concepts.push(newConcept);
  await writeManifest(client, project, manifest);

  const absolutePath = path.resolve(destPath);

  return NextResponse.json({
    conceptId: newConceptId,
    versionId: newVersionId,
    absolutePath,
  });
}
