import { NextResponse } from 'next/server';
import { getManifest, writeManifest } from '@/lib/manifest';

export async function POST(request: Request) {
  const { client, project, name, note, selects } = await request.json();

  if (!client || !project || !selects || selects.length === 0) {
    return NextResponse.json({ error: 'Missing fields or no selects' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!manifest.rounds) manifest.rounds = [];

  const roundNumber = manifest.rounds.length + 1;
  const roundId = `round-${Math.random().toString(36).substring(2, 10)}`;

  manifest.rounds.push({
    id: roundId,
    number: roundNumber,
    name: name || `Round ${roundNumber}`,
    savedAt: new Date().toISOString(),
    note: note || undefined,
    selects,
  });

  await writeManifest(client, project, manifest);

  return NextResponse.json({
    roundId,
    roundNumber,
    name: name || `Round ${roundNumber}`,
    selectCount: selects.length,
  });
}
