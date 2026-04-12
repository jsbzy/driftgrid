import { NextResponse } from 'next/server';
import { getManifest, writeManifest, writeHtmlFile, copyFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import type { Concept, Manifest, Round } from '@/lib/types';

/**
 * POST /api/rounds
 *
 * Three actions via `action` field:
 *   "close"   — close the current round (save selects, set closedAt)
 *   "create"  — create a new round from selected cards (copy concepts + HTML files)
 *   "copy-to" — copy a version to an existing round
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { client, project, action = 'close' } = body;

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (action === 'close') {
    return closeRound(manifest, userId, client, project, body);
  } else if (action === 'create') {
    return createRound(manifest, userId, client, project, body);
  } else if (action === 'copy-to') {
    return copyToRound(manifest, userId, client, project, body);
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

/** Close the current round — save selects and mark closedAt */
async function closeRound(
  manifest: Manifest,
  userId: string | null,
  client: string,
  project: string,
  body: { name?: string; note?: string; selects?: { conceptId: string; versionId: string }[]; roundId?: string },
) {
  const { name, note, selects, roundId } = body;

  const round = roundId
    ? manifest.rounds.find(r => r.id === roundId)
    : manifest.rounds[manifest.rounds.length - 1];

  if (!round) {
    return NextResponse.json({ error: 'No round to close' }, { status: 400 });
  }

  if (round.closedAt) {
    return NextResponse.json({ error: 'Round already closed' }, { status: 400 });
  }

  round.closedAt = new Date().toISOString();
  if (name) round.name = name;
  if (note) round.note = note;
  if (selects && selects.length > 0) round.selects = selects;

  await writeManifest(userId, client, project, manifest);

  return NextResponse.json({
    roundId: round.id,
    roundNumber: round.number,
    name: round.name,
    selectCount: round.selects.length,
    closed: true,
  });
}

/** Create a new round from selected cards — copies concepts and HTML files */
async function createRound(
  manifest: Manifest,
  userId: string | null,
  client: string,
  project: string,
  body: {
    name?: string;
    note?: string;
    selections: { conceptId: string; versionId: string }[];
    sourceRoundId?: string;
  },
) {
  const { name, note, selections } = body;

  if (!selections || selections.length === 0) {
    return NextResponse.json({ error: 'No selections provided' }, { status: 400 });
  }

  const sourceRound = body.sourceRoundId
    ? manifest.rounds.find(r => r.id === body.sourceRoundId)
    : manifest.rounds[manifest.rounds.length - 1];

  if (!sourceRound) {
    return NextResponse.json({ error: 'Source round not found' }, { status: 400 });
  }

  const roundNumber = manifest.rounds.length + 1;
  const roundId = `round-${Math.random().toString(36).substring(2, 10)}`;
  const roundSlug = `round-${roundNumber}`;

  // Group selections by concept
  const selectionsByConceptId = new Map<string, string[]>();
  for (const sel of selections) {
    const existing = selectionsByConceptId.get(sel.conceptId) || [];
    existing.push(sel.versionId);
    selectionsByConceptId.set(sel.conceptId, existing);
  }

  // Build new concepts with copied versions
  const newConcepts: Concept[] = [];
  let position = 0;

  for (const [conceptId, versionIds] of selectionsByConceptId) {
    const sourceConcept = sourceRound.concepts.find(c => c.id === conceptId);
    if (!sourceConcept) continue;

    const newConceptId = `${conceptId}-${roundSlug}`;
    const newVersions = [];
    let vNum = 0;

    const sortedVersionIds = [...versionIds].sort((a, b) => {
      const va = sourceConcept.versions.find(v => v.id === a);
      const vb = sourceConcept.versions.find(v => v.id === b);
      return new Date(va?.created ?? 0).getTime() - new Date(vb?.created ?? 0).getTime();
    });

    for (const versionId of sortedVersionIds) {
      const sourceVersion = sourceConcept.versions.find(v => v.id === versionId);
      if (!sourceVersion) continue;

      vNum++;
      const newVersionId = `v${vNum}`;
      const conceptDir = sourceConcept.slug || conceptId;
      const newRelPath = `${conceptDir}/${roundSlug}/v${vNum}.html`;

      // Copy HTML file via storage dispatch (works for both local and cloud)
      await copyFile(userId, client, project, sourceVersion.file, newRelPath);

      newVersions.push({
        id: newVersionId,
        number: vNum,
        file: newRelPath,
        parentId: null,
        changelog: `Carried from ${sourceRound.name} — ${sourceConcept.label} v${sourceVersion.number}`,
        visible: true,
        starred: false,
        created: new Date().toISOString(),
        thumbnail: '',
      });
    }

    newConcepts.push({
      id: newConceptId,
      slug: sourceConcept.slug,
      label: sourceConcept.label,
      description: sourceConcept.description,
      position: position++,
      visible: true,
      versions: newVersions,
    });
  }

  const newRound: Round = {
    id: roundId,
    number: roundNumber,
    name: name || `Round ${roundNumber}`,
    createdAt: new Date().toISOString(),
    note: note || undefined,
    selects: [],
    concepts: newConcepts,
  };

  manifest.rounds.push(newRound);
  (manifest as { concepts: Concept[] }).concepts = newConcepts;

  await writeManifest(userId, client, project, manifest);

  return NextResponse.json({
    roundId,
    roundNumber,
    name: newRound.name,
    conceptCount: newConcepts.length,
    versionCount: newConcepts.reduce((sum, c) => sum + c.versions.length, 0),
  });
}

/** Copy a version to an existing round */
async function copyToRound(
  manifest: Manifest,
  userId: string | null,
  client: string,
  project: string,
  body: { conceptId: string; versionId: string; sourceRoundId?: string; targetRoundId: string },
) {
  const { conceptId, versionId, sourceRoundId, targetRoundId } = body;
  if (!conceptId || !versionId || !targetRoundId) {
    return NextResponse.json({ error: 'Missing conceptId, versionId, or targetRoundId' }, { status: 400 });
  }

  const sourceRound = sourceRoundId
    ? manifest.rounds.find(r => r.id === sourceRoundId)
    : manifest.rounds[manifest.rounds.length - 1];
  if (!sourceRound) {
    return NextResponse.json({ error: 'Source round not found' }, { status: 404 });
  }
  const sourceConcept = sourceRound.concepts.find(c => c.id === conceptId);
  const sourceVersion = sourceConcept?.versions.find(v => v.id === versionId);
  if (!sourceConcept || !sourceVersion) {
    return NextResponse.json({ error: 'Source version not found' }, { status: 404 });
  }

  const targetRound = manifest.rounds.find(r => r.id === targetRoundId);
  if (!targetRound) {
    return NextResponse.json({ error: 'Target round not found' }, { status: 404 });
  }

  let targetConcept = targetRound.concepts.find(c => c.label === sourceConcept.label);
  if (!targetConcept) {
    const newConceptId = `${sourceConcept.slug || conceptId}-${targetRound.id}`;
    targetConcept = {
      id: newConceptId,
      slug: sourceConcept.slug,
      label: sourceConcept.label,
      description: sourceConcept.description,
      position: targetRound.concepts.length + 1,
      visible: true,
      versions: [],
    };
    targetRound.concepts.push(targetConcept);
  }

  const maxNum = targetConcept.versions.length > 0
    ? Math.max(...targetConcept.versions.map(v => v.number))
    : 0;
  const nextNum = maxNum + 1;
  const newVersionId = `${targetConcept.id}--v${nextNum}`;

  const conceptDir = targetConcept.slug || targetConcept.id;
  const roundSlug = `round-${targetRound.number}`;
  const newRelPath = `${conceptDir}/${roundSlug}/v${nextNum}.html`;

  await copyFile(userId, client, project, sourceVersion.file, newRelPath);

  const newVersion = {
    id: newVersionId,
    number: nextNum,
    file: newRelPath,
    parentId: null,
    changelog: `From ${sourceRound.name} — ${sourceConcept.label} v${sourceVersion.number}`,
    visible: true,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  };

  targetConcept.versions.push(newVersion);
  await writeManifest(userId, client, project, manifest);

  return NextResponse.json({
    success: true,
    targetRound: targetRound.name,
    conceptLabel: targetConcept.label,
    versionNumber: nextNum,
  });
}
