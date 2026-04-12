import { NextResponse } from 'next/server';
import { getUserId, getProfile, countUserShares } from '@/lib/auth';
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

  // Check free tier share limit (1 project lifetime)
  const profile = await getProfile();
  if (profile && profile.tier === 'free') {
    const existingCount = await countUserShares(userId);
    if (existingCount > 0) {
      // Check if the existing share is for THIS project (that's ok — return it)
      const supabaseCheck = getSupabaseAdmin();
      const { data: existing } = await supabaseCheck
        .from('share_links')
        .select('token')
        .eq('user_id', userId)
        .eq('client', client)
        .eq('project', project)
        .eq('is_active', true)
        .single();

      if (!existing) {
        return NextResponse.json({ error: 'free_limit', message: 'Upgrade to Pro to share unlimited projects.' }, { status: 403 });
      }
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('share_links')
    .insert({ user_id: userId, client, project })
    .select('token, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { origin } = new URL(request.url);
  const shareUrl = `${origin}/s/${data.token}`;

  return NextResponse.json({ token: data.token, url: shareUrl, created_at: data.created_at });
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
    .select('token, client, project, created_at, expires_at, is_active')
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
