/**
 * Postgres storage backend (Phase 4) — the cloud DB-backed implementation of the
 * structure read/write surface, parallel to lib/sqlite-storage.ts (local) and
 * lib/supabase-storage.ts (the current Storage-blob cloud backend):
 *   getManifestPg / writeManifestPg / getClientsPg
 *
 * Owns ONLY the relational structure (projects/rounds/concepts/versions/
 * annotations), in Postgres. HTML files stay in Supabase Storage exactly as the
 * Storage backend handles them — lib/storage keeps routing file ops there. See
 * CLOUD-FOUNDATION.md ("Path 2") and PHASE-4-DESIGN.md.
 *
 * Selected via DRIFTGRID_CLOUD_BACKEND=postgres (cloud mode only). Default
 * (unset) = the existing Supabase Storage backend, untouched — so production
 * behavior does not change until this flag is flipped on a DB that has the
 * Phase 1 + write_manifest migrations applied.
 *
 * Writes go through the write_manifest() plpgsql RPC, which is atomic
 * (decompose + upsert + prune in one transaction) — PostgREST/supabase-js has
 * no client-side transactions. The RPC is verified against real Postgres in
 * tests/postgres-storage.test.ts (incl. byte parity with the SQLite backend).
 * Tenancy is scoped by user_id on the projects query (the service-role admin
 * client bypasses RLS, so the explicit filter is the scope; RLS is defense in
 * depth for any non-admin caller).
 */

import { getSupabaseAdmin } from './supabase';
import type { Manifest, ClientInfo, ProjectInfo } from './types';
import { computeLastEditedAt } from './manifest';
import {
  rowsToManifest,
  type ManifestRowSet,
  type ProjectRow, type RoundRow, type ConceptRow, type VersionRow, type AnnotationRow,
} from './db/manifest-mapper';

// ===========================================================================
// READ
// ===========================================================================

export async function getManifestPg(userId: string, client: string, project: string): Promise<Manifest | null> {
  const supabase = getSupabaseAdmin();

  const { data: projectRow } = await supabase
    .from('projects').select('*')
    .eq('user_id', userId).eq('client_slug', client).eq('project_slug', project)
    .maybeSingle();
  if (!projectRow) return null;

  const { data: rounds } = await supabase.from('rounds').select('*').eq('project_id', projectRow.id);
  const roundIds = (rounds ?? []).map((r) => r.id);

  const { data: concepts } = roundIds.length
    ? await supabase.from('concepts').select('*').in('round_id', roundIds)
    : { data: [] as ConceptRow[] };
  const conceptIds = (concepts ?? []).map((c) => c.id);

  const { data: versions } = conceptIds.length
    ? await supabase.from('versions').select('*').in('concept_id', conceptIds)
    : { data: [] as VersionRow[] };
  const versionIds = (versions ?? []).map((v) => v.id);

  const { data: annotations } = versionIds.length
    ? await supabase.from('annotations').select('*').in('version_id', versionIds)
    : { data: [] as AnnotationRow[] };

  return rowsToManifest({
    project: projectRow as ProjectRow,
    rounds: (rounds ?? []) as RoundRow[],
    concepts: (concepts ?? []) as ConceptRow[],
    versions: (versions ?? []) as VersionRow[],
    annotations: (annotations ?? []) as AnnotationRow[],
  } as ManifestRowSet);
}

// ===========================================================================
// WRITE — one atomic RPC (decompose + upsert + prune, server-side transaction)
// ===========================================================================

export async function writeManifestPg(userId: string, client: string, project: string, manifest: Manifest): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc('write_manifest', {
    p_user: userId,
    p_client: client,
    p_project: project,
    p_manifest: manifest,
  });
  if (error) throw new Error(`write_manifest RPC failed: ${error.message}`);
}

// ===========================================================================
// LIST — getClients equivalent (mirrors lib/supabase-storage.getClientsCloud)
// ===========================================================================

export async function getClientsPg(userId: string): Promise<ClientInfo[]> {
  const supabase = getSupabaseAdmin();
  const { data: projectRows } = await supabase
    .from('projects').select('client_slug, project_slug')
    .eq('user_id', userId)
    .order('client_slug').order('project_slug');

  const byClient = new Map<string, ProjectInfo[]>();
  for (const { client_slug, project_slug } of (projectRows ?? [])) {
    const manifest = await getManifestPg(userId, client_slug, project_slug);
    if (!manifest) continue;
    const allConcepts = manifest.rounds?.length
      ? manifest.rounds.flatMap((r) => r.concepts || [])
      : manifest.concepts || [];
    const versionCount = allConcepts.reduce((sum, c) => sum + c.versions.length, 0);
    const info: ProjectInfo = {
      slug: project_slug,
      name: manifest.project.name,
      canvas: manifest.project.canvas,
      conceptCount: allConcepts.length,
      versionCount,
      lastEditedAt: computeLastEditedAt(manifest),
    };
    (byClient.get(client_slug) ?? byClient.set(client_slug, []).get(client_slug)!).push(info);
  }

  const clients: ClientInfo[] = [];
  for (const [clientSlug, projects] of byClient) {
    if (projects.length === 0) continue;
    // Cloud has no brand/guidelines.md on disk — derive the display name from the
    // slug, same as the Storage backend (getClientsCloud).
    const name = clientSlug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    clients.push({ slug: clientSlug, name, projects });
  }
  return clients;
}
