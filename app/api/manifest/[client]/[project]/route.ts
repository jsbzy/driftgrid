import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getManifest as getManifestLocal } from '@/lib/manifest';
import { getManifest, writeManifest, isCloudMode, ManifestValidationError } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { areValidSlugs } from '@/lib/slug';
import type { Manifest } from '@/lib/types';

/**
 * Stable hash of a manifest's content for optimistic-concurrency (ETag/If-Match).
 * Strips the `concepts` alias before hashing — it's reconstructed on every read
 * and would make the hash change spuriously even when nothing was mutated.
 */
function manifestEtag(manifest: Manifest): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { concepts: _alias, ...rest } = manifest;
  const json = JSON.stringify(rest);
  const hash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  return `"${hash}"`; // quoted per ETag spec
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string }> }
) {
  const { client, project } = await params;
  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  let manifest: Manifest | null;
  if (isCloudMode()) {
    const userId = await getUserId();
    manifest = await getManifest(userId, client, project);
  } else {
    manifest = await getManifestLocal(client, project);
  }

  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ETag enables optimistic concurrency on PUT. Clients echo this back via
  // `If-Match`; the server rejects with 412 if the on-disk manifest has
  // changed since the client last read it.
  return NextResponse.json(manifest, {
    headers: { ETag: manifestEtag(manifest) },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ client: string; project: string }> }
) {
  if (process.env.VERCEL && !isCloudMode()) {
    return NextResponse.json({ error: 'Read-only in production' }, { status: 403 });
  }
  const { client, project } = await params;
  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }
  const manifest = await request.json();
  const userId = isCloudMode() ? await getUserId() : null;

  // Optional optimistic-concurrency: when the client sends `If-Match`, the
  // server compares it against the current on-disk manifest's ETag. Mismatch
  // means the manifest changed between the client's read and write — return
  // 412 so the client can refetch + retry. Clients without `If-Match` are
  // accepted (back-compat) so older callers keep working.
  const ifMatch = request.headers.get('if-match');
  if (ifMatch) {
    const current = isCloudMode()
      ? await getManifest(userId, client, project)
      : await getManifestLocal(client, project);
    if (current) {
      const currentEtag = manifestEtag(current);
      if (currentEtag !== ifMatch) {
        return NextResponse.json(
          { error: 'Manifest changed since you read it', currentEtag },
          { status: 412, headers: { ETag: currentEtag } },
        );
      }
    }
  }

  // Route through lib/storage.writeManifest in both modes — it owns the
  // in-process write serializer + cache invalidation, and lib/manifest does
  // the atomic temp+rename + backup rotation locally. Bypassing this chokepoint
  // re-introduces the lost-update races we just fixed.
  try {
    await writeManifest(userId, client, project, manifest);
  } catch (err) {
    if (err instanceof ManifestValidationError) {
      // 422: structurally invalid payload. The bad manifest has already been
      // saved to manifest.json.rejected-<ts>.json (local mode) for inspection;
      // the live manifest on disk is unchanged.
      return NextResponse.json({ error: 'Invalid manifest payload', details: err.errors }, { status: 422 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, {
    headers: { ETag: manifestEtag(manifest) },
  });
}
