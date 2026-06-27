/**
 * DriftGrid Sync (Phase: DB↔DB) — converge a project across two backends
 * (local SQLite ↔ cloud Postgres), git-style push/pull collapsed into one
 * idempotent reconcile. See CLOUD-FOUNDATION.md.
 *
 * Model — APPEND-MOSTLY UNION + metadata LAST-WRITE-WINS:
 *   - Versions are immutable (drift never overwrites — it adds a version). So the
 *     merge is a UNION of versions by manifest_id: a design that exists on either
 *     side survives. This is why sync is safe — no byte-merge, nothing lost.
 *   - Structural containers (rounds, concepts, annotations) likewise union by id.
 *   - MUTABLE metadata (names, order/position, starred, visible, status, selects,
 *     resolved flags, project meta) can genuinely conflict. We resolve with
 *     last-write-wins at PROJECT granularity: the side whose project row was
 *     updated more recently is the "winner" and its metadata wins for any row
 *     present on both sides. The other side's UNIQUE rows are still merged in.
 *
 * Granularity note: project-level LWW is coarse — if you star on the older side
 * and rename on the newer side in the same window, the older star loses (the
 * design itself is never lost, only the star). Field-level LWW needs per-row
 * updated_at columns; that's the documented next refinement. For now this is the
 * conservative, never-lose-a-design rule.
 *
 * mergeManifests is pure (no IO) and is the heavily-tested core. syncProject is
 * a thin orchestrator over two Stores so it works for any backend pair and is
 * testable without the cloud.
 */

import type { Manifest, Round, Concept, Version, Annotation, ProjectMeta } from './types';

// ---------------------------------------------------------------------------
// Pure merge
// ---------------------------------------------------------------------------

export interface MergeOptions {
  /** True ⇒ manifest A is the metadata winner (its project row is newer). */
  preferA: boolean;
}

/**
 * Union two lists keyed by id: items from the preferred side first (in their
 * order), then items only on the other side (in theirs). Shared ids are merged
 * via `mergeShared`. Preserves a deterministic, stable order.
 */
