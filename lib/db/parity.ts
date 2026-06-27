/**
 * Manifest parity checking (Phase 2 migration safety).
 *
 * Compares two manifests for structural equality, tolerating the benign
 * presence/default differences between the legacy file model and the relational
 * DB backend. Used by bin/migrate-to-db.ts to prove every project round-trips
 * before anything depends on the DB.
 *
 * What's compared: project + documents + the full rounds/concepts/versions/
 * annotations hierarchy. What's tolerated (semantically equal, NOT data loss):
 *   - the derived `concepts` alias and top-level workingSets/comments/clientEdits
 *     defaults (compared via the canonical projection below, which omits them);
 *   - optional leaf fields the legacy data stores inconsistently as empty vs
 *     absent (thumbnail "", annotations [], description "", parentId null, …);
 *   - numeric/boolean defaults for fields legacy manifests omit (position 0,
 *     visible true).
 */

import type { Manifest } from '../types';

// Optional leaf fields whose empty/absent forms are equivalent.
const EMPTY_OPTIONAL = new Set([
  'thumbnail', 'annotations', 'documentIds', 'attachments',
  'description', 'changelog', 'parentId', 'note',
]);

/** Recursively sort keys + drop benign empty/default optionals → order-insensitive. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (EMPTY_OPTIONAL.has(k) && (val == null || val === '' || (Array.isArray(val) && val.length === 0))) continue;
      if (k === 'position' && val === 0) continue;    // absent position defaults to 0
      if (k === 'visible' && val === true) continue;  // absent visible defaults to true
      out[k] = canon(val);
    }
    return out;
  }
  return v;
}

/** Canonical projection of the load-bearing structure, as a stable JSON string. */
export function canonicalManifest(m: Manifest): string {
  return JSON.stringify(canon({
    project: m.project,
    documents: m.documents ?? null,
    rounds: m.rounds,
  }));
}

export interface ParityResult {
  equal: boolean;
  /** Character offset of the first divergence (for debugging), or -1 if equal. */
  firstDiff: number;
  /** Context around the first divergence in each side. */
  aContext?: string;
  bContext?: string;
}

/** Compare two manifests for structural parity (a = baseline/file, b = DB). */
export function compareManifests(a: Manifest, b: Manifest): ParityResult {
  const ca = canonicalManifest(a);
  const cb = canonicalManifest(b);
  if (ca === cb) return { equal: true, firstDiff: -1 };
  let i = 0;
  const max = Math.max(ca.length, cb.length);
  while (i < max && ca[i] === cb[i]) i++;
  return {
    equal: false,
    firstDiff: i,
    aContext: ca.slice(Math.max(0, i - 60), i + 60),
    bContext: cb.slice(Math.max(0, i - 60), i + 60),
  };
}
