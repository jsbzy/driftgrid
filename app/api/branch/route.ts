import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import { conceptSlug } from '@/lib/letters';
import { driftPromptBoilerplate } from '@/lib/canvas-boilerplate';

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

  // Write empty canvas boilerplate as v1.html — designer directs agent to fill it in
  const newFile = `${newFolder}/v1.html`;
  const destPath = path.join(projectDir, newFile);
  const newLabel = label || `Concept ${nextN}`;

  const boilerplate = driftPromptBoilerplate(
    typeof manifest.project.canvas === 'string' ? manifest.project.canvas : 'desktop',
    `${manifest.project.name} — ${newLabel}`,
    newLabel,
    1,
  );

  try {
    await fs.writeFile(destPath, boilerplate, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
  }

  // Create new concept and version IDs
  const newConceptId = `concept-${generateId()}`;
  const newVersionId = `version-${generateId()}`;

  // Build the new concept entry — remember the source concept and branch link
  // so we can show the "← Source" breadcrumb.
  const newConcept = {
    id: newConceptId,
    slug: conceptSlug(newLabel),
    label: newLabel,
    description: 'New drift slot — empty',
    position: 0, // will be renumbered below
    visible: true,
    branchedFrom: {
      conceptId: sourceConcept.id,
      versionId: sourceVersion.id,
    },
    versions: [{
      id: newVersionId,
      number: 1,
      file: newFile,
      parentId: null,
      changelog: 'New drift slot — empty',
      visible: true,
      starred: false,
      created: new Date().toISOString(),
      thumbnail: '',
    }],
  };

  // Insert immediately after the source concept, not at the end.
  // manifest.concepts is a reference to the active round's concepts array,
  // so mutating it here also mutates the round.
  const sourceIndex = manifest.concepts.findIndex(c => c.id === sourceConcept.id);
  const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : manifest.concepts.length;
  manifest.concepts.splice(insertAt, 0, newConcept);
  // Renumber positions so layout stays consistent
  manifest.concepts.forEach((c, i) => { c.position = i + 1; });

  await writeManifest(client, project, manifest);

  const absolutePath = path.resolve(destPath);

  return NextResponse.json({
    conceptId: newConceptId,
    versionId: newVersionId,
    absolutePath,
  });
}
