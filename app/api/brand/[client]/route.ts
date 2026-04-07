import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getStorage } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ client: string }> }
) {
  const { client } = await params;
  const storage = getStorage();
  const brandDir = path.join(client, 'brand');

  // Read guidelines
  let guidelines = '';
  try {
    guidelines = await storage.readTextFile(path.join(brandDir, 'guidelines.md'));
  } catch {
    // no guidelines
  }

  // Check for logo
  const hasLogo = await storage.exists(path.join(brandDir, 'logo.svg'));

  // List assets
  let assets: string[] = [];
  try {
    assets = await storage.listDir(path.join(brandDir, 'assets'));
  } catch {
    // no assets dir
  }

  return NextResponse.json({ guidelines, hasLogo, assets });
}
