import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest, copyFile, getHtmlFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import { conceptSlug } from '@/lib/letters';
import { DRIFT_COPY_CHANGELOG } from '@/lib/constants';
import { areValidSlugs } from '@/lib/slug';
import { invalidateManifestCache } from '@/lib/manifest-cache';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function isCopyableLocalAsset(ref: string): boolean {
  const trimmed = ref.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('../') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return false;
  }
  return true;
}

function normalizeAssetRef(ref: string): string | null {
  const cleanRef = ref.trim().replace(/^['"]|['"]$/g, '');
  if (!isCopyableLocalAsset(cleanRef)) return null;
  try {
    const parsed = new URL(cleanRef, 'http://driftgrid.local/');
    if (parsed.origin !== 'http://driftgrid.local') return null;
    const relativePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return isCopyableLocalAsset(relativePath) ? relativePath : null;
  } catch {
    const withoutHash = cleanRef.split('#')[0];
    const withoutQuery = withoutHash.split('?')[0];
    return isCopyableLocalAsset(withoutQuery) ? withoutQuery : null;
  }
}

function extractLocalAssetRefs(html: string): string[] {
  const refs = new Set<string>();
  const attrPattern = /\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi;
  const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  const srcsetPattern = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;

  for (const pattern of [attrPattern, urlPattern]) {
    for (const match of html.matchAll(pattern)) {
      const ref = normalizeAssetRef(match[2]);
      if (ref) refs.add(ref);
    }
  }

  for (const match of html.matchAll(srcsetPattern)) {
    for (const candidate of match[2].split(',')) {
      const ref = normalizeAssetRef(candidate.trim().split(/\s+/)[0] || '');
      if (ref) refs.add(ref);
    }
  }

  return [...refs];
}

async function copyReferencedAssets(
  userId: string | null,
  client: string,
  project: string,
  sourceFile: string,
  destFile: string,
) {
  const html = await getHtmlFile(userId, client, project, sourceFile);
  if (!html) return;

  const sourceDir = path.posix.dirname(sourceFile);
  const destDir = path.posix.dirname(destFile);

  await Promise.all(extractLocalAssetRefs(html).map(async assetRef => {
    const sourceAsset = path.posix.normalize(path.posix.join(sourceDir, assetRef));
    const destAsset = path.posix.normalize(path.posix.join(destDir, assetRef));
    if (sourceAsset.startsWith('..') || destAsset.startsWith('..')) return;
    await copyFile(userId, client, project, sourceAsset, destAsset);
  }));
}

export async function POST(request: Request) {
  const { client, project, conceptId, versionId, label } = await request.json();

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  const sourceConcept = manifest.concepts.find(c => c.id === conceptId);
  if (!sourceConcept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }

  const sourceVersion = sourceConcept.versions.find(v => v.id === versionId);
  if (!sourceVersion) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Determine next concept folder number from manifest (works for both local and cloud)
  let maxN = 0;
  for (const round of manifest.rounds) {
    for (const c of round.concepts) {
      for (const v of c.versions) {
        const match = v.file.match(/concept-(\d+)\//);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxN) maxN = n;
        }
      }
    }
  }
  const nextN = maxN + 1;
  const newFolder = `concept-${nextN}`;

  // Branch = working copy in a new column. Duplicate the source version's HTML as v1
  // of the new concept so the agent iterates on a real starting point, not a blank slate.
  const newFile = `${newFolder}/v1.html`;
  const newLabel = label || `Concept ${nextN}`;

  await copyFile(userId, client, project, sourceVersion.file, newFile);
  await copyReferencedAssets(userId, client, project, sourceVersion.file, newFile);

  // Create new concept and version IDs
  const newConceptId = `concept-${generateId()}`;
  const newVersionId = `version-${generateId()}`;

  const newConcept = {
    id: newConceptId,
    slug: conceptSlug(newLabel),
    label: newLabel,
    description: DRIFT_COPY_CHANGELOG,
    position: 0,
    visible: true,
    branchedFrom: {
      conceptId: sourceConcept.id,
      versionId: sourceVersion.id,
    },
    versions: [{
      id: newVersionId,
      number: 1,
      file: newFile,
      parentId: null,
      changelog: DRIFT_COPY_CHANGELOG,
      visible: true,
      starred: false,
      created: new Date().toISOString(),
      thumbnail: '',
    }],
  };

  // Insert immediately after the source concept
  const sourceIndex = manifest.concepts.findIndex(c => c.id === sourceConcept.id);
  const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : manifest.concepts.length;
  manifest.concepts.splice(insertAt, 0, newConcept);
  manifest.concepts.forEach((c, i) => { c.position = i + 1; });

  await writeManifest(userId, client, project, manifest);
  invalidateManifestCache(client, project);

  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  const absolutePath = path.resolve(path.join(PROJECTS_DIR, client, project, newFile));

  return NextResponse.json({
    conceptId: newConceptId,
    versionId: newVersionId,
    absolutePath,
  });
}
