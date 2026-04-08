import { NextRequest, NextResponse } from 'next/server';
import { getManifest as getManifestLocal, writeManifest as writeManifestLocal } from '@/lib/manifest';
import { getManifest, writeManifest, isCloudMode } from '@/lib/storage';
import { getUserId } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string }> }
) {
  const { client, project } = await params;

  if (isCloudMode()) {
    const userId = await getUserId();
    const manifest = await getManifest(userId, client, project);
    if (!manifest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(manifest);
  }

  // Local mode
  const manifest = await getManifestLocal(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(manifest);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string }> }
) {
  if (process.env.VERCEL && !isCloudMode()) {
    return NextResponse.json({ error: 'Read-only in production' }, { status: 403 });
  }
  const { client, project } = await params;
  const manifest = await request.json();

  if (isCloudMode()) {
    const userId = await getUserId();
    await writeManifest(userId, client, project, manifest);
  } else {
    await writeManifestLocal(client, project, manifest);
  }

  return NextResponse.json({ ok: true });
}
