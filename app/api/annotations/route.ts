import { NextResponse } from 'next/server';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import type { Annotation } from '@/lib/types';
import { getStorage } from '@/lib/storage';

function generateId(): string {
  return 'a-' + Math.random().toString(36).substring(2, 10);
}

/**
 * GET /api/annotations?client=x&project=y&conceptId=z&versionId=w
 * Returns annotations for a specific version
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get('client');
  const project = url.searchParams.get('project');
  const conceptId = url.searchParams.get('conceptId');
  const versionId = url.searchParams.get('versionId');

  if (!client || !project || !conceptId || !versionId) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const concept = manifest.concepts?.find(c => c.id === conceptId);
  const version = concept?.versions.find(v => v.id === versionId);
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  return NextResponse.json(version.annotations ?? []);
}

/**
 * POST /api/annotations
 * Create a new annotation
 */
export async function POST(request: Request) {
  const { client, project, conceptId, versionId, x, y, element, text, author, isClient, isAgent, parentId } = await request.json();

  if (!client || !project || !conceptId || !versionId || !text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const concept = manifest.concepts?.find(c => c.id === conceptId);
  const version = concept?.versions.find(v => v.id === versionId);
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  const annotation: Annotation = {
    id: generateId(),
    x: x ?? null,
    y: y ?? null,
    element: element ?? null,
    text,
    author: author ?? 'designer',
    isClient: isClient ?? false,
    isAgent: isAgent ?? false,
    created: new Date().toISOString(),
    resolved: false,
    parentId: parentId ?? null,
  };

  if (!version.annotations) version.annotations = [];
  version.annotations.push(annotation);

  await writeManifest(client, project, manifest);

  // Write sidecar .feedback.md
  await writeFeedbackSidecar(client, project, concept!.label, version);

  return NextResponse.json(annotation);
}

/**
 * DELETE /api/annotations
 * Remove an annotation
 */
export async function DELETE(request: Request) {
  const { client, project, conceptId, versionId, annotationId } = await request.json();

  if (!client || !project || !conceptId || !versionId || !annotationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const concept = manifest.concepts?.find(c => c.id === conceptId);
  const version = concept?.versions.find(v => v.id === versionId);
  if (!version?.annotations) return NextResponse.json({ error: 'No annotations' }, { status: 404 });

  version.annotations = version.annotations.filter(a => a.id !== annotationId);
  await writeManifest(client, project, manifest);
  await writeFeedbackSidecar(client, project, concept!.label, version);

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/annotations
 * Resolve/unresolve an annotation
 */
export async function PATCH(request: Request) {
  const { client, project, conceptId, versionId, annotationId, resolved } = await request.json();

  if (!client || !project || !conceptId || !versionId || !annotationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const concept = manifest.concepts?.find(c => c.id === conceptId);
  const version = concept?.versions.find(v => v.id === versionId);
  const annotation = version?.annotations?.find(a => a.id === annotationId);
  if (!annotation) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });

  annotation.resolved = resolved ?? !annotation.resolved;
  await writeManifest(client, project, manifest);
  await writeFeedbackSidecar(client, project, concept!.label, version!);

  return NextResponse.json(annotation);
}

/**
 * Write a .feedback.md sidecar file next to the HTML version
 */
async function writeFeedbackSidecar(
  client: string,
  project: string,
  conceptLabel: string,
  version: { file: string; number: number; annotations?: Annotation[] },
) {
  const annotations = version.annotations ?? [];
  if (annotations.length === 0) return;

  const lines = [`# Feedback — ${conceptLabel} / v${version.number}`, ''];
  annotations.forEach((a, i) => {
    const location = a.element ? `Near "${a.element}"` : 'General';
    const resolved = a.resolved ? ' ~~(resolved)~~' : '';
    const who = a.isClient ? ` [client: ${a.author}]` : '';
    lines.push(`${i + 1}. **${location}**${who} — ${a.text}${resolved}`);
  });
  lines.push('', '---');
  lines.push(`File: ~/driftgrid/projects/${client}/${project}/${version.file}`);

  const feedbackPath = version.file.replace(/\.html$/, '.feedback.md');
  const storage = getStorage();
  await storage.writeTextFile(path.join(client, project, feedbackPath), lines.join('\n'));
}
