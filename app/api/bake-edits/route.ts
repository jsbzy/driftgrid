import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest } from '@/lib/manifest';
import { getStorage } from '@/lib/storage';

export async function POST(request: Request) {
  const { client, project, conceptId, versionId, edits } = await request.json();

  if (!client || !project || !conceptId || !versionId || !edits) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (typeof edits !== 'object' || Object.keys(edits).length === 0) {
    return NextResponse.json({ error: 'No edits to apply' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  const concept = manifest.concepts.find(c => c.id === conceptId);
  if (!concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }

  const version = concept.versions.find(v => v.id === versionId);
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  const storage = getStorage();
  const relativePath = path.join(client, project, version.file);

  if (!storage.validatePath(relativePath)) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  let html: string;
  try {
    html = await storage.readTextFile(relativePath);
  } catch {
    return NextResponse.json({ error: 'Failed to read HTML file' }, { status: 500 });
  }

  // Replace innerHTML for each data-drift-editable element
  let appliedCount = 0;
  for (const [field, value] of Object.entries(edits)) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(<([a-z][a-z0-9]*)\\b[^>]*\\bdata-drift-editable="${escaped}"[^>]*>)([\\s\\S]*?)(</\\2>)`,
      'i'
    );
    const newHtml = html.replace(pattern, (_match, open, _tag, _inner, close) => {
      appliedCount++;
      return open + value + close;
    });
    html = newHtml;
  }

  try {
    await storage.writeTextFile(relativePath, html);
  } catch {
    return NextResponse.json({ error: 'Failed to write HTML file' }, { status: 500 });
  }

  return NextResponse.json({ success: true, appliedCount });
}
