import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { getCloudShareStatus } from '@/lib/cloud-client';

/**
 * POST /api/cloud/share-status — lightweight lookup used by the SharePanel when
 * opening against an already-authenticated session. Returns whether a share
 * already exists for this (user, client, project) and, if so, the URL +
 * last-published timestamp. Does NOT upload anything.
 *
 * When running on the cloud deployment: queries Supabase directly via admin.
 * When running locally (cloud mode off): proxies the request to the cloud so
 * the SharePanel can still see existing shares.
 *
 * Body: { client, project, accessToken }
 * Returns: { exists: boolean, token?, url?, lastPublishedAt? } or { needsAuth: true }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { client, project, accessToken } = body;
  const roundNumber = typeof body.roundNumber === 'number' ? body.roundNumber : null;
  if (!client || !project || !accessToken) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Local dev — proxy to the cloud so existing shares are discoverable.
  if (!isCloudMode()) {
    try {
      const result = await getCloudShareStatus(accessToken, client, project, roundNumber);
      if ('needsAuth' in result && result.needsAuth) {
        return NextResponse.json({ needsAuth: true }, { status: 401 });
      }
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Cloud unreachable' },
        { status: 502 },
      );
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ needsAuth: true }, { status: 401 });
  }

  // Scope the lookup by round_number so each round has its own share/URL.
  let query = supabase
    .from('share_links')
    .select('token, created_at, updated_at, round_number')
    .eq('user_id', user.id)
    .eq('client', client)
    .eq('project', project)
    .eq('is_active', true);
  query = roundNumber === null ? query.is('round_number', null) : query.eq('round_number', roundNumber);
  const { data } = await query.maybeSingle();

  if (!data) {
    return NextResponse.json({ exists: false });
  }

  const { origin } = new URL(request.url);
  return NextResponse.json({
    exists: true,
    token: data.token,
    url: `${origin}/s/${client}/${data.token}`,
    lastPublishedAt: data.updated_at ?? data.created_at,
    roundNumber: data.round_number,
  });
}
