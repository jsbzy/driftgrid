import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  const cwd = process.cwd();
  const projectsDir = path.join(cwd, 'projects');
  let files: string[] = [];
  let error = '';
  
  try {
    const exists = await fs.access(projectsDir).then(() => true).catch(() => false);
    if (exists) {
      const items = await fs.readdir(projectsDir, { recursive: true });
      files = items.map(f => String(f)).slice(0, 50);
    } else {
      error = `projects dir not found at ${projectsDir}`;
      // Check what IS in cwd
      const cwdItems = await fs.readdir(cwd);
      files = cwdItems;
    }
  } catch (e: any) {
    error = e.message;
  }
  
  return NextResponse.json({ cwd, projectsDir, files, error });
}