function unionById<T>(
  preferred: T[],
  other: T[],
  idOf: (t: T) => string,
  mergeShared: (pref: T, oth: T) => T,
): T[] {
  const otherById = new Map(other.map((x) => [idOf(x), x]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of preferred) {
    const id = idOf(p);
    seen.add(id);
    const o = otherById.get(id);
    out.push(o ? mergeShared(p, o) : p);
  }
  for (const o of other) {
    const id = idOf(o);
    if (!seen.has(id)) out.push(o);
  }
  return out;
}

const firstNonEmpty = (a: string | undefined | null, b: string | undefined | null): string =>
  (a && a.length ? a : b && b.length ? b : '') as string;
/** Earliest non-empty ISO string (creation times should converge to the oldest). */
const earliest = (a?: string, b?: string): string => {
  if (!a) return b ?? '';
  if (!b) return a;
  return a <= b ? a : b;
};

function mergeAnnotation(win: Annotation, lose: Annotation): Annotation {
  // Annotation body/author/coords are effectively immutable once posted; the
  // mutable bit is `resolved` (+ status/submittedAt). Winner decides those.
  return { ...lose, ...win, created: earliest(win.created, lose.created) };
}

function mergeAnnotations(winA: Annotation[] | undefined, winB: Annotation[] | undefined, preferA: boolean): Annotation[] | undefined {
  const a = winA ?? [], b = winB ?? [];
  if (a.length === 0 && b.length === 0) return undefined;
  const [pref, oth] = preferA ? [a, b] : [b, a];
  return unionById(pref, oth, (x) => x.id, (p, o) => mergeAnnotation(p, o));
}

function mergeVersion(win: Version, lose: Version, preferA: boolean, winIsA: boolean): Version {
  // Immutable: file, changelog, parentId, number, created, thumbnail (take the
  // non-empty / earliest). Mutable: starred, visible → winner. annotations → union.
  const annPref = winIsA; // winner's annotations are the preferred side for the union
  return {
    ...win,
    file: firstNonEmpty(win.file, lose.file),
    changelog: firstNonEmpty(win.changelog, lose.changelog),
    parentId: win.parentId ?? lose.parentId ?? null,
    thumbnail: firstNonEmpty(win.thumbnail, lose.thumbnail),
    created: earliest(win.created, lose.created),
    // starred/visible come from `win` already via spread (winner)
    annotations: mergeAnnotations(
      annPref ? win.annotations : lose.annotations,
      annPref ? lose.annotations : win.annotations,
      true,
    ),
  };
}

function mergeVersions(prefVs: Version[], othVs: Version[], preferA: boolean): Version[] {
  // Order by version.number (stable, matches manifest convention); union by id.
  const merged = unionById(prefVs, othVs, (v) => v.id, (p, o) => mergeVersion(p, o, preferA, true));
  return merged.slice().sort((x, y) => (x.number ?? 0) - (y.number ?? 0));
}

function mergeConcept(win: Concept, lose: Concept, preferA: boolean, winIsA: boolean): Concept {
  // Mutable (label/slug/description/position/visible/branchedFrom/canvas) → winner.
  // versions → union (winner's order preferred).
  const [prefVs, othVs] = winIsA ? [win.versions ?? [], lose.versions ?? []] : [win.versions ?? [], lose.versions ?? []];
  return {
    ...win,
    versions: mergeVersions(prefVs, othVs, preferA),
  };
}

function mergeRound(win: Round, lose: Round, preferA: boolean, winIsA: boolean): Round {
  const [prefCs, othCs] = [win.concepts ?? [], lose.concepts ?? []];
  return {
    ...win,
    createdAt: earliest(win.createdAt, lose.createdAt),
    concepts: unionById(prefCs, othCs, (c) => c.id, (p, o) => mergeConcept(p, o, preferA, winIsA)),
  };
}

/**
 * Merge two manifests into their convergent union. Either may be null (a project
 * that exists on only one side); returns the other, or null if both are null.
 */
export function mergeManifests(a: Manifest | null, b: Manifest | null, opts: MergeOptions): Manifest | null {
  if (!a) return b;
  if (!b) return a;
  const { preferA } = opts;
  const win = preferA ? a : b;
  const lose = preferA ? b : a;

  // project meta — winner's mutable fields, earliest creation
  const project: ProjectMeta = {
    ...win.project,
    created: earliest(a.project.created, b.project.created),
  };

  // rounds — union by id, winner's order first
  const rounds: Round[] = unionById(
    win.rounds ?? [],
    lose.rounds ?? [],
    (r) => r.id,
    (p, o) => mergeRound(p, o, preferA, preferA),
  );

  const latest = rounds[rounds.length - 1];
  const merged: Manifest = {
    project,
    rounds,
    concepts: latest ? latest.concepts : [],   // alias — same convention as the backends
    workingSets: win.workingSets ?? lose.workingSets ?? [],
    comments: win.comments ?? lose.comments ?? [],
    clientEdits: win.clientEdits ?? lose.clientEdits ?? [],
  };
  if (win.documents ?? lose.documents) merged.documents = win.documents ?? lose.documents;
  return merged;
}

// ---------------------------------------------------------------------------
// Orchestration over two backends
// ---------------------------------------------------------------------------

/** A backend a project can be synced against (local SQLite, cloud Postgres, …). */
export interface SyncStore {
  label: string;
  read(client: string, project: string): Promise<Manifest | null>;
  write(client: string, project: string, manifest: Manifest): Promise<void>;
  /** ms epoch of the project's last write, for LWW. 0 / null if the project is absent. */
  modifiedAt(client: string, project: string): Promise<number | null>;
}

export interface SyncResult {
  client: string;
  project: string;
  preferred: string;       // which store won metadata conflicts
  before: { a: number; b: number };  // version counts before
  after: number;            // version counts after (both sides equal)
  changed: boolean;
}

function countVersions(m: Manifest | null): number {
  if (!m) return 0;
  return (m.rounds ?? []).reduce((n, r) => n + (r.concepts ?? []).reduce((k, c) => k + (c.versions?.length ?? 0), 0), 0);
}

/**
 * Reconcile one project across two stores. Reads both, merges (append-mostly
 * union + project-level metadata LWW by modifiedAt), and writes the merged
 * result back to BOTH so they converge. Idempotent: a second run is a no-op.
 */
export async function syncProject(a: SyncStore, b: SyncStore, client: string, project: string): Promise<SyncResult> {
  const [ma, mb, ta, tb] = await Promise.all([
    a.read(client, project),
    b.read(client, project),
    a.modifiedAt(client, project),
    b.modifiedAt(client, project),
  ]);

  // Winner = more recently modified side. Absent side never wins. Tie → A.
  const preferA = (ta ?? 0) >= (tb ?? 0);
  const merged = mergeManifests(ma, mb, { preferA });

  const beforeA = countVersions(ma);
  const beforeB = countVersions(mb);
  const after = countVersions(merged);

  if (merged) {
    // Write to whichever side differs. Cheap correctness: write both (idempotent).
    await Promise.all([
      a.write(client, project, merged),
      b.write(client, project, merged),
    ]);
  }

  return {
    client,
    project,
    preferred: preferA ? a.label : b.label,
    before: { a: beforeA, b: beforeB },
    after,
    changed: after !== beforeA || after !== beforeB,
  };
}
