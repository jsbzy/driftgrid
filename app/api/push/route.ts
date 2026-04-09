import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const BUCKET = 'projects';

/**
 * POST /api/push
 * Pushes a local project to Supabase Storage.
 * Body: { client, project }
 *
 * Runs on the LOCAL instance — reads files from disk, uploads to cloud.
 * Requires SUPABASE env vars but NOT DRIFT_CLOUD mode.
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local' }, { status: 400 });
  }

  const { client, project } = await request.json();
  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Use a stable userId for storage paths
  const userId = process.env.DRIFT_CLOUD_USER_ID || 'jeff';

  const projectDir = path.join(PROJECTS_DIR, client, project);

  // Verify project exists locally
  try {
    await fs.stat(projectDir);
  } catch {
    return NextResponse.json({ error: 'Project not found locally' }, { status: 404 });
  }

  // Recursively collect all files
  async function walkDir(dir: string, prefix: string): Promise<{ relativePath: string; fullPath: string }[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: { relativePath: string; fullPath: string }[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push(...await walkDir(fullPath, relPath));
      } else {
        files.push({ relativePath: relPath, fullPath });
      }
    }
    return files;
  }

  const files = await walkDir(projectDir, '');

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const storagePath = `${userId}/${client}/${project}/${file.relativePath}`;
    const data = await fs.readFile(file.fullPath);
    const ct = file.relativePath.endsWith('.html') ? 'text/html'
      : file.relativePath.endsWith('.json') ? 'application/json'
      : file.relativePath.endsWith('.webp') ? 'image/webp'
      : file.relativePath.endsWith('.svg') ? 'image/svg+xml'
      : file.relativePath.endsWith('.png') ? 'image/png'
      : 'application/octet-stream';

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, {
      upsert: true,
      contentType: ct,
    });

    if (error) {
      console.error(`Push failed: ${storagePath} — ${error.message}`);
      failed++;
    } else {
      uploaded++;
    }
  }

  return NextResponse.json({
    success: true,
    uploaded,
    failed,
    total: files.length,
    shareUrl: `/s/${Buffer.from(`${userId}/${client}/${project}`).toString('base64url')}`,
  });
}
