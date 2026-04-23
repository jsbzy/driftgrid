import { NextResponse } from 'next/server';
import { getUserId, getProfile } from '@/lib/auth';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

/**
 * POST /api/share — create a share link for a project
 * GET /api/share?client=X&project=Y — list share links for a project
 */

export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { client, project } = await request.json();
  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Free-tier: allow one distinct (client, project) with active shares.
  // Any number of rounds within that project is fine — dedupe so a
  // multi-round project doesn't read as "over the limit."
  const profile = await getProfile();
  if (profile && profile.tier === 'free') {
    const { data: distinctShares } = await supabase
      .from('share_links')
      .select('client, project')
      .eq('user_id', userId)
      .eq('is_active', true);

    const distinctKeys = new Set<string>();
    for (const s of distinctShares ?? []) distinctKeys.add(`${s.client}/${s.project}`);
    const requestedKey = `${client}/${project}`;

    if (distinctKeys.size > 0 && !distinctKeys.has(requestedKey)) {
      return NextResponse.json({ error: 'free_limit', message: 'Upgrade to Pro to share unlimited projects.' }, { status: 403 });
    }
  }

  // Reuse existing non-round share if one is already active for this project
  // (the unique index on (user, client, project, coalesce(round_number, -1))
  // would otherwise reject a second insert).
  const { data: existing } = await supabase
    .from('share_links')
    .select('token, created_at, updated_at')
    .eq('user_id', userId)
    .eq('client', client)
    .eq('project', project)
    .is('round_number', null)
    .eq('is_active', true)
    .maybeSingle();

  if (existing) {
    const { origin } = new URL(request.url);
    return NextResponse.json({
      token: existing.token,
      url: `${origin}/s/${client}/${existing.token}`,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    });
  }

  const { data, error } = await supabase
    .from('share_links')
    .insert({ user_id: userId, client, project })
    .select('token, created_at, updated_at')
    .single();

  if (error) {
    // Race: another request inserted the same (user, client, project, null round)
    // between our lookup and insert. Fall back to the row that won.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('share_links')
        .select('token, created_at, updated_at')
        .eq('user_id', userId)
        .eq('client', client)
        .eq('project', project)
        .is('round_number', null)
        .eq('is_active', true)
        .maybeSingle();
      if (raced) {
        const { origin } = new URL(request.url);
        return NextResponse.json({
          token: raced.token,
          url: `${origin}/s/${client}/${raced.token}`,
          created_at: raced.created_at,
          updated_at: raced.updated_at,
        });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { origin } = new URL(request.url);
  return NextResponse.json({
    token: data.token,
    url: `${origin}/s/${client}/${data.token}`,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}

export async function GET(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client');
  const project = searchParams.get('project');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('share_links')
    .select('token, client, project, created_at, updated_at, expires_at, is_active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (client) query = query.eq('client', client);
  if (project) query = query.eq('project', project);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
