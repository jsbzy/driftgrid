/**
 * Project file collector for cloud upload — walks a local project directory and
 * returns the files to push (text as utf-8, binary as base64), applying a
 * size/type skip policy and an optional allowlist.
 *
 * Extracted so both the curated SHARE path (app/api/cloud/push-and-share, which
 * passes a starred allowlist) and the full-project SYNC path
 * (app/api/cloud/sync, which passes no allowlist → everything) share one
 * collector. push-and-share still carries its own inline copy for now; unify it
 * here in a later pass.
 */
import { promises as fs } from 'fs';
import path from 'path';

// MIME types by extension
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export const TEXT_TYPES = new Set([
  'text/html', 'application/json', 'image/svg+xml', 'text/markdown',
  'text/css', 'text/plain', 'application/javascript',
]);

// Always upload regardless of size — images + docs + fonts + scripts
const ALWAYS_INCLUDE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico', '.bmp', '.tiff', '.heic',
  '.html', '.json', '.md', '.css', '.txt', '.woff', '.woff2',
  '.js', '.mjs',
]);

// Always skip unless includeMedia — video, audio, archives, design sources
const SKIP_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.7z',
  '.psd', '.sketch', '.fig', '.ai', '.xd',
]);

// Fallback for unknown extensions: skip if larger than this
const MAX_OTHER_BINARY_BYTES = 25 * 1024 * 1024;

export type SkippedEntry = { path: string; bytes: number; ext: string; reason: 'ext' | 'size' };
export type FileEntry = { path: string; content: string; contentType: string };

/**
 * Recursively collect files from a directory, applying the skip policy and
 * (optionally) an allowlist. With no allowlist, every non-skipped file is
 * collected — this is the full-project sync case.
 */
export async function collectFiles(
  dir: string,
  prefix: string,
  opts: { includeMedia: boolean; allowList?: Set<string> | null },
): Promise<{ files: FileEntry[]; skipped: SkippedEntry[] }> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: FileEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Directory pruning: if allowList exists, skip folders entirely when no path under them is allowed.
      if (opts.allowList && !anyAllowedUnder(relPath, opts.allowList)) continue;
      const child = await collectFiles(fullPath, relPath, opts);
      files.push(...child.files);
      skipped.push(...child.skipped);
      continue;
    }

    // Allowlist check: silently drop files outside the curated set.
    if (opts.allowList && !opts.allowList.has(relPath)) continue;

    const ext = path.extname(entry.name).toLowerCase();

    // Skip policy — size/type filters still apply even inside an allowlist.
    if (!opts.includeMedia) {
      if (SKIP_EXTS.has(ext)) {
        const stat = await fs.stat(fullPath);
        skipped.push({ path: relPath, bytes: stat.size, ext, reason: 'ext' });
        continue;
      }
      if (!ALWAYS_INCLUDE_EXTS.has(ext)) {
        const stat = await fs.stat(fullPath);
        if (stat.size > MAX_OTHER_BINARY_BYTES) {
          skipped.push({ path: relPath, bytes: stat.size, ext, reason: 'size' });
          continue;
        }
      }
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isText = TEXT_TYPES.has(contentType);
    const raw = await fs.readFile(fullPath);
    const content = isText ? raw.toString('utf-8') : raw.toString('base64');
    files.push({ path: relPath, content, contentType });
  }

  return { files, skipped };
}

/** Returns true if any path in the allowList starts with the given directory prefix. */
function anyAllowedUnder(dirPrefix: string, allowList: Set<string>): boolean {
  const prefix = dirPrefix + '/';
  for (const p of allowList) {
    if (p === dirPrefix || p.startsWith(prefix)) return true;
  }
  return false;
}
