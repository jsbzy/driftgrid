import { NextResponse } from 'next/server';
import { getManifest, writeManifest } from '@/lib/manifest';

export async function POST(request: Request) {
  const { client, project, name, note } = await request.json();

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

  // Add the round entry
  manifest.rounds.push({
    id: roundId,
    number: roundNumber,
    name: roundName,
    closedAt: new Date().toISOString(),
    note: note || undefined,
  });

  await writeManifest(client, project, manifest);

  return NextResponse.json({
    roundId,
    roundNumber,
    name: roundName,
    stamped,
  });
}
