import { NextRequest, NextResponse } from 'next/server';
import { getHtmlFile } from '@/lib/manifest';
import { getEditScript } from '@/lib/editScript';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string; path: string[] }> }
) {
  const { client, project, path: pathParts } = await params;
  const filePath = pathParts.join('/');
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
