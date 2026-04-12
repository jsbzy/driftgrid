import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest, writeHtmlFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { conceptSlug } from '@/lib/letters';
import { driftPromptBoilerplate } from '@/lib/canvas-boilerplate';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export async function POST(request: Request) {
  const { client, project, conceptId, versionId, label } = await request.json();

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
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

  // Determine next concept folder number from manifest (works for both local and cloud)
  let maxN = 0;
  for (const round of manifest.rounds) {
    for (const c of round.concepts) {
      for (const v of c.versions) {
        const match = v.file.match(/concept-(\d+)\//);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxN) maxN = n;
        }
      }
    }
  }
  const nextN = maxN + 1;
  const newFolder = `concept-${nextN}`;

  // Write empty canvas boilerplate as v1.html
  const newFile = `${newFolder}/v1.html`;
  const newLabel = label || `Concept ${nextN}`;

  const boilerplate = driftPromptBoilerplate(
    typeof manifest.project.canvas === 'string' ? manifest.project.canvas : 'desktop',
    `${manifest.project.name} — ${newLabel}`,
    newLabel,
    1,
  );

  await writeHtmlFile(userId, client, project, newFile, boilerplate);

  // Create new concept and version IDs
  const newConceptId = `concept-${generateId()}`;
  const newVersionId = `version-${generateId()}`;

  const newConcept = {
    id: newConceptId,
    slug: conceptSlug(newLabel),
    label: newLabel,
    description: 'New drift slot — empty',
    position: 0,
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

  // Insert immediately after the source concept
  const sourceIndex = manifest.concepts.findIndex(c => c.id === sourceConcept.id);
  const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : manifest.concepts.length;
  manifest.concepts.splice(insertAt, 0, newConcept);
  manifest.concepts.forEach((c, i) => { c.position = i + 1; });

  await writeManifest(userId, client, project, manifest);

  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  const absolutePath = path.resolve(path.join(PROJECTS_DIR, client, project, newFile));

  return NextResponse.json({
    conceptId: newConceptId,
    versionId: newVersionId,
    absolutePath,
  });
}
