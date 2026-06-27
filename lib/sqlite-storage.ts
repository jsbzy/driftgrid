/**
 * SQLite storage backend (Phase 1) — the DB-backed implementation of the same
 * read/write surface lib/manifest.ts exposes for the file model:
 *   getManifestDb / writeManifestDb / getClientsDb
 *
 * It owns ONLY the relational structure (projects/rounds/concepts/versions/
 * annotations). HTML files stay on disk exactly as before — lib/storage.ts
 * keeps routing file ops (writeHtmlFile/copyFile/getHtmlFile/getAsset) to the
 * filesystem even when this backend is active. See CLOUD-FOUNDATION.md ("Path 2").
 *
 * Selected via DRIFTGRID_DB_BACKEND=sqlite. Additive and off by default — the
 * file backend remains the default and is untouched.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import type { Manifest, ClientInfo, ProjectInfo } from './types';
import { computeLastEditedAt } from './manifest';
import { getDb, type Db } from './db/sqlite';
import {
  rowsToManifest,
  type ProjectRow, type RoundRow, type ConceptRow, type VersionRow, type AnnotationRow,
} from './db/manifest-mapper';

const PROJECTS_DIR = () => path.join(process.cwd(), 'projects');
const nowIso = () => new Date().toISOString();
const b = (v: boolean | undefined) => (v ? 1 : 0);
const json = (v: unknown) => (v == null ? null : JSON.stringify(v));

// Keys each level decomposes into typed columns. Anything else on the source
// object is untyped legacy data (e.g. round.description, round.savedAt) and is
// preserved verbatim in the row's `extras` jsonb so nothing is silently lost.
const ROUND_KEYS = new Set(['id', 'number', 'name', 'createdAt', 'closedAt', 'note', 'documentIds', 'summaryDocumentId', 'selects', 'concepts']);
const CONCEPT_KEYS = new Set(['id', 'slug', 'label', 'description', 'position', 'visible', 'branchedFrom', 'canvas', 'versions']);
const VERSION_KEYS = new Set(['id', 'number', 'file', 'parentId', 'changelog', 'visible', 'starred', 'created', 'thumbnail', 'annotations']);
const ANNOTATION_KEYS = new Set(['id', 'x', 'y', 'element', 'text', 'author', 'isClient', 'isAgent', 'created', 'resolved', 'parentId', 'status', 'submittedAt', 'attachments', 'provider']);

/** JSON of any keys on `obj` not in `known` (the lossless overflow). '{}' if none. */
function extrasOf(obj: object, known: Set<string>): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!known.has(k)) out[k] = v;
  return JSON.stringify(out);
}

/** Look up a row id by natural key, or mint a new uuid. */
function idFor(db: Db, sql: string, params: unknown[]): string {
  const row = db.prepare(sql).get(...params) as { id: string } | undefined;
  return row?.id ?? randomUUID();
}

// ===========================================================================
// READ
// ===========================================================================

export async function getManifestDb(client: string, project: string): Promise<Manifest | null> {
  const db = await getDb();
  const projectRow = db.prepare(
    `select * from projects where client_slug = ? and project_slug = ?`,
  ).get(client, project) as ProjectRow | undefined;
  if (!projectRow) return null;

  const rounds = db.prepare(`select * from rounds where project_id = ?`).all(projectRow.id) as RoundRow[];
  const roundIds = rounds.map((r) => r.id);

  const concepts = roundIds.length
    ? db.prepare(`select * from concepts where round_id in (${roundIds.map(() => '?').join(',')})`).all(...roundIds) as ConceptRow[]
    : [];
  const conceptIds = concepts.map((c) => c.id);

  const versions = conceptIds.length
    ? db.prepare(`select * from versions where concept_id in (${conceptIds.map(() => '?').join(',')})`).all(...conceptIds) as VersionRow[]
    : [];
  const versionIds = versions.map((v) => v.id);

  const annotations = versionIds.length
    ? db.prepare(`select * from annotations where version_id in (${versionIds.map(() => '?').join(',')})`).all(...versionIds) as AnnotationRow[]
    : [];

  return rowsToManifest({ project: projectRow, rounds, concepts, versions, annotations });
}

// ===========================================================================
// WRITE — decompose a Manifest into rows (transactional upsert + prune)
// ===========================================================================

