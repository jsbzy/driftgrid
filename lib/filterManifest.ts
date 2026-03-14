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
