import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

/**
 * POST /api/cloud/share — create or republish a share link via JWT auth.
 *
 * Round-aware (since 2026-04-17): shares are keyed on
 * (user_id, client, project, round_number). Republishing within the same
 * round reuses the same token and bumps updated_at. Moving to a new round
 * mints a new URL while older round URLs stay alive for historical review.
 *
 * Body: { client, project, roundNumber? }
 * Returns: { token, url, created_at, updated_at, round_number }
 */
export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const userId = user.id;
  const body = await request.json();
  const { client, project } = body;
  const roundNumber = typeof body.roundNumber === 'number' ? body.roundNumber : null;

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  const { origin } = new URL(request.url);

  // ── Free-tier check: 1 distinct (client, project) with active shares.
  // Any number of rounds within that one project is fine.
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', userId)
    .single();

  if (profile?.tier === 'free') {
    const { data: distinctShares } = await supabase
      .from('share_links')
      .select('client, project')
      .eq('user_id', userId)
      .eq('is_active', true);

    const distinctKeys = new Set<string>();
    for (const s of distinctShares ?? []) distinctKeys.add(`${s.client}/${s.project}`);
    const requestedKey = `${client}/${project}`;

    if (distinctKeys.size > 0 && !distinctKeys.has(requestedKey)) {
      return NextResponse.json({
        error: 'free_limit',
        message: 'Upgrade to Pro to share more than one project.',
      }, { status: 403 });
    }
  }

  // ── Find existing share for this exact (user, client, project, round).
  let existingQuery = supabase
    .from('share_links')
    .select('token, created_at')
    .eq('user_id', userId)
    .eq('client', client)
    .eq('project', project)
    .eq('is_active', true);
  existingQuery = roundNumber === null
    ? existingQuery.is('round_number', null)
    : existingQuery.eq('round_number', roundNumber);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const updated = await bumpUpdatedAt(existing.token);
    return NextResponse.json({
      token: existing.token,
      url: `${origin}/s/${client}/${existing.token}`,
      created_at: existing.created_at,
      updated_at: updated ?? new Date().toISOString(),
      round_number: roundNumber,
    });
  }

  // ── No match → insert a new share for this round.
  const { data, error } = await supabase
    .from('share_links')
    .insert({ user_id: userId, client, project, round_number: roundNumber })
    .select('token, created_at, updated_at')
    .single();

  if (error) {
    // Race: another request inserted the same (user, client, project, round)
    // between our lookup and insert. Fall back to the existing row.
    if (error.code === '23505') {
      let raceQuery = supabase
        .from('share_links')
        .select('token, created_at, updated_at')
        .eq('user_id', userId)
        .eq('client', client)
        .eq('project', project)
        .eq('is_active', true);
      raceQuery = roundNumber === null
        ? raceQuery.is('round_number', null)
        : raceQuery.eq('round_number', roundNumber);
      const { data: raced } = await raceQuery.maybeSingle();

      if (raced) {
        const updated = await bumpUpdatedAt(raced.token);
        return NextResponse.json({
          token: raced.token,
          url: `${origin}/s/${client}/${raced.token}`,
          created_at: raced.created_at,
          updated_at: updated ?? raced.updated_at,
          round_number: roundNumber,
        });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    token: data.token,
    url: `${origin}/s/${client}/${data.token}`,
    created_at: data.created_at,
    updated_at: data.updated_at ?? data.created_at,
    round_number: roundNumber,
  });
}

/** Stamp updated_at = now() on the given share. Silent on failure. */
async function bumpUpdatedAt(token: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('share_links')
    .update({ updated_at: new Date().toISOString() })
    .eq('token', token)
    .select('updated_at')
    .single();
  if (error) return null;
  return data?.updated_at ?? null;
}
