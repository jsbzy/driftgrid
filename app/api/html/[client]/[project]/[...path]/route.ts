import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getHtmlFile } from '@/lib/manifest';
import { getEditScript } from '@/lib/editScript';
import { getStorage } from '@/lib/storage';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string; path: string[] }> }
) {
  const { client, project, path: pathParts } = await params;
  const filePath = pathParts.join('/');
  const storage = getStorage();
  const html = await request.text();
  await storage.writeTextFile(path.join(client, project, filePath), html);
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
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string; path: string[] }> }
) {
  const { client, project, path: pathParts } = await params;
  const filePath = pathParts.join('/');
  const ext = path.extname(filePath).toLowerCase();

  // Non-HTML assets: serve directly from project directory
  if (ext && ext !== '.html') {
    const mime = MIME_TYPES[ext];
    if (!mime) {
      return new NextResponse('Unsupported file type', { status: 415 });
    }
    const storage = getStorage();
    const relativePath = path.join(client, project, filePath);
    if (!storage.validatePath(relativePath)) {
      return new NextResponse('Not found', { status: 404 });
    }
    try {
      const data = await storage.readFile(relativePath);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return new NextResponse('Not found', { status: 404 });
    }
  }

  // HTML files
  let html = await getHtmlFile(client, project, filePath);
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
