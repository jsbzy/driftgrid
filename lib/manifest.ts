import path from 'path';
import type { Manifest, ClientInfo, ProjectInfo } from './types';
import { conceptSlug } from './letters';
import { getStorage } from './storage';

export async function getManifest(client: string, project: string): Promise<Manifest | null> {
  try {
    const storage = getStorage();
    const data = await storage.readTextFile(path.join(client, project, 'manifest.json'));
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
  const storage = getStorage();
  // Strip top-level concepts alias before writing — rounds own the concepts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { concepts: _alias, ...rest } = manifest;
  await storage.writeTextFile(
    path.join(client, project, 'manifest.json'),
    JSON.stringify(rest, null, 2),
  );
}

export async function getClients(): Promise<ClientInfo[]> {
  const storage = getStorage();
  const clients: ClientInfo[] = [];

  try {
    const clientDirs = await storage.listDir('.');

    for (const clientSlug of clientDirs) {
      const clientStat = await storage.stat(clientSlug);
      if (!clientStat?.isDirectory) continue;

      const projects: ProjectInfo[] = [];
      const projectDirs = await storage.listDir(clientSlug);

      for (const projectSlug of projectDirs) {
        if (projectSlug === 'brand') continue;
        const projectStat = await storage.stat(path.join(clientSlug, projectSlug));
        if (!projectStat?.isDirectory) continue;

        try {
          const data = await storage.readTextFile(path.join(clientSlug, projectSlug, 'manifest.json'));
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
          const guidelines = await storage.readTextFile(path.join(clientSlug, 'brand', 'guidelines.md'));
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
    const storage = getStorage();
    const relativePath = path.join(client, project, filePath);
    if (!storage.validatePath(relativePath)) return null;
    return await storage.readTextFile(relativePath);
  } catch {
    return null;
  }
}
