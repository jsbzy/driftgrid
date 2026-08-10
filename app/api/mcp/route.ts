import { NextResponse } from 'next/server';
import { getManifest, writeManifest, writeHtmlFile, getClients } from '@/lib/storage';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { resolveCloudUser } from '@/lib/cloud-auth-server';
import { createProject, CreateProjectError } from '@/lib/create-project';
import { findConcept, findConceptAndVersion, getAllConcepts } from '@/lib/manifest-lookup';
import { areValidSlugs } from '@/lib/slug';
import type { Manifest } from '@/lib/types';

/**
 * /api/mcp — the DriftGrid web MCP (Model Context Protocol over streamable
 * HTTP, stateless).
 *
 * This is the remote counterpart of mcp/server.ts (the local stdio server):
 * agents that can reach the internet — Claude Code, Codex CLI, Cursor, any
 * MCP client that supports HTTP transports — work a user's cloud projects
 * directly, no local install. CLOUD-FOUNDATION Phase 5, pulled forward onto
 * the current Storage-backed model; the tool surface is the stable contract
 * and survives the DB rebuild underneath.
 *
 * Auth (cloud mode): a personal access token (`dg_pat_…`), either as
 * `Authorization: Bearer` or as a `?key=` query param for clients that can't
 * set headers (note: URLs can end up in logs — prefer the header). Local mode
 * (self-hosted dev) is unauthenticated, like the rest of the local API.
 *
 * Protocol: JSON-RPC over POST, stateless — initialize / tools/list /
 * tools/call / ping. No sessions, no SSE stream (GET → 405, which the spec
 * permits for servers that don't push).
 */

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_RAW_HTML_BYTES = 2 * 1024 * 1024;

// ── JSON-RPC plumbing ──

type JsonRpcRequest = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown> };

function rpcResult(id: number | string | null, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}
function rpcError(id: number | string | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });
}
function toolText(text: string, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}
function toolJson(data: unknown, isError = false) {
  return toolText(JSON.stringify(data, null, 2), isError);
}

// ── Tool definitions (inputSchema is JSON Schema — shown to the model) ──

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all clients and projects in this DriftGrid workspace.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_project',
    description: 'Get a project\'s structure: rounds, concepts (design directions), versions (iterations) with ids, files, stars, and changelogs. Use the ids with other tools.',
    inputSchema: {
      type: 'object',
      properties: { client: { type: 'string' }, project: { type: 'string' } },
      required: ['client', 'project'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new DriftGrid project with a starter version. Canvas is REQUIRED — ask the user which format matches their output: desktop (1440 scrollable — websites), mobile (375 — app screens), tablet (768), landscape-16-9 (1920×1080 — slides), a4-portrait (794×1123 — documents), freeform.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client name or slug' },
        project: { type: 'string', description: 'Project name or slug' },
        canvas: { type: 'string', enum: ['desktop', 'mobile', 'tablet', 'landscape-16-9', 'a4-portrait', 'freeform'] },
      },
      required: ['client', 'project', 'canvas'],
    },
  },
  {
    name: 'add_version',
    description: 'Add a new version to a concept from a complete self-contained HTML document (inline CSS/JS, Google Fonts via <link>, no other external URLs). This is how you ship a design into the grid. Returns the new version id.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string' },
        project: { type: 'string' },
        conceptId: { type: 'string', description: 'Target concept id from get_project' },
        html: { type: 'string', description: 'The full HTML document' },
        changelog: { type: 'string', description: 'One line: what changed vs the previous version' },
      },
      required: ['client', 'project', 'conceptId', 'html'],
    },
  },
  {
    name: 'get_feedback',
    description: 'Read feedback for a project: designer/agent annotations on versions, plus comments clients left on share pages. Optionally scope to one version.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string' },
        project: { type: 'string' },
        conceptId: { type: 'string' },
        versionId: { type: 'string' },
      },
      required: ['client', 'project'],
    },
  },
  {
    name: 'add_feedback',
    description: 'Leave an annotation on a version (e.g. to reply to feedback or record design rationale). Appears in the grid\'s comment thread.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string' },
        project: { type: 'string' },
        conceptId: { type: 'string' },
        versionId: { type: 'string' },
        text: { type: 'string' },
        author: { type: 'string', description: 'Agent name, e.g. "claude" or "codex"' },
      },
      required: ['client', 'project', 'conceptId', 'versionId', 'text'],
    },
  },
  {
    name: 'create_share',
    description: 'Create (or refresh) the public client-review link for a project. Returns the URL to send to the client. Cloud only.',
    inputSchema: {
      type: 'object',
      properties: { client: { type: 'string' }, project: { type: 'string' } },
      required: ['client', 'project'],
    },
  },
];

