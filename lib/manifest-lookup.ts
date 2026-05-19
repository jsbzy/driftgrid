/**
 * Shared rounds-aware lookup helpers for the manifest.
 *
 * `manifest.concepts` is a legacy alias for `manifest.rounds[last].concepts`.
 * On a rounds-enabled project, it only sees the latest round's concepts —
 * iterating it directly silently 404s requests for older rounds and is the
 * source of the long-running "rounds-alias footgun" bug class. These helpers
 * search all rounds, so callers don't have to remember.
 *
 * Always prefer these over `manifest.concepts.find(...)`.
 */

import type { Manifest } from './types';

type Concept = Manifest['rounds'][number]['concepts'][number];
type Version = Concept['versions'][number];

/**
 * Find a concept + version by their IDs across every round of the manifest.
 * Returns the concept and version object references (mutations on them persist
 * through writeManifest since they share references with the manifest tree).
 *
 * Searches the latest-round alias first (most common case) then falls through
 * to every round.
 */
export function findConceptAndVersion(
  manifest: Manifest,
  conceptId: string,
  versionId: string,
): { concept: Concept | undefined; version: Version | undefined; round: Manifest['rounds'][number] | undefined } {
  // Fast path: latest-round alias
  let concept = manifest.concepts?.find(c => c.id === conceptId);
  if (concept) {
    const version = concept.versions.find(v => v.id === versionId);
    if (version) {
      const round = manifest.rounds?.[manifest.rounds.length - 1];
      return { concept, version, round };
    }
  }
  for (const round of manifest.rounds ?? []) {
    concept = round.concepts?.find(c => c.id === conceptId);
    if (!concept) continue;
    const version = concept.versions.find(v => v.id === versionId);
    if (version) return { concept, version, round };
  }
  return { concept: undefined, version: undefined, round: undefined };
}

/**
 * Find a concept by its ID across every round.
 * Use this when you don't need a specific version (e.g. rename, reorder).
 */
export function findConcept(
  manifest: Manifest,
  conceptId: string,
): { concept: Concept | undefined; round: Manifest['rounds'][number] | undefined } {
  let concept = manifest.concepts?.find(c => c.id === conceptId);
  if (concept) {
    const round = manifest.rounds?.[manifest.rounds.length - 1];
    return { concept, round };
  }
  for (const round of manifest.rounds ?? []) {
    concept = round.concepts?.find(c => c.id === conceptId);
    if (concept) return { concept, round };
  }
  return { concept: undefined, round: undefined };
}

/**
 * Get every concept from every round in declaration order. Use this for
 * exports, search, and other "walk the whole project" operations — never use
 * `manifest.concepts` for these (it's just the latest round).
 */
export function getAllConcepts(manifest: Manifest): Array<{ concept: Concept; round: Manifest['rounds'][number] }> {
  const out: Array<{ concept: Concept; round: Manifest['rounds'][number] }> = [];
  for (const round of manifest.rounds ?? []) {
    for (const concept of round.concepts ?? []) {
      out.push({ concept, round });
    }
  }
  return out;
}

/**
 * Find a version by its ID alone (no concept context). Walks every round.
 * Slower than findConceptAndVersion when the concept ID is known.
 */
export function findVersionById(
  manifest: Manifest,
  versionId: string,
): { concept: Concept; version: Version; round: Manifest['rounds'][number] } | null {
  for (const round of manifest.rounds ?? []) {
    for (const concept of round.concepts ?? []) {
      const version = concept.versions.find(v => v.id === versionId);
      if (version) return { concept, version, round };
    }
  }
  // Legacy fallback for projects with top-level concepts only
  for (const concept of manifest.concepts ?? []) {
    const version = concept.versions.find(v => v.id === versionId);
    if (version) {
      const round = manifest.rounds?.[manifest.rounds.length - 1];
      if (round) return { concept, version, round };
    }
  }
  return null;
}
