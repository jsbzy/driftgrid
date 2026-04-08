import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET = 'projects';

/** GET /api/s/{token}/manifest — serve manifest for a shared project from Supabase Storage */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  // Resolve share token
  const { data: link, error: linkErr } = await supabase
    .from('share_links')
    .select('user_id, client, project, expires_at, is_active')
    .eq('token', token)
    .single();

  if (linkErr || !link || !link.is_active) {
    return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link expired' }, { status: 410 });
  }

  // Read manifest from storage
  const path = `${link.user_id}/${link.client}/${link.project}/manifest.json`;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const text = await data.text();
  const manifest = JSON.parse(text);

  // Set concepts alias to latest round (same as getManifest)
  if (manifest.rounds?.length) {
    manifest.concepts = manifest.rounds[manifest.rounds.length - 1].concepts || [];
  }

  return NextResponse.json(manifest);
}
