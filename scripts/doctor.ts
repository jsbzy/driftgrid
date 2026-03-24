#!/usr/bin/env tsx
/**
 * driftgrid doctor — validate all DriftGrid projects for issues
 *
 * Usage:
 *   npx tsx scripts/doctor.ts
 *
 * Checks:
 *   - Manifests exist and are valid JSON
 *   - All referenced files exist on disk
 *   - Concept IDs are unique
 *   - Version IDs are unique within each concept
 *   - Version numbers are sequential
 *   - Canvas preset is valid
 *   - .thumbs/ directory exists
 *   - Thumbnails exist for all versions (warn if missing)
 *   - No orphaned HTML files (files not referenced in manifest)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CANVAS_PRESETS } from '../lib/constants';
import type { Manifest } from '../lib/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

const PASS = '\u2713';
const WARN = '\u26A0';
const FAIL = '\u2717';

let totalErrors = 0;
let totalWarnings = 0;
let totalPasses = 0;

function pass(msg: string) {
  console.log(`  ${PASS} ${msg}`);
  totalPasses++;
}

function warn(msg: string) {
  console.log(`  ${WARN} ${msg}`);
  totalWarnings++;
}

function fail(msg: string) {
  console.log(`  ${FAIL} ${msg}`);
  totalErrors++;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getHtmlFilesInDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const subFiles = await getHtmlFilesInDir(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return files;
}

async function checkProject(client: string, project: string) {
  const projectDir = path.join(PROJECTS_DIR, client, project);
  const manifestPath = path.join(projectDir, 'manifest.json');

  console.log(`\n${client}/${project}`);

  // 1. Manifest exists and is valid JSON
  let manifest: Manifest;
  try {
    const data = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(data) as Manifest;
    pass('Manifest is valid JSON');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      fail('Manifest not found');
    } else {
      fail(`Manifest is invalid JSON: ${(err as Error).message}`);
    }
    return;
  }

  // 2. Canvas preset is valid
  const canvas = manifest.project.canvas;
  if (typeof canvas === 'string' && canvas in CANVAS_PRESETS) {
    pass(`Canvas preset: ${canvas}`);
  } else if (
    typeof canvas === 'object' &&
    canvas !== null &&
    typeof (canvas as Record<string, unknown>).width === 'number' &&
    typeof (canvas as Record<string, unknown>).height === 'number'
  ) {
    pass(`Canvas: freeform (${(canvas as Record<string, unknown>).width}x${(canvas as Record<string, unknown>).height})`);
  } else if (typeof canvas === 'object' && canvas !== null) {
    // Object canvas without both width/height — still valid-ish
    warn(`Canvas is an object but missing width or height`);
  } else {
    fail(`Unknown canvas preset: "${canvas}"`);
  }

  // 3. All concept IDs are unique
  const conceptIds = manifest.concepts.map(c => c.id);
  const uniqueConceptIds = new Set(conceptIds);
  if (uniqueConceptIds.size === conceptIds.length) {
    pass(`${conceptIds.length} concept(s), all IDs unique`);
  } else {
    const dupes = conceptIds.filter((id, i) => conceptIds.indexOf(id) !== i);
    fail(`Duplicate concept IDs: ${dupes.join(', ')}`);
  }

  // Track all referenced files for orphan detection
  const referencedFiles = new Set<string>();

  // 4. Check each concept
  for (const concept of manifest.concepts) {
    const versionIds = concept.versions.map(v => v.id);

    // Version IDs unique within concept
    const uniqueVersionIds = new Set(versionIds);
    if (uniqueVersionIds.size !== versionIds.length) {
      const dupes = versionIds.filter((id, i) => versionIds.indexOf(id) !== i);
      fail(`[${concept.label}] Duplicate version IDs: ${dupes.join(', ')}`);
    }

    // Version numbers sequential
    const sortedNumbers = concept.versions.map(v => v.number).sort((a, b) => a - b);
    let sequential = true;
    for (let i = 0; i < sortedNumbers.length; i++) {
      if (sortedNumbers[i] !== i + 1) {
        sequential = false;
        break;
      }
    }
    if (!sequential && concept.versions.length > 0) {
      warn(`[${concept.label}] Version numbers not sequential: ${sortedNumbers.join(', ')}`);
    }

    // Check each version's file exists
    for (const version of concept.versions) {
      const filePath = path.join(projectDir, version.file);
      referencedFiles.add(path.resolve(filePath));

      if (await fileExists(filePath)) {
        pass(`[${concept.label}/v${version.number}] File exists: ${version.file}`);
      } else {
        fail(`[${concept.label}/v${version.number}] File missing: ${version.file}`);
      }
    }
  }

  // 5. .thumbs/ directory exists
  const thumbsDir = path.join(projectDir, '.thumbs');
  if (await dirExists(thumbsDir)) {
    pass('.thumbs/ directory exists');
  } else {
    warn('.thumbs/ directory missing');
  }

  // 6. Thumbnails exist for all versions
  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      if (version.thumbnail) {
        const thumbPath = path.join(projectDir, version.thumbnail);
        if (await fileExists(thumbPath)) {
          pass(`[${concept.label}/v${version.number}] Thumbnail exists`);
        } else {
          warn(`[${concept.label}/v${version.number}] Thumbnail missing: ${version.thumbnail}`);
        }
      } else {
        warn(`[${concept.label}/v${version.number}] No thumbnail path set`);
      }
    }
  }

  // 7. Orphaned HTML files
  const allHtmlFiles = await getHtmlFilesInDir(projectDir);
  const orphaned = allHtmlFiles.filter(f => !referencedFiles.has(path.resolve(f)));
  if (orphaned.length === 0) {
    pass('No orphaned HTML files');
  } else {
    for (const file of orphaned) {
      warn(`Orphaned file: ${path.relative(projectDir, file)}`);
    }
  }
}

async function main() {
  console.log('DriftGrid Doctor');
  console.log('================');

  if (!(await dirExists(PROJECTS_DIR))) {
    console.error('No projects/ directory found. Run from the DriftGrid root directory.');
    process.exit(1);
  }

  const clientDirs = await fs.readdir(PROJECTS_DIR);
  let projectCount = 0;

  for (const clientSlug of clientDirs) {
    const clientPath = path.join(PROJECTS_DIR, clientSlug);
    try {
      const stat = await fs.stat(clientPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    const projectDirs = await fs.readdir(clientPath);
    for (const projectSlug of projectDirs) {
      if (projectSlug === 'brand') continue;
      const projectPath = path.join(clientPath, projectSlug);
      try {
        const stat = await fs.stat(projectPath);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      // Check if it has a manifest (skip non-project directories)
      const manifestPath = path.join(projectPath, 'manifest.json');
      if (!(await fileExists(manifestPath))) continue;

      await checkProject(clientSlug, projectSlug);
      projectCount++;
    }
  }

  console.log('\n================');
  console.log(`Scanned ${projectCount} project(s)`);
  console.log(`  ${PASS} ${totalPasses} passed`);
  if (totalWarnings > 0) console.log(`  ${WARN} ${totalWarnings} warning(s)`);
  if (totalErrors > 0) console.log(`  ${FAIL} ${totalErrors} error(s)`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
