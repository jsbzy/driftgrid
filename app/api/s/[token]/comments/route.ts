import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Resolve token to userId/client/project — tries DB first, then base64url path */
async function resolveToken(token: string): Promise<{ userId: string; client: string; project: string } | null> {
  const supabase = getSupabaseAdmin();

  // Try database
  try {
    const { data } = await supabase
      .from('share_links')
      .select('user_id, client, project, expires_at, is_active')
      .eq('token', token)
      .single();

    if (data?.is_active && (!data.expires_at || new Date(data.expires_at) > new Date())) {
      return { userId: data.user_id, client: data.client, project: data.project };
    }
  } catch {
    // Table not in cache — fall through
  }

  // Fallback: base64url encoded path
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('/');
    if (parts.length === 3) {
      return { userId: parts[0], client: parts[1], project: parts[2] };
    }
  } catch {
    // Invalid token
  }

  return null;
}

/**
 * GET /api/s/[token]/comments — fetch comments for a share link
 * Optional query params: concept_id, version_id (filter to a specific version)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get('concept_id');
  const versionId = searchParams.get('version_id');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('client_comments')
    .select('*')
    .eq('share_token', token)
    .order('created_at', { ascending: true });

  if (conceptId) query = query.eq('concept_id', conceptId);
  if (versionId) query = query.eq('version_id', versionId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/**
 * POST /api/s/[token]/comments — create a new comment (anonymous, no auth)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
  }

  const body = await request.json();
  const { concept_id, version_id, author_name, body: commentBody, x_rel, y_rel, element_selector, parent_comment_id } = body;

  if (!concept_id || !version_id || !author_name?.trim() || !commentBody?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('client_comments')
    .insert({
      share_token: token,
      concept_id,
      version_id,
      author_name: author_name.trim(),
      body: commentBody.trim(),
      x_rel: x_rel ?? null,
      y_rel: y_rel ?? null,
      element_selector: element_selector ?? null,
      parent_comment_id: parent_comment_id ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * PATCH /api/s/[token]/comments — resolve/unresolve a comment
 * Body: { comment_id, status }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
  }

  const body = await request.json();
  const { comment_id, status } = body;

  if (!comment_id || !['open', 'resolved'].includes(status)) {
    return NextResponse.json({ error: 'Invalid comment_id or status' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('client_comments')
    .update({ status })
    .eq('id', comment_id)
    .eq('share_token', token)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
