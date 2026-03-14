import { NextRequest, NextResponse } from 'next/server';
import { getHtmlFile } from '@/lib/manifest';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string; path: string[] }> }
) {
  const { client, project, path: pathParts } = await params;
  const filePath = pathParts.join('/');
  const html = await getHtmlFile(client, project, filePath);
  if (!html) {
    return new NextResponse('Not found', { status: 404 });
  }
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
