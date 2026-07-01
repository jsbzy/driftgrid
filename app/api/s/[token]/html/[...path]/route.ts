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
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.json': 'application/json',
};

// Extensions we redirect to a Supabase signed URL instead of buffering through
// this route. Supabase Storage natively supports HTTP Range requests on its
// public/signed URLs — the browser can progressively stream the file instead
// of waiting for the full download. Critical for audio/video, where the
// download-then-serve model meant slides with VO appeared silent for ~minute.
const STREAMABLE_EXTS = new Set(['.mp3', '.mp4', '.wav', '.ogg', '.webm', '.m4a', '.aac']);
// 1 hour: long enough that the audio element won't re-request mid-playback and
// short enough that the signed URL can't be cached/scraped indefinitely.
const SIGNED_URL_TTL_SECONDS = 3600;

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
  const storagePath = `${resolved.userId}/${resolved.client}/${resolved.project}/${filePath}`;
  const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
  const supabase = getSupabaseAdmin();

  // Audio/video: 302 to a signed Supabase URL. Supabase Storage supports
  // Range requests on signed URLs, so the browser streams progressively. Going
  // through this route instead would download the full file before responding —
  // which is why slides with voiceover used to appear silent for ~a minute.
  if (STREAMABLE_EXTS.has(ext)) {
    const { data: signed, error: signErr } = await supabase
      .storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      return new NextResponse('Not found', { status: 404 });
    }
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    return new NextResponse('Not found', { status: 404 });
  }

  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const raw = Buffer.from(await data.arrayBuffer());

  // For HTML files, rewrite admin asset paths to share-safe paths so
  // audio/image/JS references like `/api/html/{client}/{project}/...`
  // route through the share endpoint instead of the auth-gated admin one.
  const body = ext === '.html'
    ? raw.toString('utf-8').replace(
        new RegExp(`/api/html/${resolved.client}/${resolved.project}/`, 'g'),
        `/api/s/${token}/html/`,
      )
    : raw;

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
