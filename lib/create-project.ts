/**
 * Project creation — dual-mode (local filesystem / cloud Storage).
 *
 * Extracted from app/api/create-project (which was fs-only and therefore
 * broken on the hosted deployment) so both the HTTP route and the web MCP
 * create projects through one implementation.
 *
 * Local mode (userId null): byte-compatible with the historical route —
 * scaffolds client/brand dirs and writes the legacy top-level-`concepts`
 * manifest RAW to disk (see the inline note; the shared write path strips the
 * concepts alias, which would persist an empty project).
 *
 * Cloud mode (userId set): writes through lib/storage into Supabase Storage,
 * and builds the manifest in the canonical ROUNDS shape — writeManifestCloud
 * strips the top-level alias on serialize, so a legacy-shaped manifest would
 * land empty. Free tier is capped at MAX_FREE_CLOUD_PROJECTS.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CANVAS_PRESETS } from './constants';
import { conceptSlug } from './letters';
import { isCloudMode, getSupabaseAdmin } from './supabase';
import { getManifest, writeManifest, writeHtmlFile, getClients } from './storage';
import { areValidSlugs } from './slug';
import type { Manifest } from './types';

export const MAX_FREE_CLOUD_PROJECTS = 3;

export class CreateProjectError extends Error {
  constructor(message: string, public readonly status: number, public readonly extra?: Record<string, unknown>) {
    super(message);
    this.name = 'CreateProjectError';
  }
}

export interface CreateProjectResult {
  client: string;
  project: string;
  conceptId: string;
  versionId: string;
  url: string;
  /** Local mode only — where the starter HTML lives on disk. */
  absolutePath?: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function titleCase(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function starterHtml(projectName: string, canvasPreset: string): string {
  const preset = CANVAS_PRESETS[canvasPreset];
  const isLocked = !preset.responsive && typeof preset.height === 'number';
  const widthPx = typeof preset.width === 'number' ? preset.width : 1440;
  return isLocked
    ? `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${projectName}</title>\n    <style>\n        * { margin: 0; padding: 0; box-sizing: border-box; }\n        html, body { width: 100%; height: 100vh; overflow: hidden; }\n        body { font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; display: flex; align-items: center; justify-content: center; background: #ffffff; color: #111111; }\n    </style>\n</head>\n<body>\n    <h1 style="font-size: 2rem; font-weight: 300; letter-spacing: 0.05em;">${projectName}</h1>\n</body>\n</html>`
    : `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${projectName}</title>\n    <style>\n        * { margin: 0; padding: 0; box-sizing: border-box; }\n        html, body { width: 100%; }\n        body { max-width: ${widthPx}px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; padding: 4rem 2rem; background: #ffffff; color: #111111; }\n    </style>\n</head>\n<body>\n    <h1 style="font-size: 2rem; font-weight: 300; letter-spacing: 0.05em;">${projectName}</h1>\n</body>\n</html>`;
}

export async function createProject(
  userId: string | null,
  clientRaw: string,
  projectRaw: string,
  canvas: string,
): Promise<CreateProjectResult> {
  if (!clientRaw || !projectRaw) {
    throw new CreateProjectError('Missing client or project', 400);
  }
  if (!canvas || !CANVAS_PRESETS[canvas]) {
    throw new CreateProjectError(
      `canvas is required. Choose the format that matches your output.`,
      400,
      { valid: Object.keys(CANVAS_PRESETS) },
    );
  }

  const client = slugify(clientRaw);
  const project = slugify(projectRaw);
  if (!areValidSlugs(client, project)) {
    throw new CreateProjectError('Invalid slug', 400);
  }

  const now = new Date().toISOString();
  const conceptId = `concept-${generateId()}`;
  const versionId = `version-${generateId()}`;
  const projectName = titleCase(project);
  const html = starterHtml(projectName, canvas);

  if (isCloudMode() && userId) {
    // ── Cloud: Supabase Storage under {userId}/{client}/{project}/ ──
    const existing = await getManifest(userId, client, project);
    if (existing) {
      throw new CreateProjectError(`Project already exists: ${client}/${project}`, 409);
    }

    // Free-tier cap — count existing cloud projects across all clients.
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles').select('tier').eq('id', userId).single();
    if ((profile?.tier ?? 'free') === 'free') {
      const clients = await getClients(userId);
      const projectCount = clients.reduce((n, c) => n + c.projects.length, 0);
      if (projectCount >= MAX_FREE_CLOUD_PROJECTS) {
        throw new CreateProjectError(
          `Free tier includes ${MAX_FREE_CLOUD_PROJECTS} cloud projects. Upgrade to Pro for unlimited.`,
          402,
        );
      }
    }

    // Rounds shape — the cloud serializer strips the top-level `concepts`
    // alias, so the legacy shape would persist as an empty project.
    const manifest: Manifest = {
      project: { name: projectName, slug: project, client, canvas, created: now, links: {} },
      concepts: [],
      rounds: [{
        id: 'round-1',
        number: 1,
        name: 'Round 1',
        createdAt: now,
        selects: [],
        concepts: [{
          id: conceptId,
          slug: conceptSlug('Concept 1'),
          label: 'Concept 1',
          description: '',
          position: 0,
          visible: true,
          versions: [{
            id: versionId, number: 1, file: 'concept-1/v1.html', parentId: null,
            changelog: 'Initial version', visible: true, starred: false, created: now, thumbnail: '',
          }],
        }],
      }],
      workingSets: [],
      comments: [],
      clientEdits: [],
    };

    await writeHtmlFile(userId, client, project, 'concept-1/v1.html', html);
    await writeManifest(userId, client, project, manifest);

    return { client, project, conceptId, versionId, url: `/admin/${client}/${project}` };
  }

  // ── Local: filesystem under projects/ (behavior preserved from the route) ──
  const PROJECTS_DIR = path.join(process.cwd(), 'projects');
  const projectDir = path.join(PROJECTS_DIR, client, project);
  const conceptDir = path.join(projectDir, 'concept-1');
  const brandDir = path.join(PROJECTS_DIR, client, 'brand');

  try {
    await fs.stat(projectDir);
    throw new CreateProjectError(`Project already exists: ${client}/${project}`, 409);
  } catch (e) {
    if (e instanceof CreateProjectError) throw e;
    // Doesn't exist — good
  }

  await fs.mkdir(conceptDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, '.thumbs'), { recursive: true });

  try {
    await fs.stat(brandDir);
  } catch {
    await fs.mkdir(path.join(brandDir, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(brandDir, 'guidelines.md'),
      `# ${titleCase(client)} Brand Guidelines\n\n## Colors\n- Primary: #000000\n- Secondary: #666666\n- Background: #FFFFFF\n\n## Typography\n- Heading: Inter\n- Body: Inter\n`,
      'utf-8',
    );
  }

  const manifest: Manifest = {
    project: { name: projectName, slug: project, client, canvas, created: now, links: {} },
    concepts: [{
      id: conceptId,
      slug: conceptSlug('Concept 1'),
      label: 'Concept 1',
      description: '',
      position: 0,
      visible: true,
      versions: [{
        id: versionId, number: 1, file: 'concept-1/v1.html', parentId: null,
        changelog: 'Initial version', visible: true, starred: false, created: now, thumbnail: '',
      }],
    }],
    rounds: [],
    workingSets: [],
    comments: [],
    clientEdits: [],
  };

  // Written directly (not via lib/storage.writeManifest) on purpose: a brand-new
  // local project uses the legacy top-level `concepts` model with no rounds, and
  // the shared write path strips the `concepts` alias (rounds own concepts
  // there), which would persist an empty project. There are no concurrent
  // writers for a just-created project.
  await fs.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  await fs.writeFile(path.join(conceptDir, 'v1.html'), html, 'utf-8');

  return {
    client, project, conceptId, versionId,
    url: `/admin/${client}/${project}`,
    absolutePath: path.resolve(conceptDir, 'v1.html'),
  };
}
