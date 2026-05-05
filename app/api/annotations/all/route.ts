import { NextResponse } from 'next/server';
import { getManifest } from '@/lib/storage';
import { getUserId } from '@/lib/auth';
import type { Annotation } from '@/lib/types';

export interface ProjectAnnotation {
  annotation: Annotation;
  replies: Annotation[];
  conceptId: string;
  conceptLabel: string;
  versionId: string;
  versionNumber: number;
  roundId: string | undefined;
  roundNumber: number | undefined;
  /**
   * Four-state model (UI tabs collapse open + in-progress into a single Open tab):
   * - 'open'        — last message is from designer AND not yet copied to agent
   * - 'in-progress' — submitted to agent, awaiting reply (or status='running')
   * - 'replied'     — last message is from agent
   * - 'closed'      — annotation.resolved is true
   */
  state: 'open' | 'in-progress' | 'replied' | 'closed';
}

/**
 * GET /api/annotations/all?client=X&project=Y
 * Flattens every top-level annotation across every round into a list with
 * derived state. Used by the project-wide comments hub.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get('client');
  const project = url.searchParams.get('project');

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client or project' }, { status: 400 });
  }

  const userId = await getUserId();
  const manifest = await getManifest(userId, client, project);
  if (!manifest) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const out: ProjectAnnotation[] = [];

  // Walk every round (rounds-enabled projects keep concepts inside rounds; the
  // top-level concepts alias is empty on those, so iterate rounds first.)
  const rounds = manifest.rounds ?? [];
  if (rounds.length > 0) {
    for (const round of rounds) {
      for (const concept of round.concepts ?? []) {
        for (const version of concept.versions ?? []) {
          collectFromVersion(version.annotations ?? [], {
            conceptId: concept.id,
            conceptLabel: concept.label,
            versionId: version.id,
            versionNumber: version.number,
            roundId: round.id,
            roundNumber: round.number,
            out,
          });
        }
      }
    }
  } else {
    // Legacy / non-rounds project — concepts live at the top level.
    for (const concept of manifest.concepts ?? []) {
      for (const version of concept.versions ?? []) {
        collectFromVersion(version.annotations ?? [], {
          conceptId: concept.id,
          conceptLabel: concept.label,
          versionId: version.id,
          versionNumber: version.number,
          roundId: undefined,
          roundNumber: undefined,
          out,
        });
      }
    }
  }

  // Most recent activity first (use the latest reply, falling back to the original).
  out.sort((a, b) => {
    const aLast = a.replies[a.replies.length - 1]?.created ?? a.annotation.created;
    const bLast = b.replies[b.replies.length - 1]?.created ?? b.annotation.created;
    return bLast.localeCompare(aLast);
  });

  return NextResponse.json(out);
}

function collectFromVersion(
  annotations: Annotation[],
  ctx: {
    conceptId: string;
    conceptLabel: string;
    versionId: string;
    versionNumber: number;
    roundId: string | undefined;
    roundNumber: number | undefined;
    out: ProjectAnnotation[];
  }
) {
  // Group: top-level annotations (no parentId) + their threaded replies (parentId set).
  const tops = annotations.filter(a => !a.parentId);
  const repliesByParent = new Map<string, Annotation[]>();
  for (const a of annotations) {
    if (!a.parentId) continue;
    const arr = repliesByParent.get(a.parentId) ?? [];
    arr.push(a);
    repliesByParent.set(a.parentId, arr);
  }
  for (const arr of repliesByParent.values()) {
    arr.sort((a, b) => a.created.localeCompare(b.created));
  }

  for (const top of tops) {
    const replies = repliesByParent.get(top.id) ?? [];
    const last = replies[replies.length - 1] ?? top;
    let state: 'open' | 'in-progress' | 'replied' | 'closed';
    if (top.resolved) {
      state = 'closed';
    } else if (last.isAgent) {
      state = 'replied';
    } else if (top.status === 'running') {
      state = 'in-progress';
    } else if (top.submittedAt && top.submittedAt >= last.created) {
      // Designer's latest turn has been copied to the agent — awaiting their reply.
      state = 'in-progress';
    } else {
      // Designer wrote something that hasn't been sent to the agent yet.
      state = 'open';
    }
    ctx.out.push({
      annotation: top,
      replies,
      conceptId: ctx.conceptId,
      conceptLabel: ctx.conceptLabel,
      versionId: ctx.versionId,
      versionNumber: ctx.versionNumber,
      roundId: ctx.roundId,
      roundNumber: ctx.roundNumber,
      state,
    });
  }
}
