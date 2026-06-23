import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET = 'projects';

/** Resolve token to userId/client/project — tries DB first, then base64url path */
async function resolveToken(token: string): Promise<{ userId: string; client: string; project: string; roundNumber: number | null } | null> {
  const supabase = getSupabaseAdmin();

  // Try database
  try {
    const { data } = await supabase
      .from('share_links')
      .select('user_id, client, project, expires_at, is_active, round_number')
      .eq('token', token)
      .single();

    if (data?.is_active && (!data.expires_at || new Date(data.expires_at) > new Date())) {
      return { userId: data.user_id, client: data.client, project: data.project, roundNumber: data.round_number ?? null };
    }
  } catch {
    // Table not in cache — fall through
  }

  // Fallback: base64url encoded path (legacy tokens — not round-pinned)
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('/');
    if (parts.length === 3) {
      return { userId: parts[0], client: parts[1], project: parts[2], roundNumber: null };
    }
  } catch {
    // Invalid token
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
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
