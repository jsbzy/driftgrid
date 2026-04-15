import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

/**
 * POST /api/cloud/share-status — lightweight lookup used by the local
 * SharePanel when opening against an already-authenticated session. Returns
 * whether a share already exists for this (user, client, project) and, if so,
 * the URL + last-published timestamp. Does NOT upload anything.
 *
 * Body: { client, project, accessToken }
 * Returns: { exists: boolean, token?, url?, lastPublishedAt? } or { needsAuth: true }
 */
export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const { client, project, accessToken } = await request.json();
  if (!client || !project || !accessToken) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ needsAuth: true }, { status: 401 });
  }

  const { data } = await supabase
    .from('share_links')
    .select('token, created_at')
    .eq('user_id', user.id)
    .eq('client', client)
    .eq('project', project)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ exists: false });
  }

  const { origin } = new URL(request.url);
  return NextResponse.json({
    exists: true,
    token: data.token,
    url: `${origin}/s/${client}/${data.token}`,
    lastPublishedAt: data.created_at,
  });
}
