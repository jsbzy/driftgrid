import { NextRequest, NextResponse } from 'next/server';
import { getManifest, writeManifest } from '@/lib/manifest';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string }> }
) {
  const { client, project } = await params;
  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(manifest);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string }> }
) {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: 'Read-only in production' }, { status: 403 });
  }
  const { client, project } = await params;
  const manifest = await request.json();
  await writeManifest(client, project, manifest);
  return NextResponse.json({ ok: true });
}
