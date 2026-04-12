import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

const BUCKET = 'projects';

/**
 * POST /api/cloud/push — receive files from a local DriftGrid instance and write to Supabase Storage.
 *
 * Auth: JWT in Authorization header (not cookie-based).
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

  // Validate JWT from Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const userId = user.id;

  const body = await request.json();
  const { client, project, files } = body;

  if (!client || !project || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'Missing client, project, or files' }, { status: 400 });
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

    const storagePath = `${userId}/${client}/${project}/${filePath}`;

    // Determine if content is base64-encoded (binary) or plain text
    const isText = ['text/html', 'application/json', 'image/svg+xml', 'text/markdown', 'text/css', 'text/plain']
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
