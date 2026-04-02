import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import type { Concept, Manifest, Round } from '@/lib/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

/**
 * POST /api/rounds
 *
 * Two actions via `action` field:
 *   "close"  — close the current round (save selects, set closedAt)
 *   "create" — create a new round from selected cards (copy concepts + HTML files)
 *
 * If no action is specified, defaults to "close" for backward compatibility.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { client, project, action = 'close' } = body;

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (action === 'close') {
    return closeRound(manifest, client, project, body);
  } else if (action === 'create') {
    return createRound(manifest, client, project, body);
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

/** Close the current round — save selects and mark closedAt */
async function closeRound(
  manifest: Manifest,
  client: string,
  project: string,
  body: { name?: string; note?: string; selects?: { conceptId: string; versionId: string }[]; roundId?: string },
) {
  const { name, note, selects, roundId } = body;

  // Find the round to close
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

  await writeManifest(client, project, manifest);

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

  // Find the source round
  const sourceRound = body.sourceRoundId
    ? manifest.rounds.find(r => r.id === body.sourceRoundId)
    : manifest.rounds[manifest.rounds.length - 1];

  if (!sourceRound) {
    return NextResponse.json({ error: 'Source round not found' }, { status: 400 });
  }

  const roundNumber = manifest.rounds.length + 1;
  const roundId = `round-${Math.random().toString(36).substring(2, 10)}`;
  const roundSlug = `round-${roundNumber}`;
  const projectDir = path.join(PROJECTS_DIR, client, project);

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

    for (const versionId of versionIds) {
      const sourceVersion = sourceConcept.versions.find(v => v.id === versionId);
      if (!sourceVersion) continue;

      vNum++;
      const newVersionId = `v${vNum}`;

      // Build file paths
      const sourceFile = path.join(projectDir, sourceVersion.file);
      const conceptDir = sourceConcept.slug || conceptId;
      const newRelPath = `${conceptDir}/${roundSlug}/v${vNum}.html`;
      const destFile = path.join(projectDir, newRelPath);

      // Copy HTML file
      try {
        await fs.mkdir(path.dirname(destFile), { recursive: true });
        await fs.copyFile(sourceFile, destFile);
      } catch {
        // Source file might not exist — create an empty placeholder
        await fs.mkdir(path.dirname(destFile), { recursive: true });
        await fs.writeFile(destFile, '<!-- copied from previous round -->', 'utf-8');
      }

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

  // Update the concepts alias to point to the new round
  (manifest as { concepts: Concept[] }).concepts = newConcepts;

  await writeManifest(client, project, manifest);

  return NextResponse.json({
    roundId,
    roundNumber,
    name: newRound.name,
    conceptCount: newConcepts.length,
    versionCount: newConcepts.reduce((sum, c) => sum + c.versions.length, 0),
  });
}
