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
    if (!manifest.documents) manifest.documents = [];

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

/**
 * How many rotating manifest backups to keep on disk (manifest.json.bak-<ts>).
 * Free local recovery if a write goes sideways. The current manifest itself is
 * already protected by the temp-file+rename below; .baks are for "the agent
 * mis-wrote something logically valid" cases that survive validation.
 */
const MANIFEST_BACKUP_KEEP = 5;

async function rotateManifestBackups(projectDir: string): Promise<void> {
  try {
    const manifestPath = path.join(projectDir, 'manifest.json');
    // Skip if there's no current manifest to back up (first-write case).
    try { await fs.stat(manifestPath); } catch { return; }

    const ts = Date.now();
    const bakPath = path.join(projectDir, `manifest.json.bak-${ts}`);
    await fs.copyFile(manifestPath, bakPath);

    // Prune oldest beyond the keep limit. Auto-rotation only touches files we
    // created (matching `manifest.json.bak-<digits>`); user-named .bak files
    // like `manifest.json.bak-pre-r7-v4` are left untouched.
    const entries = await fs.readdir(projectDir);
    const ours = entries
      .filter(name => /^manifest\.json\.bak-\d+$/.test(name))
      .sort(); // lexicographic on `bak-<ts>` is chronological
    const excess = ours.length - MANIFEST_BACKUP_KEEP;
    for (let i = 0; i < excess; i++) {
      await fs.unlink(path.join(projectDir, ours[i])).catch(() => {});
    }
  } catch {
    // Backup failures should never block a write — log? noop for now.
  }
}

export async function writeManifest(client: string, project: string, manifest: Manifest): Promise<void> {
  const projectDir = path.join(PROJECTS_DIR, client, project);
  const manifestPath = path.join(projectDir, 'manifest.json');
  const tmpPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;

  // Strip top-level concepts alias before writing — rounds own the concepts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { concepts: _alias, ...rest } = manifest;
  const payload = JSON.stringify(rest, null, 2);

  // Snapshot the current manifest first; cheap and saves us next time we screw up.
  await rotateManifestBackups(projectDir);

  // Atomic write: temp file + rename. POSIX rename is atomic so a crash mid-write
  // (HMR reload, Ctrl+C, SIGKILL) leaves the previous manifest intact instead of
  // a truncated file. Cleans up the temp file on failure.
  try {
    await fs.writeFile(tmpPath, payload, 'utf-8');
    await fs.rename(tmpPath, manifestPath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
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
