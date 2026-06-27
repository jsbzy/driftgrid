/**
 * Manifest <-> relational-rows mapping (Phase 1).
 *
 * Pure functions, no IO. The SQLite/Postgres backends decompose a Manifest into
 * row payloads on write and reconstruct a Manifest from rows on read. The
 * reconstructed Manifest matches the shape the file backend (lib/manifest.ts)
 * returns, including the `concepts` alias pointing at the latest round.
 *
 * Row field names use the DB's snake_case columns. Booleans arrive from SQLite
 * as 0/1; JSON columns arrive as strings.
 */

import type {
  Manifest, Round, Concept, Version, Annotation, ProjectMeta,
} from '../types';

// ---- Raw row shapes (as read back from the DB) ---------------------------

export interface ProjectRow {
  id: string;
  user_id: string | null;
  client_slug: string;
  project_slug: string;
  name: string;
  canvas: string;
  output: string | null;
  links: string;          // json
  created: string | null;
  extras: string;         // json: { workingSets?, documents?, comments?, clientEdits? }
}

export interface RoundRow {
  id: string;
  project_id: string;
  manifest_id: string;
  ord: number;
  number: number;
  name: string;
  status: string;
  note: string | null;
  created: string | null;
  closed_at: string | null;
  selects: string;        // json
  document_ids: string | null;  // json
  summary_document_id: string | null;
  extras: string;         // json: untyped overflow keys
}

export interface ConceptRow {
  id: string;
  round_id: string;
  manifest_id: string;
  ord: number;
  slug: string | null;
  label: string;
  description: string;
  position: number;
  visible: number;        // 0/1
  branched_from: string | null;  // json
  canvas: string | null;         // json
  extras: string;         // json: untyped overflow keys
}

export interface VersionRow {
  id: string;
  concept_id: string;
  manifest_id: string;
  ord: number;
  number: number;
  file_path: string;
  parent_id: string | null;
  changelog: string;
  visible: number;        // 0/1
  starred: number;        // 0/1
  thumbnail: string | null;
  created: string | null;
  extras: string;         // json: untyped overflow keys
}

export interface AnnotationRow {
  id: string;
  version_id: string;
  manifest_id: string;
  ord: number;
  x: number | null;
  y: number | null;
  element: string | null;
  body: string;
  author: string;
  is_client: number;      // 0/1
  is_agent: number;       // 0/1
  resolved: number;       // 0/1
  parent_id: string | null;
  status: string | null;
  submitted_at: string | null;
  attachments: string | null;  // json
  provider: string | null;
  created: string | null;
  extras: string;         // json: untyped overflow keys
}

export interface ManifestRowSet {
  project: ProjectRow;
  rounds: RoundRow[];
  concepts: ConceptRow[];
  versions: VersionRow[];
  annotations: AnnotationRow[];
}

// ---- helpers --------------------------------------------------------------

const bool = (n: number | boolean | null | undefined): boolean => n === 1 || n === true;

/**
 * Dual-encoding JSON read. SQLite stores JSON columns as TEXT (parse the string);
 * Postgres jsonb columns arrive already-parsed as JS objects/arrays (pass through).
 * Both backends feed the same rowsToManifest, so this must accept both.
 */
