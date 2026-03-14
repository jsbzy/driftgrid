import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  // Expected: [client, project, filename.png]
  if (pathParts.length < 3) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(
    PROJECTS_DIR,
    pathParts[0],
    pathParts[1],
    '.thumbs',
    pathParts.slice(2).join('/')
  );

  // Security: ensure path doesn't escape projects dir
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(resolved);
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
