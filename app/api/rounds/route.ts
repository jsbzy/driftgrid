import { NextResponse } from 'next/server';
import { getManifest, writeManifest } from '@/lib/manifest';

export async function POST(request: Request) {
  const { client, project, name, note, selects } = await request.json();

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Initialize rounds array if missing (backward compat)
  if (!manifest.rounds) {
    manifest.rounds = [];
  }

  // Determine round number
  const roundNumber = manifest.rounds.length + 1;
  const roundId = `round-${Math.random().toString(36).substring(2, 10)}`;
  const roundName = name || `Round ${roundNumber}`;

  // Stamp all versions without a roundId
  let stamped = 0;
  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      if (!version.roundId) {
        version.roundId = roundId;
        stamped++;
      }
    }
  }

  if (stamped === 0) {
    return NextResponse.json({ error: 'No unstamped versions to close' }, { status: 400 });
  }

  // Capture selects — either passed explicitly or read from the request
  const roundSelects: { conceptId: string; versionId: string }[] = [];
  if (Array.isArray(selects) && selects.length > 0) {
    roundSelects.push(...selects);
  }

  // Add the round entry with selects
  manifest.rounds.push({
    id: roundId,
    number: roundNumber,
    name: roundName,
    closedAt: new Date().toISOString(),
    note: note || undefined,
    selects: roundSelects.length > 0 ? roundSelects : undefined,
  });

  await writeManifest(client, project, manifest);

  // Build a summary of the selects for the agent
  const selectsSummary = roundSelects.map(s => {
    const concept = manifest.concepts.find(c => c.id === s.conceptId);
    const version = concept?.versions.find(v => v.id === s.versionId);
    return {
      concept: concept?.label ?? s.conceptId,
      version: `v${version?.number ?? '?'}`,
      file: version?.file ?? 'unknown',
    };
  });

  return NextResponse.json({
    roundId,
    roundNumber,
    name: roundName,
    stamped,
    selects: selectsSummary,
  });
}