export async function writeManifestDb(client: string, project: string, manifest: Manifest): Promise<void> {
  const db = await getDb();
  const ts = nowIso();

  const tx = db.transaction(() => {
    // ---- project ----
    const projectId = idFor(db, `select id from projects where client_slug = ? and project_slug = ?`, [client, project]);
    const extras = {
      workingSets: manifest.workingSets,
      documents: manifest.documents,
      comments: manifest.comments,
      clientEdits: manifest.clientEdits,
    };
    db.prepare(
      `insert into projects (id, user_id, client_slug, project_slug, name, canvas, output, links, created, extras, created_at, updated_at)
       values (@id, @user_id, @client_slug, @project_slug, @name, @canvas, @output, @links, @created, @extras, @created_at, @updated_at)
       on conflict (client_slug, project_slug) do update set
         user_id=excluded.user_id, name=excluded.name, canvas=excluded.canvas, output=excluded.output,
         links=excluded.links, created=excluded.created, extras=excluded.extras, updated_at=excluded.updated_at`,
    ).run({
      id: projectId,
      user_id: manifest.project.userId ?? null,
      client_slug: client,
      project_slug: project,
      name: manifest.project.name,
      canvas: manifest.project.canvas,
      output: manifest.project.output ?? null,
      links: JSON.stringify(manifest.project.links ?? {}),
      created: manifest.project.created ?? null,
      extras: JSON.stringify(extras),
      created_at: ts,
      updated_at: ts,
    });

    // Iterate the rounds (NEVER the manifest.concepts alias — rounds own the
    // concepts). Legacy/new manifests may carry top-level concepts with empty
    // rounds (e.g. fresh create-project); wrap those into round-1 exactly as
    // lib/manifest.getManifest does on read, so the concept isn't dropped.
    const roundsToWrite = (manifest.rounds && manifest.rounds.length)
      ? manifest.rounds
      : (manifest.concepts && manifest.concepts.length)
        ? [{
            id: 'round-1',
            number: 1,
            name: 'Round 1',
            createdAt: manifest.project.created || nowIso(),
            selects: [],
            concepts: manifest.concepts,
          }]
        : [];
    const keptRoundIds: string[] = [];
    for (const [roundOrd, round] of roundsToWrite.entries()) {
      // Legacy manifests can have a round with no `id` (old shape). Synthesize a
      // deterministic manifest_id so the backfill never crashes; the original
      // legacy keys (label/created/…) are preserved verbatim in `extras`.
      const roundMid = round.id ?? `round-${round.number ?? roundOrd + 1}`;
      const roundId = idFor(db, `select id from rounds where project_id = ? and manifest_id = ?`, [projectId, roundMid]);
      keptRoundIds.push(roundId);
      db.prepare(
        `insert into rounds (id, project_id, manifest_id, ord, number, name, status, note, created, closed_at, selects, document_ids, summary_document_id, extras, created_at)
         values (@id, @project_id, @manifest_id, @ord, @number, @name, @status, @note, @created, @closed_at, @selects, @document_ids, @summary_document_id, @extras, @created_at)
         on conflict (project_id, manifest_id) do update set
           ord=excluded.ord, number=excluded.number, name=excluded.name, status=excluded.status, note=excluded.note,
           created=excluded.created, closed_at=excluded.closed_at, selects=excluded.selects,
           document_ids=excluded.document_ids, summary_document_id=excluded.summary_document_id, extras=excluded.extras`,
      ).run({
        id: roundId,
        project_id: projectId,
        manifest_id: roundMid,
        ord: roundOrd,
        number: round.number ?? 0,
        name: round.name ?? '',
        status: round.closedAt ? 'closed' : 'open',
        note: round.note ?? null,
        created: round.createdAt ?? null,
        closed_at: round.closedAt ?? null,
        selects: JSON.stringify(round.selects ?? []),
        document_ids: json(round.documentIds),
        summary_document_id: round.summaryDocumentId ?? null,
        extras: extrasOf(round, ROUND_KEYS),
        created_at: ts,
      });

      const keptConceptIds: string[] = [];
      for (const [conceptOrd, concept] of (round.concepts ?? []).entries()) {
        const conceptMid = concept.id ?? `concept-${conceptOrd}`;
        const conceptId = idFor(db, `select id from concepts where round_id = ? and manifest_id = ?`, [roundId, conceptMid]);
        keptConceptIds.push(conceptId);
        db.prepare(
          `insert into concepts (id, round_id, manifest_id, ord, slug, label, description, position, visible, branched_from, canvas, extras, created_at)
           values (@id, @round_id, @manifest_id, @ord, @slug, @label, @description, @position, @visible, @branched_from, @canvas, @extras, @created_at)
           on conflict (round_id, manifest_id) do update set
             ord=excluded.ord, slug=excluded.slug, label=excluded.label, description=excluded.description, position=excluded.position,
             visible=excluded.visible, branched_from=excluded.branched_from, canvas=excluded.canvas, extras=excluded.extras`,
        ).run({
          id: conceptId,
          round_id: roundId,
          manifest_id: conceptMid,
          ord: conceptOrd,
          slug: concept.slug ?? null,
          label: concept.label ?? '',
          description: concept.description ?? '',
          position: concept.position ?? 0,
          visible: b(concept.visible ?? true),
          branched_from: json(concept.branchedFrom),
          canvas: json(concept.canvas),
          extras: extrasOf(concept, CONCEPT_KEYS),
          created_at: ts,
        });

        const keptVersionIds: string[] = [];
        for (const [versionOrd, version] of (concept.versions ?? []).entries()) {
          const versionMid = version.id ?? `v-${versionOrd}`;
          const versionId = idFor(db, `select id from versions where concept_id = ? and manifest_id = ?`, [conceptId, versionMid]);
          keptVersionIds.push(versionId);
          db.prepare(
            `insert into versions (id, concept_id, manifest_id, ord, number, file_path, parent_id, changelog, visible, starred, thumbnail, created, extras, created_at)
             values (@id, @concept_id, @manifest_id, @ord, @number, @file_path, @parent_id, @changelog, @visible, @starred, @thumbnail, @created, @extras, @created_at)
             on conflict (concept_id, manifest_id) do update set
               ord=excluded.ord, number=excluded.number, file_path=excluded.file_path, parent_id=excluded.parent_id, changelog=excluded.changelog,
               visible=excluded.visible, starred=excluded.starred, thumbnail=excluded.thumbnail, created=excluded.created, extras=excluded.extras`,
          ).run({
            id: versionId,
            concept_id: conceptId,
            manifest_id: versionMid,
            ord: versionOrd,
            number: version.number ?? 0,
            file_path: version.file ?? '',
            parent_id: version.parentId ?? null,
            changelog: version.changelog ?? '',
            visible: b(version.visible ?? true),
            starred: b(version.starred ?? false),
            thumbnail: version.thumbnail ?? null,
            created: version.created ?? null,
            extras: extrasOf(version, VERSION_KEYS),
            created_at: ts,
          });

          const keptAnnIds: string[] = [];
          for (const [annOrd, ann] of (version.annotations ?? []).entries()) {
            const annMid = ann.id ?? `a-${annOrd}`;
            const annId = idFor(db, `select id from annotations where version_id = ? and manifest_id = ?`, [versionId, annMid]);
            keptAnnIds.push(annId);
            db.prepare(
              `insert into annotations (id, version_id, manifest_id, ord, x, y, element, body, author, is_client, is_agent, resolved, parent_id, status, submitted_at, attachments, provider, created, extras, created_at)
               values (@id, @version_id, @manifest_id, @ord, @x, @y, @element, @body, @author, @is_client, @is_agent, @resolved, @parent_id, @status, @submitted_at, @attachments, @provider, @created, @extras, @created_at)
               on conflict (version_id, manifest_id) do update set
                 ord=excluded.ord, x=excluded.x, y=excluded.y, element=excluded.element, body=excluded.body, author=excluded.author,
                 is_client=excluded.is_client, is_agent=excluded.is_agent, resolved=excluded.resolved, parent_id=excluded.parent_id,
                 status=excluded.status, submitted_at=excluded.submitted_at, attachments=excluded.attachments, provider=excluded.provider, created=excluded.created, extras=excluded.extras`,
            ).run({
              id: annId,
              version_id: versionId,
              manifest_id: annMid,
              ord: annOrd,
              x: ann.x,
              y: ann.y,
              element: ann.element ?? null,
              body: ann.text ?? '',
              author: ann.author ?? '',
              is_client: b(ann.isClient),
              is_agent: b(ann.isAgent),
              resolved: b(ann.resolved),
              parent_id: ann.parentId ?? null,
              status: ann.status ?? null,
              submitted_at: ann.submittedAt ?? null,
              attachments: json(ann.attachments),
              provider: ann.provider ?? null,
              created: ann.created ?? null,
              extras: extrasOf(ann, ANNOTATION_KEYS),
              created_at: ts,
            });
          }
          prune(db, 'annotations', 'version_id', versionId, keptAnnIds);
        }
        prune(db, 'versions', 'concept_id', conceptId, keptVersionIds);
      }
      prune(db, 'concepts', 'round_id', roundId, keptConceptIds);
    }
    prune(db, 'rounds', 'project_id', projectId, keptRoundIds);
  });

  tx();
}

