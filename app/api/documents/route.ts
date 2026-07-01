import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth';
import { getManifest, writeHtmlFile, writeManifest } from '@/lib/storage';
import { areValidSlugs } from '@/lib/slug';
import type { ProjectDocument } from '@/lib/types';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document';
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client');
  const project = searchParams.get('project');
  const roundId = searchParams.get('roundId');

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }
  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const documents = manifest.documents ?? [];
  return NextResponse.json(roundId
    ? documents.filter(doc => doc.roundIds?.includes(roundId))
    : documents);
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    client,
    project,
    title,
    content,
    kind = 'other',
    roundId,
    documentId,
    source,
    summary = false,
  } = body as {
    client?: string;
    project?: string;
    title?: string;
    content?: string;
    kind?: ProjectDocument['kind'];
    roundId?: string;
    documentId?: string;
    source?: string;
    summary?: boolean;
  };

  if (!client || !project || !title || typeof content !== 'string') {
    return NextResponse.json({ error: 'Missing client, project, title, or content' }, { status: 400 });
  }
  if (!areValidSlugs(client, project)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  manifest.documents ??= [];

  const linkedRound = roundId ? manifest.rounds.find(r => r.id === roundId) : null;
  if (roundId && !linkedRound) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }

  const id = documentId || `doc-${slugify(title)}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = manifest.documents.find(doc => doc.id === id);
  const path = existing?.path || `documents/${slugify(title)}.md`;
  const createdAt = existing?.createdAt || new Date().toISOString();
  const roundIds = unique([
    ...(existing?.roundIds ?? []),
    ...(roundId ? [roundId] : []),
  ]);

  await writeHtmlFile(userId, client, project, path, content);

  const nextDoc: ProjectDocument = {
    id,
    title,
    path,
    kind,
    createdAt,
    ...(roundIds.length ? { roundIds } : {}),
    ...(source ? { source } : existing?.source ? { source: existing.source } : {}),
  };

  if (existing) {
    Object.assign(existing, nextDoc);
  } else {
    manifest.documents.push(nextDoc);
  }

  if (roundId) {
    const round = linkedRound!;
    round.documentIds = unique([...(round.documentIds ?? []), id]);
    if (summary || kind === 'round-summary') {
      round.summaryDocumentId = id;
    }
  }

  await writeManifest(userId, client, project, manifest);

  return NextResponse.json(nextDoc);
}
