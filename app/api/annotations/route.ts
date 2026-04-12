import { NextResponse } from 'next/server';
import { getManifest, writeManifest, writeHtmlFile } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import type { Annotation, Manifest } from '@/lib/types';
import {
  driftPromptBoilerplate,
  awaitingAgentBoilerplate,
  inProgressBoilerplate,
} from '@/lib/canvas-boilerplate';

const EMPTY_DRIFT_CHANGELOG = 'New drift slot — empty';

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

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
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

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
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

  await writeManifest(userId, client, project, manifest);
  await writeFeedbackSidecar(userId, client, project, concept!.label, version);
  // Re-render the drift template if this annotation changed the slot's visible state
  await maybeRewriteDriftTemplate(userId, client, project, manifest, concept!, version);

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

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const concept = manifest.concepts?.find(c => c.id === conceptId);
  const version = concept?.versions.find(v => v.id === versionId);
  if (!version?.annotations) return NextResponse.json({ error: 'No annotations' }, { status: 404 });

  version.annotations = version.annotations.filter(a => a.id !== annotationId);
  await writeManifest(userId, client, project, manifest);
  await writeFeedbackSidecar(userId, client, project, concept!.label, version);
  await maybeRewriteDriftTemplate(userId, client, project, manifest, concept!, version);

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/annotations
 * Update an annotation. Accepts optional `text`, `resolved`, and `status` ('running' | null).
 * If none of these are supplied, toggles `resolved` for backwards compat.
 */
export async function PATCH(request: Request) {
  const { client, project, conceptId, versionId, annotationId, resolved, text, status } = await request.json();

  if (!client || !project || !conceptId || !versionId || !annotationId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const concept = manifest.concepts?.find(c => c.id === conceptId);
  const version = concept?.versions.find(v => v.id === versionId);
  const annotation = version?.annotations?.find(a => a.id === annotationId);
  if (!annotation || !concept || !version) return NextResponse.json({ error: 'Annotation not found' }, { status: 404 });

  let touched = false;
  if (typeof text === 'string') {
    annotation.text = text;
    touched = true;
  }
  if (typeof resolved === 'boolean') {
    annotation.resolved = resolved;
    touched = true;
  }
  if (status === 'running') {
    annotation.status = 'running';
    touched = true;
  } else if (status === null) {
    delete annotation.status;
    touched = true;
  }
  if (!touched) {
    // Legacy behavior: toggle resolved when no field is provided
    annotation.resolved = !annotation.resolved;
  }

  await writeManifest(userId, client, project, manifest);
  await writeFeedbackSidecar(userId, client, project, concept.label, version);
  await maybeRewriteDriftTemplate(userId, client, project, manifest, concept, version);

  return NextResponse.json(annotation);
}

/**
 * Write a .feedback.md sidecar file next to the HTML version
 */
async function writeFeedbackSidecar(
  userId: string | null,
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
  await writeHtmlFile(userId, client, project, feedbackPath, lines.join('\n'));
}

/**
 * If the version is still an empty drift slot (changelog hasn't been overwritten by a real
 * version yet), regenerate its HTML template based on the current annotation state.
 *
 * Transitions:
 *   no whole-version prompt            → driftPromptBoilerplate   (empty)
 *   prompt saved, no agent reply yet   → awaitingAgentBoilerplate (awaiting)
 *   prompt with status='running'       → inProgressBoilerplate    (in progress)
 *   agent reply present                → leave file alone (agent wrote real content)
 */
async function maybeRewriteDriftTemplate(
  userId: string | null,
  client: string,
  project: string,
  manifest: Manifest,
  concept: { label: string; id: string; versions: { id: string; file: string; number: number; changelog: string; annotations?: Annotation[] }[] },
  version: { id: string; file: string; number: number; changelog: string; annotations?: Annotation[] },
) {
  // Only drift slots get template rewrites
  if (version.changelog !== EMPTY_DRIFT_CHANGELOG) return;

  const annotations = version.annotations ?? [];
  const wholeVersionPrompt = annotations.find(
    a => a.x === null && a.y === null && (a.parentId == null),
  );
  const hasAgentReply = wholeVersionPrompt
    ? annotations.some(a => a.parentId === wholeVersionPrompt.id && a.isAgent)
    : false;

  if (hasAgentReply) return;

  const canvas =
    typeof manifest.project.canvas === 'string' ? manifest.project.canvas : 'desktop';
  const title = `${manifest.project.name} — ${concept.label} v${version.number}`;

  let html: string;
  if (!wholeVersionPrompt) {
    html = driftPromptBoilerplate(canvas, title, concept.label, version.number);
  } else if (wholeVersionPrompt.status === 'running') {
    html = inProgressBoilerplate(canvas, title, concept.label, version.number, wholeVersionPrompt.text);
  } else {
    html = awaitingAgentBoilerplate(canvas, title, concept.label, version.number, wholeVersionPrompt.text);
  }

  try {
    await writeHtmlFile(userId, client, project, version.file, html);
  } catch {
    // Best-effort
  }
}
