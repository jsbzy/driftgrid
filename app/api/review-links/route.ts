import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createHash, randomBytes } from 'crypto';

/**
 * GET /api/review-links?projectId=...
 * List review links for a project.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { data, error } = await supabase
    .from('review_links')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/review-links
 * Create a new review link for a project.
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

  const body = await request.json();
  const { projectId, slug: customSlug, password, expiresInDays, roundId } = body;

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  // Verify user has access to this project
  const { data: project } = await supabase
    .from('projects')
    .select('id, workspace_id, client_slug, project_slug')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Check review link limit
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('plan, review_link_limit')
    .eq('id', project.workspace_id)
    .single();

  if (workspace) {
    const { count } = await supabase
      .from('review_links')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    // Count all review links across the workspace for free tier
    if (workspace.plan === 'free') {
      const { count: totalLinks } = await supabase
        .from('review_links')
        .select('id', { count: 'exact', head: true })
        .in('project_id',
          (await supabase.from('projects').select('id').eq('workspace_id', project.workspace_id)).data?.map((p: any) => p.id) || []
        );

      if ((totalLinks || 0) >= workspace.review_link_limit) {
        return NextResponse.json({
          error: 'Review link limit reached',
          upgradeRequired: true,
          currentPlan: workspace.plan,
          limit: workspace.review_link_limit,
        }, { status: 403 });
      }
    }
  }

  // Generate slug
  const slug = customSlug || `${project.client_slug}-${project.project_slug}-${randomBytes(3).toString('hex')}`;

  // Hash password if provided
  let passwordHash = null;
  if (password) {
    passwordHash = createHash('sha256').update(password).digest('hex');
  }

  // Calculate expiry
  let expiresAt = null;
  if (expiresInDays) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const { data: reviewLink, error } = await supabase
    .from('review_links')
    .insert({
      project_id: projectId,
      slug,
      password_hash: passwordHash,
      expires_at: expiresAt,
      round_id: roundId || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  return NextResponse.json({
    ...reviewLink,
    url: `${baseUrl}/r/${slug}`,
  });
}

/**
 * DELETE /api/review-links
 * Delete a review link.
 */
export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('review_links')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
