/**
 * Supabase Storage implementations for cloud mode.
 * Mirrors the filesystem functions in manifest.ts but reads/writes from Supabase Storage.
 * All paths are scoped to {userId}/{client}/{project}/...
 */

import { getSupabaseAdmin } from './supabase';
import type { Manifest, ClientInfo, ProjectInfo } from './types';
import { conceptSlug } from './letters';

const BUCKET = 'projects';

/** Read manifest.json from Supabase Storage */
export async function getManifestCloud(userId: string, client: string, project: string): Promise<Manifest | null> {
  const supabase = getSupabaseAdmin();
  const path = `${userId}/${client}/${project}/manifest.json`;

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;

  try {
    const text = await data.text();
    const manifest = JSON.parse(text) as Manifest;

    // Same normalization as filesystem manifest.ts
    if (!manifest.rounds) manifest.rounds = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topConcepts = (manifest as any).concepts as Manifest['concepts'] | undefined;
    if (topConcepts && topConcepts.length > 0 && manifest.rounds.length === 0) {
      manifest.rounds = [{
        id: 'round-1',
        number: 1,
        name: 'Round 1',
        createdAt: manifest.project.created || new Date().toISOString(),
        selects: [],
        concepts: topConcepts,
      }];
    }

    for (const round of manifest.rounds) {
      if (!round.concepts) round.concepts = [];
      if (!round.createdAt) round.createdAt = new Date().toISOString();
      for (const concept of round.concepts) {
        const seen = new Set<string>();
        concept.versions = concept.versions.filter(v => {
          if (seen.has(v.id)) return false;
          seen.add(v.id);
          return true;
        });
        if (!concept.slug) concept.slug = conceptSlug(concept.label);
      }
    }

    const latestRound = manifest.rounds[manifest.rounds.length - 1];
    manifest.concepts = latestRound ? latestRound.concepts : [];

    return manifest;
  } catch {
    return null;
  }
}

/** Write manifest.json to Supabase Storage */
export async function writeManifestCloud(userId: string, client: string, project: string, manifest: Manifest): Promise<void> {
  const supabase = getSupabaseAdmin();
  const path = `${userId}/${client}/${project}/manifest.json`;
  // Strip concepts alias before writing
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { concepts: _alias, ...rest } = manifest;
  const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true });
}

/** List all clients and projects for a user from Supabase Storage */
export async function getClientsCloud(userId: string): Promise<ClientInfo[]> {
  const supabase = getSupabaseAdmin();
  const clients: ClientInfo[] = [];

  // List client folders
  const { data: clientFolders } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
  if (!clientFolders) return [];

  for (const clientFolder of clientFolders) {
    if (!clientFolder.name || clientFolder.name.startsWith('.')) continue;
    const clientSlug = clientFolder.name;

    // List project folders within each client
    const { data: projectFolders } = await supabase.storage.from(BUCKET).list(`${userId}/${clientSlug}`, { limit: 100 });
    if (!projectFolders) continue;

    const projects: ProjectInfo[] = [];
    for (const projFolder of projectFolders) {
      if (!projFolder.name || projFolder.name === 'brand' || projFolder.name.startsWith('.')) continue;

      const manifest = await getManifestCloud(userId, clientSlug, projFolder.name);
      if (!manifest) continue;

      const allConcepts = manifest.rounds?.length
        ? manifest.rounds.flatMap(r => r.concepts || [])
        : manifest.concepts || [];
      const versionCount = allConcepts.reduce((sum, c) => sum + c.versions.length, 0);

      projects.push({
        slug: projFolder.name,
        name: manifest.project.name,
        canvas: manifest.project.canvas,
        conceptCount: allConcepts.length,
        versionCount,
      });
    }

    if (projects.length > 0) {
      const name = clientSlug
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      clients.push({ slug: clientSlug, name, projects });
    }
  }

  return clients;
}

/** Read an HTML file from Supabase Storage */
export async function getHtmlFileCloud(userId: string, client: string, project: string, filePath: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const path = `${userId}/${client}/${project}/${filePath}`;

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return await data.text();
}

/** Read a binary asset (thumbnail, image) from Supabase Storage */
export async function getAssetCloud(userId: string, client: string, project: string, filePath: string): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  const path = `${userId}/${client}/${project}/${filePath}`;

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
