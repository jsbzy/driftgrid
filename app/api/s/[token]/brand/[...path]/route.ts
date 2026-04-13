import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

const BUCKET = 'projects';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown',
};

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

/**
 * GET /api/s/[token]/brand/[...path] — serve brand assets for shared projects.
 *
 * Brand assets live at {userId}/{client}/brand/{path} in Supabase Storage
 * (client-level, not project-level). HTML designs reference them via
 * ../../brand/assets/photo.jpg which resolves to /api/s/{token}/brand/assets/photo.jpg.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const { token, path: pathParts } = await params;
  const resolved = await resolveToken(token);
  if (!resolved) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = pathParts.join('/');
  // Brand assets are stored at client level: {userId}/{client}/brand/{path}
  const storagePath = `${resolved.userId}/${resolved.client}/brand/${filePath}`;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
