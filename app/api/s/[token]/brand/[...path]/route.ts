import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolveShareToken } from '@/lib/share-token';

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
  const resolved = await resolveShareToken(token);
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
