/**
 * DriftGrid coordinate utilities.
 *
 * Iteration letters: permanent identity for each version (a, b, c, ... z, aa, ab)
 * Concept slugs: human-readable URL-safe identifiers derived from concept labels
 */

/**
 * Convert a 1-based version number to a letter identity.
 * 1→a, 2→b, 26→z, 27→aa, 28→ab, 52→az, 53→ba, 702→zz, 703→aaa
 */
export function numberToLetter(n: number): string {
  let result = '';
  let num = n;
  while (num > 0) {
    num--;
    result = String.fromCharCode(97 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

/**
 * Convert a letter identity back to a 1-based version number.
 * a→1, b→2, z→26, aa→27, ab→28
 */
export function letterToNumber(s: string): number {
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    result = result * 26 + (s.charCodeAt(i) - 96);
  }
  return result;
}

/**
 * Derive a URL slug from a concept label.
 * Strips leading "NN — " or "NN - " prefix, then slugifies.
 * "02 — The App" → "the-app"
 * "Storyboard" → "storyboard"
 * "06 — Escalation" → "escalation"
 */
export function conceptSlug(label: string): string {
  const stripped = label.replace(/^\d+\s*[—–\-]\s*/, '');
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
