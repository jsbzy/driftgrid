/**
 * Lightweight runtime validation for the manifest write path.
 *
 * Goal: catch the catastrophic-payload cases that drove past corruption —
 * empty/missing `rounds`, missing required IDs, dropped concepts — BEFORE
 * they overwrite the on-disk manifest. Accepts anything that's structurally
 * plausible; doesn't try to enforce full type discipline (we have TS for that).
 *
 * Why not zod: avoids adding a runtime dep, and the schema is small enough
 * that a handful of checks is clearer than the equivalent zod definition.
 *
 * On rejection: caller saves the offending payload to a rejected-<ts>.json so
 * the original write can be recovered/inspected without touching the live
 * manifest.
 */

import type { Manifest } from './types';

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * Validate a manifest payload before writing. Returns a list of structural
 * problems if any. The checks are intentionally minimal — only what would
 * have prevented previous incidents.
 */
export function validateManifestForWrite(manifest: unknown): ValidationResult {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['manifest is not an object'] };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = manifest as any;

  // project metadata
  if (!m.project || typeof m.project !== 'object') {
    errors.push('manifest.project is missing or not an object');
  } else {
    if (typeof m.project.name !== 'string') errors.push('manifest.project.name must be a string');
    if (typeof m.project.slug !== 'string') errors.push('manifest.project.slug must be a string');
    if (typeof m.project.client !== 'string') errors.push('manifest.project.client must be a string');
    if (m.project.canvas == null) errors.push('manifest.project.canvas is missing');
  }

  // rounds (the canonical concept container)
  if (m.rounds !== undefined && !Array.isArray(m.rounds)) {
    errors.push('manifest.rounds must be an array');
  }
  const rounds = Array.isArray(m.rounds) ? m.rounds : [];

  // top-level concepts (legacy alias; may exist on legacy projects)
  if (m.concepts !== undefined && !Array.isArray(m.concepts)) {
    errors.push('manifest.concepts must be an array');
  }
  const topConcepts = Array.isArray(m.concepts) ? m.concepts : [];

  // The project must contain at least one concept somewhere — otherwise
  // we're staring at "manifest got truncated to empty" corruption.
  const hasAnyConcept = rounds.some((r: { concepts?: unknown[] }) => Array.isArray(r.concepts) && r.concepts.length > 0)
    || topConcepts.length > 0;
  if (!hasAnyConcept) {
    errors.push('manifest has no concepts in any round and no top-level concepts (likely truncation)');
  }

  // Per-round shape
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (!r || typeof r !== 'object') {
      errors.push(`rounds[${i}] is not an object`);
      continue;
    }
    if (typeof r.id !== 'string' || !r.id) errors.push(`rounds[${i}].id is missing`);
    if (typeof r.number !== 'number') errors.push(`rounds[${i}].number is not a number`);
    if (!Array.isArray(r.concepts)) {
      errors.push(`rounds[${i}].concepts must be an array`);
      continue;
    }
    // Per-concept shape — light
    const seenConceptIds = new Set<string>();
    for (let j = 0; j < r.concepts.length; j++) {
      const c = r.concepts[j];
      if (!c || typeof c !== 'object') {
        errors.push(`rounds[${i}].concepts[${j}] is not an object`);
        continue;
      }
      if (typeof c.id !== 'string' || !c.id) {
        errors.push(`rounds[${i}].concepts[${j}].id is missing`);
      } else if (seenConceptIds.has(c.id)) {
        errors.push(`rounds[${i}].concepts[${j}].id duplicates within round (${c.id})`);
      } else {
        seenConceptIds.add(c.id);
      }
      if (!Array.isArray(c.versions)) {
        errors.push(`rounds[${i}].concepts[${j}].versions must be an array`);
        continue;
      }
      const seenVersionIds = new Set<string>();
      for (let k = 0; k < c.versions.length; k++) {
        const v = c.versions[k];
        if (!v || typeof v !== 'object') {
          errors.push(`rounds[${i}].concepts[${j}].versions[${k}] is not an object`);
          continue;
        }
        if (typeof v.id !== 'string' || !v.id) {
          errors.push(`rounds[${i}].concepts[${j}].versions[${k}].id is missing`);
        } else if (seenVersionIds.has(v.id)) {
          errors.push(`duplicate version.id "${v.id}" in concept ${c.id ?? '?'} round ${r.id ?? i}`);
        } else {
          seenVersionIds.add(v.id);
        }
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/** Type-narrowed accessor for callers that already validated. */
export function assertValidManifest(manifest: unknown): asserts manifest is Manifest {
  const result = validateManifestForWrite(manifest);
  if (!result.ok) {
    throw new Error(`Manifest validation failed: ${result.errors.join('; ')}`);
  }
}
