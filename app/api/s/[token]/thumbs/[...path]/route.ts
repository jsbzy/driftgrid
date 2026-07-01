import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolveShareToken } from '@/lib/share-token';

const BUCKET = 'projects';

/** GET /api/s/{token}/thumbs/{filename} — serve thumbnails for shared projects */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> }
) {
  const { token, path: pathParts } = await params;
  const resolved = await resolveShareToken(token);
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
