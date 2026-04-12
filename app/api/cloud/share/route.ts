import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

/**
 * POST /api/cloud/share — create a share link via JWT auth (for local→cloud flow).
 *
 * Same logic as /api/share but authenticates via Authorization header (JWT)
 * instead of cookie session. Used by the local push-and-share orchestrator.
 *
 * Body: { client, project }
 * Returns: { token, url, created_at }
 */
export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  // Validate JWT
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
  const { client, project } = await request.json();

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  // Check free tier limit
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', userId)
    .single();

  if (profile?.tier === 'free') {
    const { count } = await supabase
      .from('share_links')
      .select('token', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);

    if ((count ?? 0) > 0) {
      // Check if existing share is for THIS project (that's ok)
      const { data: existing } = await supabase
        .from('share_links')
        .select('token, created_at')
        .eq('user_id', userId)
        .eq('client', client)
        .eq('project', project)
        .eq('is_active', true)
        .single();

      if (existing) {
        const { origin } = new URL(request.url);
        return NextResponse.json({ token: existing.token, url: `${origin}/s/${existing.token}`, created_at: existing.created_at });
      }

      return NextResponse.json({ error: 'free_limit', message: 'Upgrade to Pro to share unlimited projects.' }, { status: 403 });
    }
  }

  // Create share link
  const { data, error } = await supabase
    .from('share_links')
    .insert({ user_id: userId, client, project })
    .select('token, created_at')
    .single();

  if (error) {
    // Handle duplicate — return existing share
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('share_links')
        .select('token, created_at')
        .eq('user_id', userId)
        .eq('client', client)
        .eq('project', project)
        .eq('is_active', true)
        .single();

      if (existing) {
        const { origin } = new URL(request.url);
        return NextResponse.json({ token: existing.token, url: `${origin}/s/${existing.token}`, created_at: existing.created_at });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { origin } = new URL(request.url);
  return NextResponse.json({ token: data.token, url: `${origin}/s/${data.token}`, created_at: data.created_at });
}