function parseJson<T>(s: unknown, fallback: T): T {
  if (s == null) return fallback;
  if (typeof s !== 'string') return s as T;   // already-parsed jsonb (Postgres)
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Merge the row's untyped overflow keys back onto the reconstructed object. */
function withExtras<T extends object>(obj: T, extras: string): T {
  return Object.assign(obj, parseJson<Record<string, unknown>>(extras, {}));
}

// ===========================================================================
// READ: rows -> Manifest  (matches lib/manifest.getManifest output shape)
// ===========================================================================

export function rowsToManifest(rs: ManifestRowSet): Manifest {
  const p = rs.project;

  const project: ProjectMeta = {
    name: p.name,
    slug: p.project_slug,
    client: p.client_slug,
    canvas: p.canvas,
    created: p.created ?? '',
    links: parseJson(p.links, {}),
  };
  if (p.output) project.output = p.output as ProjectMeta['output'];
  if (p.user_id) project.userId = p.user_id;

  // Index children by parent for O(n) assembly.
  const conceptsByRound = new Map<string, ConceptRow[]>();
  for (const c of rs.concepts) {
    (conceptsByRound.get(c.round_id) ?? conceptsByRound.set(c.round_id, []).get(c.round_id)!).push(c);
  }
  const versionsByConcept = new Map<string, VersionRow[]>();
  for (const v of rs.versions) {
    (versionsByConcept.get(v.concept_id) ?? versionsByConcept.set(v.concept_id, []).get(v.concept_id)!).push(v);
  }
  const annotationsByVersion = new Map<string, AnnotationRow[]>();
  for (const a of rs.annotations) {
    (annotationsByVersion.get(a.version_id) ?? annotationsByVersion.set(a.version_id, []).get(a.version_id)!).push(a);
  }

  const rounds: Round[] = [...rs.rounds]
    .sort((a, b) => a.ord - b.ord)
    .map((r) => {
      const concepts: Concept[] = (conceptsByRound.get(r.id) ?? [])
        .sort((a, b) => a.ord - b.ord)
        .map((c) => buildConcept(c, versionsByConcept.get(c.id) ?? [], annotationsByVersion));

      const round: Round = {
        id: r.manifest_id,
        number: r.number,
        name: r.name,
        createdAt: r.created ?? '',
        selects: parseJson(r.selects, [] as Round['selects']),
        concepts,
      };
      if (r.closed_at) round.closedAt = r.closed_at;
      if (r.note) round.note = r.note;
      const docIds = parseJson<string[] | null>(r.document_ids, null);
      if (docIds && docIds.length) round.documentIds = docIds;
      if (r.summary_document_id) round.summaryDocumentId = r.summary_document_id;
      return withExtras(round, r.extras);
    });

  const latest = rounds[rounds.length - 1];

  const extras = parseJson<Partial<Pick<Manifest, 'workingSets' | 'documents' | 'comments' | 'clientEdits'>>>(p.extras, {});

  const manifest: Manifest = {
    project,
    rounds,
    concepts: latest ? latest.concepts : [],  // alias — same as file backend
    workingSets: extras.workingSets ?? [],
    comments: extras.comments ?? [],
    clientEdits: extras.clientEdits ?? [],
  };
  if (extras.documents) manifest.documents = extras.documents;
  return manifest;
}

function buildConcept(
  c: ConceptRow,
  versionRows: VersionRow[],
  annotationsByVersion: Map<string, AnnotationRow[]>,
): Concept {
  const versions: Version[] = [...versionRows]
    .sort((a, b) => a.ord - b.ord)
    .map((v) => buildVersion(v, annotationsByVersion.get(v.id) ?? []));

  const concept: Concept = {
    id: c.manifest_id,
    label: c.label,
    description: c.description,
    position: c.position,
    visible: bool(c.visible),
    versions,
  };
  if (c.slug) concept.slug = c.slug;
  const branched = parseJson<Concept['branchedFrom'] | null>(c.branched_from, null);
  if (branched) concept.branchedFrom = branched;
  const canvas = parseJson<Concept['canvas'] | null>(c.canvas, null);
  if (canvas != null) concept.canvas = canvas;
  return withExtras(concept, c.extras);
}

function buildVersion(v: VersionRow, annotationRows: AnnotationRow[]): Version {
  const version: Version = {
    id: v.manifest_id,
    number: v.number,
    file: v.file_path,
    parentId: v.parent_id ?? null,
    changelog: v.changelog,
    visible: bool(v.visible),
    starred: bool(v.starred),
    created: v.created ?? '',
    // thumbnail is a required field on Version but is conventionally derived
    // (.thumbs/${concept}-${version}.webp) and slated for deprecation. We always
    // emit it as a string (type-correct); an empty value is equivalent to absent
    // and triggers regen-by-convention. See PHASE-1-NOTES.md (benign normalization).
    thumbnail: v.thumbnail ?? '',
  };

  if (annotationRows.length) {
    version.annotations = [...annotationRows]
      .sort((a, b) => a.ord - b.ord)
      .map(buildAnnotation);
  }
  return withExtras(version, v.extras);
}

function buildAnnotation(a: AnnotationRow): Annotation {
  const ann: Annotation = {
    id: a.manifest_id,
    x: a.x,
    y: a.y,
    element: a.element,
    text: a.body,
    author: a.author,
    isClient: bool(a.is_client),
    isAgent: bool(a.is_agent),
    created: a.created ?? '',
    resolved: bool(a.resolved),
    parentId: a.parent_id ?? null,
  };
  if (a.status === 'running') ann.status = 'running';
  if (a.submitted_at) ann.submittedAt = a.submitted_at;
  const attachments = parseJson<string[] | null>(a.attachments, null);
  if (attachments && attachments.length) ann.attachments = attachments;
  if (a.provider) ann.provider = a.provider;
  return withExtras(ann, a.extras);
}
