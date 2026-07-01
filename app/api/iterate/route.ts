import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest, copyFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { DRIFT_COPY_CHANGELOG } from '@/lib/constants';
import { areValidSlugs } from '@/lib/slug';
import { invalidateManifestCache } from '@/lib/manifest-cache';
import { findConceptAndVersion } from '@/lib/manifest-lookup';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function POST(request: Request) {
  const { client, project, conceptId, versionId, roundId } = await request.json();

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  // Resolve the concept + version across all rounds. `manifest.concepts` is only
  // the latest-round alias, so drifting a non-latest round via the alias 404s
  // (the rounds-alias footgun). roundId, when supplied, disambiguates a concept
  // id that repeats across rounds; otherwise findConceptAndVersion searches all.
  let concept, version;
  if (roundId) {
    const round = manifest.rounds?.find(r => r.id === roundId);
    concept = round?.concepts.find(c => c.id === conceptId);
    version = concept?.versions.find(v => v.id === versionId);
  }
  if (!concept || !version) {
    ({ concept, version } = findConceptAndVersion(manifest, conceptId, versionId));
  }
  if (!concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Determine next version number (defensive: never Math.max of an empty list).
  const versionNumbers = concept.versions.map(v => v.number);
  const maxNumber = versionNumbers.length ? Math.max(...versionNumbers) : 0;
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

  // Drift = working copy + prompt. Duplicate the source version's HTML into the new slot
  // so the agent iterates on a real starting point instead of a blank placeholder.
  await copyFile(userId, client, project, version.file, newFile);

  // Add new version to manifest
  const newVersion = {
    id: nextId,
    number: nextNumber,
    file: newFile,
    parentId: version.id,
    changelog: DRIFT_COPY_CHANGELOG,
    visible: true,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  };

  concept.versions.push(newVersion);
  await writeManifest(userId, client, project, manifest);
  invalidateManifestCache(client, project);

  // Return the new version info + absolute path for clipboard
  const absolutePath = path.resolve(path.join(PROJECTS_DIR, client, project, newFile));

  return NextResponse.json({
    versionId: nextId,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
  });
}
