#!/usr/bin/env npx tsx
/**
 * DriftGrid MCP Server
 *
 * Exposes DriftGrid state and actions to Claude Code via the Model Context Protocol.
 *
 * Resources:
 *   driftgrid://current — what the user is currently viewing
 *
 * Tools:
 *   get_current_view — read current view state
 *   get_manifest — read project manifest
 *   create_version — drift (create new version)
 *   branch_concept — fork into a new concept
 *   create_project — scaffold a new project
 *   close_round — close the current iteration round
 *   get_feedback — read annotations/feedback for a version
 *   add_feedback — add an annotation to a version
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.DRIFTGRID_URL || 'http://localhost:3000';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  return res.json();
}

const server = new McpServer({
  name: 'driftgrid',
  version: '0.1.0',
});

// ── Tools ──

server.tool(
  'get_current_view',
  'Returns what the user is currently viewing in DriftGrid — client, project, concept, version, file path, and view mode.',
  {},
  async () => {
    try {
      const data = await apiFetch('/api/current');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch {
      return { content: [{ type: 'text', text: 'DriftGrid is not running or no active view.' }], isError: true };
    }
  },
);

server.tool(
  'get_manifest',
  'Returns the full project manifest — concepts, versions, rounds, working sets.',
  { client: z.string(), project: z.string() },
  async ({ client, project }) => {
    const data = await apiFetch(`/api/manifest/${client}/${project}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'create_version',
  'Create a new version (drift) — duplicates an existing version\'s HTML file for iteration. Returns the new file path.',
  {
    client: z.string(),
    project: z.string(),
    conceptId: z.string(),
    versionId: z.string(),
  },
  async (input) => {
    const data = await apiFetch('/api/iterate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'branch_concept',
  'Branch a version into a new concept column — creates a new design direction from an existing version.',
  {
    client: z.string(),
    project: z.string(),
    conceptId: z.string(),
    versionId: z.string(),
    label: z.string().optional(),
  },
  async (input) => {
    const data = await apiFetch('/api/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'create_project',
  'Create a new DriftGrid project with a client folder, starter HTML, and manifest.',
  {
    client: z.string(),
    project: z.string(),
    canvas: z.string().optional().describe('Canvas preset: desktop, mobile, tablet, landscape-16-9, a4-portrait, freeform'),
  },
  async (input) => {
    const data = await apiFetch('/api/create-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'close_round',
  'Close the current iteration round — stamps all unstamped versions and creates a divider on the grid.',
  {
    client: z.string(),
    project: z.string(),
    name: z.string().optional().describe('Optional round name (defaults to "Round N")'),
  },
  async (input) => {
    const data = await apiFetch('/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'get_round_baseline',
  'Returns the approved selects (baseline) from a specific round. Use this to understand what was approved and build the next round from it.',
  {
    client: z.string(),
    project: z.string(),
    roundNumber: z.number().optional().describe('Round number (1, 2, 3...). Omit for the latest closed round.'),
  },
  async ({ client, project, roundNumber }) => {
    const manifest = await apiFetch(`/api/manifest/${client}/${project}`);
    const rounds = manifest.rounds ?? [];
    if (rounds.length === 0) {
      return { content: [{ type: 'text', text: 'No rounds closed yet.' }] };
    }
    const round = roundNumber
      ? rounds.find((r: { number: number }) => r.number === roundNumber)
      : rounds[rounds.length - 1];
    if (!round) {
      return { content: [{ type: 'text', text: `Round ${roundNumber} not found.` }] };
    }
    const selects = (round.selects ?? []).map((s: { conceptId: string; versionId: string }) => {
      const concept = manifest.concepts.find((c: { id: string }) => c.id === s.conceptId);
      const version = concept?.versions.find((v: { id: string }) => v.id === s.versionId);
      return {
        concept: concept?.label ?? s.conceptId,
        versionNumber: version?.number,
        file: version?.file,
        absolutePath: `~/drift/projects/${client}/${project}/${version?.file}`,
      };
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          round: round.name,
          roundNumber: round.number,
          closedAt: round.closedAt,
          note: round.note,
          selects,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  'get_feedback',
  'Returns annotations/feedback pinned to a specific version. Use this to see what the designer wants changed.',
  {
    client: z.string(),
    project: z.string(),
    conceptId: z.string(),
    versionId: z.string(),
  },
  async (input) => {
    const data = await apiFetch(`/api/annotations?client=${input.client}&project=${input.project}&conceptId=${input.conceptId}&versionId=${input.versionId}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  'add_feedback',
  'Add a feedback annotation to a version. Use this to document changes you made.',
  {
    client: z.string(),
    project: z.string(),
    conceptId: z.string(),
    versionId: z.string(),
    text: z.string().describe('The feedback note'),
    x: z.number().optional().describe('Relative X position (0-1), omit for general note'),
    y: z.number().optional().describe('Relative Y position (0-1), omit for general note'),
  },
  async (input) => {
    const data = await apiFetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: input.client,
        project: input.project,
        conceptId: input.conceptId,
        versionId: input.versionId,
        x: input.x ?? null,
        y: input.y ?? null,
        text: input.text,
        author: 'agent',
        isClient: false,
      }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DriftGrid MCP server running');
