/**
 * Validator for client/project slugs used as filesystem path segments.
 *
 * Accepts lowercase/uppercase alphanumerics and hyphens, up to 64 chars.
 * Rejects anything that could escape a path.join() — `..`, `/`, leading
 * hyphens, empty strings, etc. Use at every API entry point that reads
 * from or writes to the filesystem based on user-supplied slugs.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

export function isValidSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 && SLUG_RE.test(v);
}

/** True only if every provided value is a valid slug. */
export function areValidSlugs(...values: unknown[]): boolean {
  return values.every(isValidSlug);
}