// ── Tool implementations ──

type ToolCtx = { userId: string | null; bearer: string | null; origin: string };

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

async function requireManifest(userId: string | null, client: string, project: string): Promise<Manifest> {
  if (!areValidSlugs(client, project)) throw new Error(`Invalid client/project slug: ${client}/${project}`);
  const manifest = await getManifest(userId, client, project);
  if (!manifest) throw new Error(`Project not found: ${client}/${project}. Use list_projects to see what exists.`);
  return manifest;
}

async function runTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<ReturnType<typeof toolText>> {
  const a = args as Record<string, string>;

  switch (name) {
    case 'list_projects': {
      const clients = await getClients(ctx.userId);
      return toolJson(clients);
    }

    case 'get_project': {
      const manifest = await requireManifest(ctx.userId, a.client, a.project);
      const rounds = manifest.rounds?.length
        ? manifest.rounds
        : [{ id: 'round-1', number: 1, name: 'Round 1', concepts: manifest.concepts }];
      const summary = {
        name: manifest.project.name,
        canvas: manifest.project.canvas,
        rounds: rounds.map(r => ({
          id: r.id, number: r.number, name: r.name,
          concepts: (r.concepts ?? []).map(c => ({
            id: c.id, label: c.label, description: c.description,
            versions: c.versions.map(v => ({
              id: v.id, number: v.number, file: v.file, starred: v.starred,
              changelog: v.changelog, annotations: v.annotations?.length ?? 0,
            })),
          })),
        })),
      };
      return toolJson(summary);
    }

    case 'create_project': {
      try {
        const result = await createProject(ctx.userId, a.client, a.project, a.canvas);
        return toolJson({ ...result, next: 'Use add_version with conceptId to replace the starter design.' });
      } catch (e) {
        if (e instanceof CreateProjectError) return toolText(e.message, true);
        throw e;
      }
    }

    case 'add_version': {
      const html = a.html;
      if (typeof html !== 'string' || !html.trim()) return toolText('html must be a non-empty string', true);
      if (Buffer.byteLength(html, 'utf-8') > MAX_RAW_HTML_BYTES) return toolText('html too large (max 2MB)', true);

      const manifest = await requireManifest(ctx.userId, a.client, a.project);
      const { concept } = findConcept(manifest, a.conceptId);
      if (!concept) return toolText(`Concept not found: ${a.conceptId}. Use get_project for valid ids.`, true);

      const nextNumber = concept.versions.length > 0 ? Math.max(...concept.versions.map(v => v.number)) + 1 : 1;
      const folder = concept.versions[0]?.file ? concept.versions[0].file.split('/').slice(0, -1).join('/') : a.conceptId;
      const newFile = `${folder}/v${nextNumber}.html`;
      const newVersion = {
        id: `${a.conceptId}--v${nextNumber}`,
        number: nextNumber,
        file: newFile,
        parentId: concept.versions[concept.versions.length - 1]?.id ?? null,
        changelog: (a.changelog || 'Added via MCP').slice(0, 300),
        visible: true,
        starred: false,
        created: new Date().toISOString(),
        thumbnail: '',
      };

      await writeHtmlFile(ctx.userId, a.client, a.project, newFile, html);
      concept.versions.push(newVersion);
      await writeManifest(ctx.userId, a.client, a.project, manifest);

      return toolJson({ versionId: newVersion.id, number: nextNumber, file: newFile, url: `/admin/${a.client}/${a.project}` });
    }

    case 'get_feedback': {
      const manifest = await requireManifest(ctx.userId, a.client, a.project);

      // Annotations (designer/agent comments on versions, stored in the manifest)
      const annotations: unknown[] = [];
      for (const { concept } of getAllConcepts(manifest)) {
        if (a.conceptId && concept.id !== a.conceptId) continue;
        for (const version of concept.versions) {
          if (a.versionId && version.id !== a.versionId) continue;
          for (const ann of version.annotations ?? []) {
            annotations.push({ concept: concept.label, conceptId: concept.id, versionId: version.id, ...ann });
          }
        }
      }

      // Client comments from share pages (cloud DB; keyed by this project's share tokens)
      let clientComments: unknown[] = [];
      if (isCloudMode() && ctx.userId) {
        const supabase = getSupabaseAdmin();
        const { data: shares } = await supabase
          .from('share_links').select('token')
          .eq('user_id', ctx.userId).eq('client', a.client).eq('project', a.project);
        const tokens = (shares ?? []).map(s => s.token);
        if (tokens.length > 0) {
          const { data: comments } = await supabase
            .from('client_comments')
            .select('concept_id, version_id, author_name, body, status, created_at, parent_comment_id')
            .in('share_token', tokens)
            .order('created_at', { ascending: true });
          clientComments = comments ?? [];
        }
      }

      return toolJson({ annotations, clientComments });
    }

    case 'add_feedback': {
      const manifest = await requireManifest(ctx.userId, a.client, a.project);
      const { concept, version } = findConceptAndVersion(manifest, a.conceptId, a.versionId);
      if (!concept || !version) return toolText('Version not found. Use get_project for valid ids.', true);
      if (typeof a.text !== 'string' || !a.text.trim()) return toolText('text is required', true);

      const annotation = {
        id: generateId(),
        x: null, y: null, element: null,
        text: a.text.trim(),
        author: (a.author || 'agent').slice(0, 60),
        isClient: false,
        isAgent: true,
        created: new Date().toISOString(),
        resolved: false,
        parentId: null,
      };
      if (!version.annotations) version.annotations = [];
      version.annotations.push(annotation);
      await writeManifest(ctx.userId, a.client, a.project, manifest);
      return toolJson({ id: annotation.id, added: true });
    }

    case 'create_share': {
      if (!isCloudMode() || !ctx.bearer) {
        return toolText('Sharing is a cloud feature — this workspace is local. Push the project to driftgrid.ai first.', true);
      }
      // Forward to the existing share route with the caller's own credential so
      // tier limits and round handling stay in one place.
      const res = await fetch(`${ctx.origin}/api/cloud/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ctx.bearer}` },
        body: JSON.stringify({ client: a.client, project: a.project }),
      });
      const body = await res.json();
      if (!res.ok) return toolText(body.error || `Share failed (HTTP ${res.status})`, true);
      return toolJson(body);
    }

    default:
      return toolText(`Unknown tool: ${name}`, true);
  }
}

