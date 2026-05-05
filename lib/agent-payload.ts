import type { Annotation } from './types';

export interface FrameContext {
  client?: string;
  project?: string;
  conceptId?: string;
  versionId?: string;
  conceptLabel: string;
  versionNumber: number;
  filePath: string;
}

/**
 * Build the canonical "Copy for Agent" payload for a single annotation thread.
 *
 * - When the latest message is from a non-agent (designer), this is treated as a
 *   FOLLOW-UP TURN: the message is led by a hard banner instructing the agent
 *   not to re-execute prior turns, then the new request, then PRIOR THREAD with
 *   numbered turns.
 * - Otherwise the original prompt is the focus, with replies appended.
 *
 * Used by both the in-frame AnnotationOverlay popup and the project-wide
 * CommentsHub sidebar so the format is identical wherever the user copies from.
 */
export function buildAgentMessage(opts: {
  annotation: Annotation;
  replies: Annotation[];
  frameContext?: FrameContext;
  /** Unsaved reply draft (only relevant from the in-frame popup). */
  pendingReply?: string;
}): string {
  const { annotation, replies, frameContext } = opts;
  const lines: string[] = [];

  const isPlan = /^\s*\[plan\]\s*/i.test(annotation.text);
  const cleanText = isPlan ? annotation.text.replace(/^\s*\[plan\]\s*/i, '') : annotation.text;
  const trimmedPending = opts.pendingReply?.trim() || '';
  const lastReply = replies[replies.length - 1];
  const isFollowUp = !!trimmedPending || (lastReply && !lastReply.isAgent);

  if (isFollowUp) {
    const priorTurns = 1 + (trimmedPending ? replies.length : replies.length - 1);
    lines.push('################################################################');
    lines.push(`#  FOLLOW-UP TURN — ${priorTurns} earlier turn${priorTurns === 1 ? '' : 's'} already complete.`);
    lines.push('#  Act ONLY on the CURRENT REQUEST below. Do NOT re-execute the');
    lines.push('#  original prompt or any prior turn — those are context only.');
    lines.push('################################################################');
    lines.push('');
  }
  if (annotation.provider) lines.push(`Routed to: ${annotation.provider}`);
  if (isPlan) lines.push('Mode: plan (discuss in chat first; do NOT edit files yet)');
  if (frameContext) {
    lines.push(`Slide: ${frameContext.conceptLabel} v${frameContext.versionNumber} — ${frameContext.filePath}`);
  }
  if (annotation.x !== null && annotation.y !== null) {
    const xPct = Math.round(annotation.x * 100);
    const yPct = Math.round(annotation.y * 100);
    lines.push(`Pin: (${xPct}%, ${yPct}%)`);
  }
  lines.push(`Annotation ID: ${annotation.id}`);
  lines.push('');

  const hasNewRequest = !!trimmedPending || (lastReply && !lastReply.isAgent);

  if (hasNewRequest) {
    const priorReplies = trimmedPending ? replies : replies.slice(0, -1);
    lines.push('▶ CURRENT REQUEST (act on this):');
    lines.push('');
    lines.push(trimmedPending || lastReply.text);
    lines.push('');
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('PRIOR THREAD — already addressed, DO NOT REDO:');
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push(`[1] designer (original ask): ${cleanText}`);
    priorReplies.forEach((r, i) => {
      const who = r.isAgent ? 'agent (already done)' : (r.author || 'reply');
      lines.push(`[${i + 2}] ${who}: ${r.text}`);
    });
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('END PRIOR THREAD. Scroll up — the CURRENT REQUEST is the only thing to act on.');
  } else {
    lines.push(`> ${cleanText.split('\n').join('\n> ')}`);
    if (replies.length > 0) {
      lines.push('');
      for (const r of replies) {
        const who = r.isAgent ? 'Agent' : (r.author || 'Reply');
        lines.push(`↳ ${who}: ${r.text}`);
      }
    }
  }

  if (frameContext?.client && frameContext.project && frameContext.conceptId && frameContext.versionId) {
    lines.push('');
    lines.push('---');
    lines.push(`Frame URL: http://localhost:3000/admin/${frameContext.client}/${frameContext.project}#${frameContext.conceptId}/v${frameContext.versionNumber}`);
    lines.push('');
    lines.push('After applying the change, reply to this prompt by POSTing to');
    lines.push('http://localhost:3000/api/annotations with:');
    lines.push('  {');
    lines.push(`    "client": "${frameContext.client}",`);
    lines.push(`    "project": "${frameContext.project}",`);
    lines.push(`    "conceptId": "${frameContext.conceptId}",`);
    lines.push(`    "versionId": "${frameContext.versionId}",`);
    lines.push(`    "parentId": "${annotation.id}",`);
    lines.push(`    "text": "<brief summary of what you changed>",`);
    if (annotation.provider) {
      lines.push(`    "author": "${annotation.provider}",`);
    }
    lines.push(`    "isAgent": true`);
    lines.push('  }');
    lines.push('');
    lines.push('When done, echo BOTH the absolute filepath and http://localhost:3000/admin/... URL back to the designer in your chat reply (per AGENTS.md "Always Echo the Version Reference").');
  }
  return lines.join('\n');
}
