import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest, copyFile, writeHtmlFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { areValidSlugs } from '@/lib/slug';
import { findConcept } from '@/lib/manifest-lookup';

// Raw pastes are full HTML documents from a chat agent; anything bigger than
// this is almost certainly not a design file.
const MAX_RAW_HTML_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const { client, project, sourceFile, sourceLabel, sourceNumber, targetConceptId, targetRoundId, html, changelog: rawChangelog } = await request.json();

  // Two paste modes: duplicate an existing version's file (sourceFile — the
  // grid's Cmd+V), or write raw HTML content (html — pasted from a chat agent
  // like Claude or Codex; also the web MCP's add_version primitive).
  if (!client || !project || !targetConceptId || (!sourceFile && !html)) {
    return NextResponse.json({ error: 'Missing required fields (need sourceFile or html)' }, { status: 400 });
  }
  if (html !== undefined) {
    if (typeof html !== 'string' || !html.trim()) {
      return NextResponse.json({ error: 'html must be a non-empty string' }, { status: 400 });
    }
    if (Buffer.byteLength(html, 'utf-8') > MAX_RAW_HTML_BYTES) {
      return NextResponse.json({ error: 'html too large (max 2MB)' }, { status: 413 });
    }
  }

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  // Find the target concept. `manifest.concepts` is only the latest-round alias,
  // so pasting into a non-latest round's concept 404s through it (rounds-alias
  // footgun). Prefer the explicit targetRoundId; otherwise search all rounds.
  let targetConcept;
  if (targetRoundId) {
    const round = manifest.rounds.find(r => r.id === targetRoundId);
    targetConcept = round?.concepts.find(c => c.id === targetConceptId);
  }
  if (!targetConcept) {
    ({ concept: targetConcept } = findConcept(manifest, targetConceptId));
  }
  if (!targetConcept) {
    return NextResponse.json({ error: 'Target concept not found' }, { status: 404 });
  }

  // Determine next version number in target concept
  const maxNumber = targetConcept.versions.length > 0
    ? Math.max(...targetConcept.versions.map(v => v.number))
    : 0;
  const nextNumber = maxNumber + 1;
  const nextId = `${targetConceptId}--v${nextNumber}`;

  // Determine file path in target concept's folder
  const conceptFolder = targetConcept.versions[0]?.file
    ? path.dirname(targetConcept.versions[0].file)
    : targetConceptId;
  const newFile = `${conceptFolder}/v${nextNumber}.html`;

  // Write the HTML: raw content when provided, otherwise copy the source file.
  let changelog: string;
  if (html) {
    await writeHtmlFile(userId, client, project, newFile, html);
    changelog = typeof rawChangelog === 'string' && rawChangelog.trim()
      ? rawChangelog.trim().slice(0, 300)
      : 'Pasted HTML';
  } else {
    await copyFile(userId, client, project, sourceFile, newFile);
    const fromLabel = sourceLabel ? `${sourceLabel} v${sourceNumber || '?'}` : 'clipboard';
    changelog = `Pasted from ${fromLabel}`;
  }

  const newVersion = {
    id: nextId,
    number: nextNumber,
    file: newFile,
    parentId: null,
    changelog,
    visible: true,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  };

  targetConcept.versions.push(newVersion);
  await writeManifest(userId, client, project, manifest);

  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  const absolutePath = path.resolve(path.join(PROJECTS_DIR, client, project, newFile));
  return NextResponse.json({
    versionId: newVersion.id,
    versionNumber: nextNumber,
    file: newFile,
    absolutePath,
    conceptLabel: targetConcept.label,
  });
}
