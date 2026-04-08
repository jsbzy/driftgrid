import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const BUCKET = 'projects';

/**
 * POST /api/push
 * Pushes a local project to Supabase Storage.
 * Body: { client, project, userId }
 *
 * This runs on the LOCAL instance — reads files from disk, uploads to cloud.
 */
export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 400 });
  }

  const { client, project, userId } = await request.json();
  if (!client || !project || !userId) {
    return NextResponse.json({ error: 'Missing client, project, or userId' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const projectDir = path.join(PROJECTS_DIR, client, project);

  // Verify project exists locally
  try {
    await fs.stat(projectDir);
  } catch {
    return NextResponse.json({ error: 'Project not found locally' }, { status: 404 });
  }

  // Recursively collect all files in the project directory
  const files: { relativePath: string; fullPath: string }[] = [];

  async function walkDir(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walkDir(fullPath, relPath);
      } else {
        files.push({ relativePath: relPath, fullPath });
      }
    }
  }

  await walkDir(projectDir, '');

  // Upload each file to Supabase Storage
  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const storagePath = `${userId}/${client}/${project}/${file.relativePath}`;
    const data = await fs.readFile(file.fullPath);
    const contentType = file.relativePath.endsWith('.html') ? 'text/html'
      : file.relativePath.endsWith('.json') ? 'application/json'
      : file.relativePath.endsWith('.webp') ? 'image/webp'
      : file.relativePath.endsWith('.png') ? 'image/png'
      : file.relativePath.endsWith('.svg') ? 'image/svg+xml'
      : 'application/octet-stream';

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, {
      upsert: true,
      contentType,
    });

    if (error) {
      console.error(`Failed to upload ${storagePath}:`, error.message);
      failed++;
    } else {
      uploaded++;
    }
  }

  // Also upload brand assets if they exist
  const brandDir = path.join(PROJECTS_DIR, client, 'brand');
  try {
    await fs.stat(brandDir);
    const brandFiles: { relativePath: string; fullPath: string }[] = [];
    await walkDir(brandDir, '');
    for (const file of brandFiles) {
      const storagePath = `${userId}/${client}/brand/${file.relativePath}`;
      const data = await fs.readFile(file.fullPath);
      await supabase.storage.from(BUCKET).upload(storagePath, data, { upsert: true });
    }
  } catch {
    // No brand directory — that's fine
  }

  return NextResponse.json({
    success: true,
    uploaded,
    failed,
    total: files.length,
  });
}
