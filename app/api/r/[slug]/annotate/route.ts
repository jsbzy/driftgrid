import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/r/{slug}/annotate
 * Add an annotation from a client reviewer (no auth required).
 * The review link slug validates access.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  // Validate the review link
  const { data: link } = await supabase
    .from('review_links')
    .select('id, project_id, expires_at')
    .eq('slug', slug)
    .single();

  if (!link) {
    return NextResponse.json({ error: 'Review link not found' }, { status: 404 });
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Review link expired' }, { status: 410 });
  }

  const { versionId, x, y, element, text, author, parentId } = await request.json();

  if (!versionId || !text) {
    return NextResponse.json({ error: 'versionId and text required' }, { status: 400 });
  }

  // Verify version belongs to this project
  const { data: version } = await supabase
    .from('versions')
    .select('id, concept_id')
    .eq('id', versionId)
    .single();

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const { data: concept } = await supabase
    .from('concepts')
    .select('project_id')
    .eq('id', version.concept_id)
    .single();

  if (!concept || concept.project_id !== link.project_id) {
    return NextResponse.json({ error: 'Version not in this project' }, { status: 403 });
  }

  // Insert annotation
  const { data: annotation, error } = await supabase
    .from('annotations')
    .insert({
      version_id: versionId,
      x: x ?? null,
      y: y ?? null,
      element: element ?? null,
      text,
      author: author || 'Client',
      is_client: true,
      is_agent: false,
      parent_id: parentId ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the view with the annotation version
  await supabase.from('review_views').insert({
    review_link_id: link.id,
    version_id: versionId,
  });

  return NextResponse.json(annotation);
}
