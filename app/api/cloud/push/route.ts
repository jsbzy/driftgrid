import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { resolveCloudUser } from '@/lib/cloud-auth-server';

const BUCKET = 'projects';

/**
 * POST /api/cloud/push — receive files from a local DriftGrid instance and write to Supabase Storage.
 *
 * Auth: Bearer credential in Authorization header (not cookie-based) — either a
 * Supabase JWT or a DriftGrid personal access token (`dg_pat_…`), which is what
 * lets headless / CLI clients push without a browser session.
 * Body: { client, project, files: [{ path, content, contentType }] }
 *
 * Files with binary content (images) should be base64-encoded with contentType set.
 * Text files (html, json, svg, md) are sent as plain strings.
 *
 * This endpoint only runs on the cloud deployment (driftgrid.ai).
 */
export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const resolved = await resolveCloudUser(request.headers.get('authorization'));
  if (!resolved) {
    return NextResponse.json({ error: 'Invalid or expired credential' }, { status: 401 });
  }

  const userId = resolved.userId;
  const supabase = getSupabaseAdmin();

  const body = await request.json();
  const { client, project, files, scope } = body;

  if (!client || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'Missing client or files' }, { status: 400 });
  }

  // scope: 'project' (default) stores at {userId}/{client}/{project}/{path}
  // scope: 'client' stores at {userId}/{client}/{path} (for brand assets)
  const fileScope = scope || 'project';
  if (fileScope === 'project' && !project) {
    return NextResponse.json({ error: 'Missing project for project-scoped files' }, { status: 400 });
  }

  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const file of files) {
    const { path: filePath, content, contentType } = file;
    if (!filePath || content === undefined) {
      failed++;
      continue;
    }

    const storagePath = fileScope === 'client'
      ? `${userId}/${client}/${filePath}`
      : `${userId}/${client}/${project}/${filePath}`;

    // Determine if content is base64-encoded (binary) or plain text. Must mirror
    // the TEXT_TYPES set in app/api/cloud/push-and-share/route.ts; if the client
    // sends a JS/CSS/etc file as utf-8 and the server treats it as binary, the
    // base64-decode produces garbage and the served file is unusable.
    const isText = ['text/html', 'application/json', 'image/svg+xml', 'text/markdown', 'text/css', 'text/plain', 'application/javascript']
      .includes(contentType || '');

    let data: Buffer | string;
    if (isText) {
      data = content;
    } else {
      // Binary content arrives as base64
      data = Buffer.from(content, 'base64');
    }

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, {
      upsert: true,
      contentType: contentType || 'application/octet-stream',
    });

    if (error) {
      failed++;
      errors.push(`${filePath}: ${error.message}`);
    } else {
      uploaded++;
    }
  }

  return NextResponse.json({ success: failed === 0, uploaded, failed, total: files.length, errors: errors.length > 0 ? errors : undefined });
}