/** Delete child rows under `parent` whose id is not in `keep` (handles removals). */
function prune(db: Db, table: string, parentCol: string, parentId: string, keep: string[]): void {
  if (keep.length === 0) {
    db.prepare(`delete from ${table} where ${parentCol} = ?`).run(parentId);
    return;
  }
  const placeholders = keep.map(() => '?').join(',');
  db.prepare(`delete from ${table} where ${parentCol} = ? and id not in (${placeholders})`).run(parentId, ...keep);
}

// ===========================================================================
// LIST — getClients equivalent (mirrors lib/manifest.getClients output)
// ===========================================================================

export async function getClientsDb(): Promise<ClientInfo[]> {
  const db = await getDb();
  const projectRows = db.prepare(
    `select client_slug, project_slug from projects order by client_slug, project_slug`,
  ).all() as { client_slug: string; project_slug: string }[];

  const byClient = new Map<string, ProjectInfo[]>();
  for (const { client_slug, project_slug } of projectRows) {
    const manifest = await getManifestDb(client_slug, project_slug);
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
    let name = clientSlug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    // Same brand-name derivation as the file backend.
    try {
      const guidelines = await fs.readFile(path.join(PROJECTS_DIR(), clientSlug, 'brand', 'guidelines.md'), 'utf-8');
      const heading = guidelines.match(/^#\s+(.+?)(?:\s+Brand)?\s+(?:Guidelines|Guide)/m);
      if (heading) name = heading[1].trim();
    } catch { /* no guidelines file */ }
    clients.push({ slug: clientSlug, name, projects });
  }
  return clients;
}
