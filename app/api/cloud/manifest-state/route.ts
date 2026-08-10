import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { resolveCloudUser } from '@/lib/cloud-auth-server';
import { areValidSlugs } from '@/lib/slug';

const BUCKET = 'projects';

/**
 * GET /api/cloud/manifest-state?client=…&project=… — sync-guard probe.
 *
 * Returns the sha256 of the manifest.json currently in cloud storage for the
 * authenticated user's (client, project), so a pushing client can detect that
 * the cloud copy changed since its last push and refuse to clobber it (see
 * lib/sync-guard.ts).
 *
 * Auth: Bearer JWT or PAT (resolveCloudUser). Scoped to the caller's own
 * storage prefix — you can only probe your own projects.
 *
 * Response: { exists: boolean, hash: string | null }
 */
export async function GET(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const resolved = await resolveCloudUser(request.headers.get('authorization'));
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid or expired credential' }, { status: 401 });
  }

  const url = new URL(request.url);
  const client = url.searchParams.get('client') ?? '';
  const project = url.searchParams.get('project') ?? '';
  if (!client || !project || !areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Missing or invalid client/project' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const path = `${resolved.userId}/${client}/${project}/manifest.json`;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error || !data) {
    return NextResponse.json({ exists: false, hash: null });
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  return NextResponse.json({ exists: true, hash });
}
