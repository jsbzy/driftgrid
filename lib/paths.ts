/**
 * Canonical path conventions for project assets.
 *
 * The manifest used to store `version.thumbnail` (path string) as a cached
 * field. That field was prone to drift — copy operations, reorders, and
 * scrambled-manifest events would leave it pointing at the wrong concept's
 * thumb file. Since the path is fully determined by `concept.id` +
 * `version.id`, there's no reason to store it at all — we derive it here at
 * read time.
 *
 * Convention:
 *   .thumbs/{conceptId}-{versionId}.webp
 *
 * The thumbnail-generation route always writes this exact filename, so the
 * derived path is the source of truth. Stored `version.thumbnail` values are
 * ignored by readers; the doctor reports any mismatch.
 */

/** Filename portion only — for the thumb URL. */
export function thumbFilename(conceptId: string, versionId: string): string {
  return `${conceptId}-${versionId}.webp`;
}

/** Project-relative path, e.g. `.thumbs/concept-X-v1.webp` — for manifest fields and on-disk lookups. */
export function thumbProjectPath(conceptId: string, versionId: string): string {
  return `.thumbs/${thumbFilename(conceptId, versionId)}`;
}

/** Public URL served by /api/thumbs/[...path]. */
export function thumbApiUrl(client: string, project: string, conceptId: string, versionId: string): string {
  return `/api/thumbs/${client}/${project}/${thumbFilename(conceptId, versionId)}`;
}
