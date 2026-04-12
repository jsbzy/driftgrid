import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest, copyFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';

export async function POST(request: Request) {
  const { client, project, sourceFile, sourceLabel, sourceNumber, targetConceptId, targetRoundId } = await request.json();

  if (!client || !project || !sourceFile || !targetConceptId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  // Find target concept in the correct round
  let concepts = manifest.concepts;
  if (targetRoundId) {
    const round = manifest.rounds.find(r => r.id === targetRoundId);
    if (round) concepts = round.concepts;
  }

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

  // Copy the HTML file via storage dispatch
  await copyFile(userId, client, project, sourceFile, newFile);

  // Build changelog
  const fromLabel = sourceLabel ? `${sourceLabel} v${sourceNumber || '?'}` : 'clipboard';
  const changelog = `Pasted from ${fromLabel}`;

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
  await writeManifest(userId, client, project, manifest);

  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  const absolutePath = path.resolve(path.join(PROJECTS_DIR, client, project, newFile));
  return NextResponse.json({
    versionId: newVersion.id,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
    conceptLabel: targetConcept.label,
  });
}
