import { promises as fs } from 'fs';
import path from 'path';
import type { Manifest, ClientInfo, ProjectInfo } from './types';
import { conceptSlug } from './letters';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

/**
 * Compute "last edited" for a project: the latest ISO timestamp across all
 * versions and annotations in the manifest. Returns null if neither exists.
 * Cheap — no extra IO beyond what's already loaded.
 */
export function computeLastEditedAt(manifest: Manifest): string | null {
  let max = 0;
  const concepts = manifest.rounds?.length
    ? manifest.rounds.flatMap(r => r.concepts || [])
    : manifest.concepts || [];
  for (const c of concepts) {
    for (const v of c.versions || []) {
      if (v.created) {
        const t = new Date(v.created).getTime();
        if (t > max) max = t;
      }
      for (const a of v.annotations || []) {
        if (a.created) {
          const t = new Date(a.created).getTime();
          if (t > max) max = t;
        }
      }
    }
  }
  return max > 0 ? new Date(max).toISOString() : null;
}

export async function getManifest(client: string, project: string): Promise<Manifest | null> {
  try {
    const manifestPath = path.join(PROJECTS_DIR, client, project, 'manifest.json');
    const data = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(data) as Manifest;

    // Backward compat: ensure rounds array exists
    if (!manifest.rounds) manifest.rounds = [];

    // --- Legacy migration: move top-level concepts into rounds ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topConcepts = (manifest as any).concepts as Manifest['concepts'] | undefined;
    if (topConcepts && topConcepts.length > 0) {
      if (manifest.rounds.length === 0) {
        // No rounds — wrap everything into Round 1
        manifest.rounds = [{
          id: 'round-1',
          number: 1,
          name: 'Round 1',
          createdAt: manifest.project.created || new Date().toISOString(),
          selects: [],
          concepts: topConcepts,
        }];
      } else {
        // Has round metadata but concepts still top-level — merge into rounds
        for (const round of manifest.rounds) {
          if (!round.concepts || round.concepts.length === 0) {
            round.concepts = topConcepts;
          }
          // Backfill createdAt from savedAt/closedAt
          if (!round.createdAt) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            round.createdAt = (round as any).savedAt as string
              || round.closedAt as string
              || manifest.project.created
              || new Date().toISOString();
          }
        }
      }
    }

    // Ensure every round has a concepts array and createdAt
    for (const round of manifest.rounds) {
      if (!round.concepts) round.concepts = [];
      if (!round.createdAt) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        round.createdAt = (round as any).savedAt as string
          || round.closedAt as string
          || new Date().toISOString();
      }
    }

    // Deduplicate versions + backfill slugs within each round's concepts
    for (const round of manifest.rounds) {
      for (const concept of round.concepts) {
        const seen = new Set<string>();
        concept.versions = concept.versions.filter(v => {
          if (seen.has(v.id)) return false;
          seen.add(v.id);
          return true;
        });
        if (!concept.slug) {
          concept.slug = conceptSlug(concept.label);
        }
      }
    }

    // Set manifest.concepts as alias to the latest round's concepts
    // This keeps all existing API routes and components working unchanged
    const latestRound = manifest.rounds[manifest.rounds.length - 1];
    manifest.concepts = latestRound ? latestRound.concepts : [];

    return manifest;
  } catch {
    return null;
  }
}

/** Get concepts for a specific round (or the latest round if no roundId given) */
export function getRoundConcepts(manifest: Manifest, roundId?: string): { round: Manifest['rounds'][number]; concepts: Manifest['rounds'][number]['concepts'] } | null {
  if (manifest.rounds.length === 0) return null;
  const round = roundId
    ? manifest.rounds.find(r => r.id === roundId)
    : manifest.rounds[manifest.rounds.length - 1];
  if (!round) return null;
  return { round, concepts: round.concepts };
}

export async function writeManifest(client: string, project: string, manifest: Manifest): Promise<void> {
  const manifestPath = path.join(PROJECTS_DIR, client, project, 'manifest.json');
  // Strip top-level concepts alias before writing — rounds own the concepts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { concepts: _alias, ...rest } = manifest;
  await fs.writeFile(manifestPath, JSON.stringify(rest, null, 2), 'utf-8');
}

export async function getClients(): Promise<ClientInfo[]> {
  const clients: ClientInfo[] = [];

  try {
    const clientDirs = await fs.readdir(PROJECTS_DIR);

    for (const clientSlug of clientDirs) {
      const clientPath = path.join(PROJECTS_DIR, clientSlug);
      const stat = await fs.stat(clientPath);
      if (!stat.isDirectory()) continue;

      const projects: ProjectInfo[] = [];
      const projectDirs = await fs.readdir(clientPath);

      for (const projectSlug of projectDirs) {
        if (projectSlug === 'brand') continue;
        const projectPath = path.join(clientPath, projectSlug);
        const projectStat = await fs.stat(projectPath);
        if (!projectStat.isDirectory()) continue;

        const manifestPath = path.join(projectPath, 'manifest.json');
        try {
          const data = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(data) as Manifest;
          // Gather concepts from all rounds (or legacy top-level)
          const allConcepts = manifest.rounds?.length
            ? manifest.rounds.flatMap(r => r.concepts || [])
            : manifest.concepts || [];
          const versionCount = allConcepts.reduce((sum, c) => sum + c.versions.length, 0);
          projects.push({
            slug: projectSlug,
            name: manifest.project.name,
            canvas: manifest.project.canvas,
            conceptCount: allConcepts.length,
            versionCount,
            lastEditedAt: computeLastEditedAt(manifest),
          });
        } catch {
          continue;
        }
      }

      if (projects.length > 0) {
        // Try to derive client name from brand guidelines heading
        let name = clientSlug
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        try {
          const guidelinesPath = path.join(clientPath, 'brand', 'guidelines.md');
          const guidelines = await fs.readFile(guidelinesPath, 'utf-8');
          const heading = guidelines.match(/^#\s+(.+?)(?:\s+Brand)?\s+(?:Guidelines|Guide)/m);
          if (heading) name = heading[1].trim();
        } catch {
          // no guidelines file, use slug-derived name
        }

        clients.push({ slug: clientSlug, name, projects });
      }
    }
  } catch {
    // projects dir doesn't exist
  }

  return clients;
}

export async function getHtmlFile(client: string, project: string, filePath: string): Promise<string | null> {
  try {
    const fullPath = path.join(PROJECTS_DIR, client, project, filePath);
    // Security: ensure path doesn't escape projects dir
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) return null;
    return await fs.readFile(resolved, 'utf-8');
  } catch {
    return null;
  }
}
