import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /api/workspaces — List workspaces for the current user
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get workspaces the user is a member of
  const { data: memberships, error: memberError } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id);

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json([]);
  }

  const workspaceIds = memberships.map(m => m.workspace_id);
  const { data: workspaces, error: wsError } = await supabase
    .from('workspaces')
    .select('*')
    .in('id', workspaceIds);

  if (wsError) {
    return NextResponse.json({ error: wsError.message }, { status: 500 });
  }

  // Attach role to each workspace
  const result = (workspaces || []).map(ws => ({
    ...ws,
    role: memberships.find(m => m.workspace_id === ws.id)?.role || 'viewer',
  }));

  return NextResponse.json(result);
}

/**
 * POST /api/workspaces — Create a new workspace
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name, slug })
    .select()
    .single();

  if (wsError) {
    return NextResponse.json({ error: wsError.message }, { status: 400 });
  }

  // Add current user as owner
  await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'owner',
  });

  return NextResponse.json(workspace);
}
