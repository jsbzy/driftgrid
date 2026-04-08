import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { getHtmlFile as getHtmlFileLocal } from '@/lib/manifest';
import { getHtmlFile, getAsset, isCloudMode } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { getEditScript } from '@/lib/editScript';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string; path: string[] }> }
) {
  const { client, project, path: pathParts } = await params;
  const filePath = pathParts.join('/');
  const fullPath = path.join(process.cwd(), 'projects', client, project, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const html = await request.text();
  await fs.writeFile(fullPath, html, 'utf-8');
  return new NextResponse('OK', { status: 200 });
}

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
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string; path: string[] }> }
) {
  const { client, project, path: pathParts } = await params;
  const filePath = pathParts.join('/');
  const ext = path.extname(filePath).toLowerCase();

  const userId = isCloudMode() ? await getUserId() : null;

  // Non-HTML assets
  if (ext && ext !== '.html') {
    const mime = MIME_TYPES[ext];
    if (!mime) {
      return new NextResponse('Unsupported file type', { status: 415 });
    }

    const data = await getAsset(userId, client, project, filePath);
    if (!data) {
      return new NextResponse('Not found', { status: 404 });
    }

    const isAudio = ext === '.mp3' || ext === '.wav' || ext === '.ogg';
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': isAudio ? 'no-cache' : 'public, max-age=31536000, immutable',
      },
    });
  }

  // HTML files
  let html: string | null;
  if (isCloudMode()) {
    html = await getHtmlFile(userId, client, project, filePath);
  } else {
    html = await getHtmlFileLocal(client, project, filePath);
  }

  if (!html) {
    return new NextResponse('Not found', { status: 404 });
  }

  const mode = request.nextUrl.searchParams.get('mode');
  if (mode === 'edit') {
    html = html.replace('</body>', `${getEditScript()}\n</body>`);
  }

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
