import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolveShareToken } from '@/lib/share-token';

const BUCKET = 'projects';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
  }

  const supabase = getSupabaseAdmin();
  const path = `${resolved.userId}/${resolved.client}/${resolved.project}/manifest.json`;

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const text = await data.text();
  const manifest = JSON.parse(text);

  // Round-pinned share: scope the manifest to the pinned round so the viewer
  // can't land on a different round whose files were never uploaded. A share is
  // created per (user, project, round) and only the pinned round's files ship;
  // without this the viewer defaults to the LATEST round and 404s when that
  // isn't the shared one (the "Not found" on under-curated multi-round shares).
  // round_number === null = legacy "follow latest" share → no scoping.
  if (resolved.roundNumber != null && Array.isArray(manifest.rounds)) {
    const pinned = manifest.rounds.find((r: { number?: number }) => r.number === resolved.roundNumber);
    if (pinned) manifest.rounds = [pinned];
  }

  // Set concepts alias to the (now possibly only) latest round
  if (manifest.rounds?.length) {
    manifest.concepts = manifest.rounds[manifest.rounds.length - 1].concepts || [];
  }

  return NextResponse.json(manifest);
}
