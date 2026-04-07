import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

/**
 * GET /api/r/{slug}
 * Resolve a review link and return project data for the review page.
 * No authentication required — this is the public endpoint.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  // Look up the review link
  const { data: link, error } = await supabase
    .from('review_links')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !link) {
    return NextResponse.json({ error: 'Review link not found' }, { status: 404 });
  }

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Review link expired' }, { status: 410 });
  }

  // Check password
  if (link.password_hash) {
    return NextResponse.json({ requiresPassword: true });
  }

  // Fetch project data
  return await getReviewData(supabase, link);
}

/**
 * POST /api/r/{slug}
 * Submit password for a protected review link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { password } = await request.json();

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { data: link } = await supabase
    .from('review_links')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!link) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify password
  if (link.password_hash) {
    const hash = createHash('sha256').update(password || '').digest('hex');
    if (hash !== link.password_hash) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }
  }

  return await getReviewData(supabase, link);
}

async function getReviewData(supabase: any, link: any) {
  // Fetch project
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', link.project_id)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Fetch workspace plan
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('plan')
    .eq('id', project.workspace_id)
    .single();

  // Fetch concepts and versions
  let conceptQuery = supabase
    .from('concepts')
    .select(`
      *,
      versions (*)
    `)
    .eq('project_id', project.id)
    .eq('visible', true)
    .order('position');

  // Scope to round if specified
  if (link.round_id) {
    conceptQuery = conceptQuery.eq('round_id', link.round_id);
  }

  const { data: concepts } = await conceptQuery;

  // Sort versions within each concept
  const sortedConcepts = (concepts || []).map((c: any) => ({
    ...c,
    versions: (c.versions || [])
      .filter((v: any) => v.visible)
      .sort((a: any, b: any) => a.number - b.number),
  }));

  // Log the view
  await supabase.from('review_views').insert({
    review_link_id: link.id,
  });

  return NextResponse.json({
    project: {
      name: project.name,
      slug: project.project_slug,
      client: project.client_slug,
      canvas: project.canvas,
    },
    concepts: sortedConcepts,
    plan: workspace?.plan || 'free',
    reviewLinkId: link.id,
  });
}
