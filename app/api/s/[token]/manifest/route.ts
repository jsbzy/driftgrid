import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET = 'projects';

/** Resolve token to userId/client/project — tries DB first, then base64url path */
async function resolveToken(token: string): Promise<{ userId: string; client: string; project: string } | null> {
  const supabase = getSupabaseAdmin();

  // Try database
  try {
    const { data } = await supabase
      .from('share_links')
      .select('user_id, client, project, expires_at, is_active')
      .eq('token', token)
      .single();

    if (data?.is_active && (!data.expires_at || new Date(data.expires_at) > new Date())) {
      return { userId: data.user_id, client: data.client, project: data.project };
    }
  } catch {
    // Table not in cache — fall through
  }

  // Fallback: base64url encoded path
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('/');
    if (parts.length === 3) {
      return { userId: parts[0], client: parts[1], project: parts[2] };
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

  // Set concepts alias to latest round
  if (manifest.rounds?.length) {
    manifest.concepts = manifest.rounds[manifest.rounds.length - 1].concepts || [];
  }

  return NextResponse.json(manifest);
}
