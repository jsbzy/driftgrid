import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

/**
 * GET /api/cloud/comments?token=X — fetch all client comments for a share link,
 * formatted as structured text for copy-paste into a conversation.
 *
 * Returns: { text: string, count: number }
 *
 * The text format groups comments by concept/version for readability:
 *
 *   ## Client Comments — {project} (shared via DriftGrid)
 *
 *   ### {Concept Label} (v{N})
 *   - "Comment text here" — Author Name
 */
export async function GET(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Resolve the share token to get project info
  const { data: shareLink } = await supabase
    .from('share_links')
    .select('user_id, client, project, is_active')
    .eq('token', token)
    .single();

  if (!shareLink?.is_active) {
    return NextResponse.json({ error: 'Invalid or inactive share link' }, { status: 404 });
  }

  // Fetch all comments for this share
  const { data: comments, error } = await supabase
    .from('client_comments')
    .select('*')
    .eq('share_token', token)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!comments || comments.length === 0) {
    return NextResponse.json({ text: '', count: 0 });
  }

  // Try to load manifest from storage to get concept labels
  const storagePath = `${shareLink.user_id}/${shareLink.client}/${shareLink.project}/manifest.json`;
  const { data: manifestBlob } = await supabase.storage
    .from('projects')
    .download(storagePath);

  let conceptLabels: Record<string, string> = {};
  if (manifestBlob) {
    try {
      const manifest = JSON.parse(await manifestBlob.text());
      // Build concept ID → label map from all rounds
      const rounds = manifest.rounds || [];
      for (const round of rounds) {
        for (const concept of round.concepts || []) {
          conceptLabels[concept.id] = concept.label || concept.slug || concept.id;
        }
      }
      // Also check top-level concepts
      for (const concept of manifest.concepts || []) {
        conceptLabels[concept.id] = concept.label || concept.slug || concept.id;
      }
    } catch {
      // Manifest parse failed — use concept IDs as-is
    }
  }

  // Group comments by concept/version
  const grouped: Record<string, typeof comments> = {};
  for (const comment of comments) {
    // Skip replies (threaded) — include top-level only, with replies nested
    if (comment.parent_comment_id) continue;
    const key = `${comment.concept_id}::${comment.version_id}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(comment);
  }

  // Find replies
  const replies: Record<string, typeof comments> = {};
  for (const comment of comments) {
    if (!comment.parent_comment_id) continue;
    if (!replies[comment.parent_comment_id]) replies[comment.parent_comment_id] = [];
    replies[comment.parent_comment_id].push(comment);
  }

  // Build formatted text
  const lines: string[] = [];
  lines.push(`## Client Comments — ${shareLink.project}`);
  lines.push('');

  for (const [key, groupComments] of Object.entries(grouped)) {
    const [conceptId, versionId] = key.split('::');
    const label = conceptLabels[conceptId] || conceptId;
    lines.push(`### ${label} (${versionId})`);

    for (const comment of groupComments) {
      const status = comment.status === 'resolved' ? ' [resolved]' : '';
      lines.push(`- "${comment.body}" — ${comment.author_name}${status}`);

      // Add any replies indented
      const commentReplies = replies[comment.id];
      if (commentReplies) {
        for (const reply of commentReplies) {
          lines.push(`  - "${reply.body}" — ${reply.author_name}`);
        }
      }
    }

    lines.push('');
  }

  const topLevelCount = comments.filter(c => !c.parent_comment_id).length;

  return NextResponse.json({
    text: lines.join('\n').trim(),
    count: topLevelCount,
  });
}