// ── HTTP handlers ──

export async function POST(request: Request) {
  // Auth: cloud requires a PAT/JWT (header, or ?key= for clients that can't
  // set headers); local mode is open like the rest of the local API.
  const url = new URL(request.url);
  let userId: string | null = null;
  let bearer: string | null = null;

  if (isCloudMode()) {
    const headerVal = request.headers.get('authorization');
    const keyParam = url.searchParams.get('key');
    const authHeader = headerVal ?? (keyParam ? `Bearer ${keyParam}` : null);
    const resolved = await resolveCloudUser(authHeader);
    if (!resolved) {
      return NextResponse.json(
        { error: 'Unauthorized. Pass a DriftGrid personal access token as "Authorization: Bearer dg_pat_…" (mint one at /account).' },
        { status: 401 },
      );
    }
    userId = resolved.userId;
    bearer = authHeader!.slice(7).trim();
  }

  let msg: JsonRpcRequest;
  try {
    msg = await request.json();
  } catch {
    return rpcError(null, -32700, 'Parse error: body must be JSON');
  }
  if (Array.isArray(msg)) {
    return rpcError(null, -32600, 'Batch requests are not supported');
  }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(null, -32600, 'Invalid JSON-RPC request');
  }

  // Notifications (no id) — acknowledge without a body.
  if (msg.id === undefined || msg.id === null) {
    return new NextResponse(null, { status: 202 });
  }

  switch (msg.method) {
    case 'initialize': {
      const requested = (msg.params?.protocolVersion as string) || '';
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[1];
      return rpcResult(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'driftgrid', version: '0.1.0' },
        instructions:
          'DriftGrid manages HTML design iterations: projects contain concepts (design directions) with versions (iterations). ' +
          'Typical loop: list_projects → get_project → add_version (full self-contained HTML) → create_share → later get_feedback and iterate. ' +
          'Never overwrite a version — always add a new one.',
      });
    }

    case 'ping':
      return rpcResult(msg.id, {});

    case 'tools/list':
      return rpcResult(msg.id, { tools: TOOLS });

    case 'tools/call': {
      const name = msg.params?.name as string;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (!name) return rpcError(msg.id, -32602, 'Missing tool name');
      try {
        const result = await runTool(name, args, { userId, bearer, origin: url.origin });
        return rpcResult(msg.id, result);
      } catch (e) {
        // Tool-level failures are results (isError), not protocol errors —
        // the model should see them and self-correct.
        return rpcResult(msg.id, toolText(e instanceof Error ? e.message : String(e), true));
      }
    }

    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// Stateless server: no SSE push stream, no sessions to delete.
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
export async function DELETE() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
