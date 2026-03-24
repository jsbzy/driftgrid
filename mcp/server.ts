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

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('DriftGrid MCP server running');
