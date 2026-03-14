import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ client: string }> }
) {
  const { client } = await params;
  const brandDir = path.join(PROJECTS_DIR, client, 'brand');

  // Read guidelines
  let guidelines = '';
  try {
    guidelines = await fs.readFile(path.join(brandDir, 'guidelines.md'), 'utf-8');
  } catch {
    // no guidelines
  }

  // Check for logo
  let hasLogo = false;
  try {
    await fs.access(path.join(brandDir, 'logo.svg'));
    hasLogo = true;
  } catch {
    // no logo
  }

  // List assets
  let assets: string[] = [];
  try {
    const assetsDir = path.join(brandDir, 'assets');
    assets = await fs.readdir(assetsDir);
  } catch {
    // no assets dir
  }

  return NextResponse.json({ guidelines, hasLogo, assets });
}
