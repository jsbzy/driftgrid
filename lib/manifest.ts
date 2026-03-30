import { promises as fs } from 'fs';
import path from 'path';
import type { Manifest, ClientInfo, ProjectInfo } from './types';
import { conceptSlug } from './letters';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function getManifest(client: string, project: string): Promise<Manifest | null> {
  try {
    const manifestPath = path.join(PROJECTS_DIR, client, project, 'manifest.json');
    const data = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(data) as Manifest;
    // Backward compat: ensure rounds array exists
    if (!manifest.rounds) manifest.rounds = [];
    // Deduplicate versions within each concept (guard against double-write race conditions)
    for (const concept of manifest.concepts) {
      const seen = new Set<string>();
      concept.versions = concept.versions.filter(v => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
    }
    // Backfill concept slugs for existing projects
    for (const concept of manifest.concepts) {
      if (!concept.slug) {
        concept.slug = conceptSlug(concept.label);
      }
    }
    return manifest;
  } catch {
    return null;
  }
}

export async function writeManifest(client: string, project: string, manifest: Manifest): Promise<void> {
  const manifestPath = path.join(PROJECTS_DIR, client, project, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
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
          const versionCount = manifest.concepts.reduce((sum, c) => sum + c.versions.length, 0);
          projects.push({
            slug: projectSlug,
            name: manifest.project.name,
            canvas: manifest.project.canvas,
            conceptCount: manifest.concepts.length,
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
