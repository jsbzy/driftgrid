import { NextResponse } from 'next/server';
import { getManifest, getHtmlFile, writeHtmlFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';

export async function POST(request: Request) {
  const { client, project, conceptId, versionId, edits } = await request.json();

  if (!client || !project || !conceptId || !versionId || !edits) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (typeof edits !== 'object' || Object.keys(edits).length === 0) {
    return NextResponse.json({ error: 'No edits to apply' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
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

  const rawHtml = await getHtmlFile(userId, client, project, version.file);
  if (!rawHtml) {
    return NextResponse.json({ error: 'Failed to read HTML file' }, { status: 500 });
  }
  let html: string = rawHtml;

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

  await writeHtmlFile(userId, client, project, version.file, html);

  return NextResponse.json({ success: true, appliedCount });
}
