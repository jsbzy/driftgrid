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
};

/** GET /api/s/{token}/html/{...path} — serve HTML/assets for a shared project */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const { token, path: pathParts } = await params;
  const supabase = getSupabaseAdmin();

  // Resolve share token
  const { data: link, error: linkErr } = await supabase
    .from('share_links')
    .select('user_id, client, project, expires_at, is_active')
    .eq('token', token)
    .single();

  if (linkErr || !link || !link.is_active) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new NextResponse('Expired', { status: 410 });
  }

  const filePath = pathParts.join('/');
  const storagePath = `${link.user_id}/${link.client}/${link.project}/${filePath}`;

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
