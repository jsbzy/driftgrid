import type { Manifest } from './types';

export function filterVisibleManifest(manifest: Manifest): Manifest {
  const visibleConcepts = manifest.concepts
    .filter(c => c.visible)
    .map(c => ({
      ...c,
      versions: c.versions.filter(v => v.visible),
    }))
    .filter(c => c.versions.length > 0);

  return {
    ...manifest,
    concepts: visibleConcepts,
  };
}

/**
 * Filter manifest to only show starred versions (for curated share links).
 * If no versions are starred anywhere, returns the full manifest (backward compat).
 */
export function filterStarredManifest(manifest: Manifest): Manifest {
  const hasAnyStarred = manifest.concepts.some(c =>
    c.versions.some(v => v.starred)
  );

  if (!hasAnyStarred) return manifest;

  const starredConcepts = manifest.concepts
    .map(c => ({
      ...c,
      versions: c.versions.filter(v => v.starred),
    }))
    .filter(c => c.versions.length > 0);

  return {
    ...manifest,
    concepts: starredConcepts,
  };
}
