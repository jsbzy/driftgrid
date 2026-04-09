import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET = 'projects';

/** Resolve token to userId/client/project */
async function resolveToken(token: string): Promise<{ userId: string; client: string; project: string } | null> {
  const supabase = getSupabaseAdmin();

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
    // Fall through to base64url
  }

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('/');
    if (parts.length === 3) {
      return { userId: parts[0], client: parts[1], project: parts[2] };
    }
  } catch {
    // Invalid
  }

  return null;
}

/** GET /api/s/{token}/thumbs/{filename} — serve thumbnails for shared projects */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const { token, path: pathParts } = await params;
  const resolved = await resolveToken(token);
  if (!resolved) {
    return new NextResponse('Not found', { status: 404 });
  }

  const thumbFilename = pathParts.join('/');
  const storagePath = `${resolved.userId}/${resolved.client}/${resolved.project}/.thumbs/${thumbFilename}`;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    return new NextResponse('Not found', { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const contentType = thumbFilename.endsWith('.png') ? 'image/png' : 'image/webp';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
