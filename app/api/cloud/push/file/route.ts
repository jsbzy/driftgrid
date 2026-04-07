import { NextRequest, NextResponse } from 'next/server';
import { getCloudStorage } from '@/lib/storage';

/**
 * PUT /api/cloud/push/file
 * Upload a single file to cloud storage.
 * Called by `driftgrid push` for each file in a project.
 *
 * Headers:
 *   Authorization: Bearer <api_key>
 *   X-File-Path: <relative path within projects/>
 *   Content-Type: application/octet-stream
 */
export async function PUT(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  const filePath = request.headers.get('X-File-Path');
  if (!filePath) {
    return NextResponse.json({ error: 'Missing X-File-Path header' }, { status: 400 });
  }

  // TODO: Validate API key and extract workspace ID
  // For now, extract workspace from a header (will be replaced with proper key validation)
  const workspaceId = request.headers.get('X-Workspace-Id');
  if (!workspaceId) {
    // Try to resolve from API key via database lookup
    // For now, return error
    return NextResponse.json({ error: 'Missing workspace context' }, { status: 400 });
  }

  const storage = getCloudStorage(workspaceId);
  const body = await request.arrayBuffer();
  const data = Buffer.from(body);

  try {
    // Determine if text or binary based on extension
    const isText = /\.(html|json|md|css|js|svg|txt|feedback\.md)$/i.test(filePath);

    if (isText) {
      await storage.writeTextFile(filePath, data.toString('utf-8'));
    } else {
      await storage.writeFile(filePath, data);
    }

    return NextResponse.json({ ok: true, size: data.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Upload failed: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 },
    );
  }
}
