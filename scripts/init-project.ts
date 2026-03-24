#!/usr/bin/env tsx
/**
 * driftgrid init — scaffold a new DriftGrid project
 *
 * Usage:
 *   npx tsx scripts/init-project.ts <client> <project> [--canvas <preset>]
 *
 * Examples:
 *   npx tsx scripts/init-project.ts acme landing-page
 *   npx tsx scripts/init-project.ts acme landing-page --canvas mobile
 *   npx tsx scripts/init-project.ts acme pitch-deck --canvas landscape-16-9
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CANVAS_PRESETS } from '../lib/constants';
import type { Manifest } from '../lib/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const VALID_PRESETS = Object.keys(CANVAS_PRESETS);

function usage(): never {
  console.error('Usage: npx tsx scripts/init-project.ts <client> <project> [--canvas <preset>]');
  console.error('');
  console.error('Canvas presets:', VALID_PRESETS.join(', '));
  console.error('');
  console.error('Examples:');
  console.error('  npx tsx scripts/init-project.ts acme landing-page');
  console.error('  npx tsx scripts/init-project.ts acme pitch-deck --canvas landscape-16-9');
  process.exit(1);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
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

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    usage();
  }

  const clientRaw = args[0];
  const projectRaw = args[1];
  let canvasPreset = 'desktop';

  // Parse --canvas flag
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--canvas' && args[i + 1]) {
      canvasPreset = args[i + 1];
      i++;
    }
  }

  const client = slugify(clientRaw);
  const project = slugify(projectRaw);

  if (!client || !project) {
    console.error('Error: client and project names must produce valid slugs.');
    process.exit(1);
  }

  // Validate canvas preset
  if (!VALID_PRESETS.includes(canvasPreset)) {
    console.error(`Error: unknown canvas preset "${canvasPreset}".`);
    console.error('Valid presets:', VALID_PRESETS.join(', '));
    process.exit(1);
  }

  const projectDir = path.join(PROJECTS_DIR, client, project);
  const brandDir = path.join(PROJECTS_DIR, client, 'brand');
  const conceptDir = path.join(projectDir, 'concept-1');
  const thumbsDir = path.join(projectDir, '.thumbs');

  // Check if project already exists
  if (await dirExists(projectDir)) {
    console.error(`Error: project already exists at projects/${client}/${project}/`);
    process.exit(1);
  }

  // Create project directories
  await fs.mkdir(conceptDir, { recursive: true });
  await fs.mkdir(thumbsDir, { recursive: true });
  console.log(`  Created projects/${client}/${project}/concept-1/`);
  console.log(`  Created projects/${client}/${project}/.thumbs/`);

  // Create brand directory if it doesn't exist
  if (!(await dirExists(brandDir))) {
    await fs.mkdir(path.join(brandDir, 'assets'), { recursive: true });
    console.log(`  Created projects/${client}/brand/`);
  }

  // Create starter brand guidelines if they don't exist
  const guidelinesPath = path.join(brandDir, 'guidelines.md');
  if (!(await fileExists(guidelinesPath))) {
    const clientName = client
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const guidelines = `# ${clientName} Brand Guidelines

## Colors
- Primary: #000000
- Secondary: #666666
- Background: #FFFFFF

## Typography
- Heading: Inter
- Body: Inter

## Voice
- Professional, clear, concise

## Reference Links
- Website:
`;
    await fs.writeFile(guidelinesPath, guidelines, 'utf-8');
    console.log(`  Created projects/${client}/brand/guidelines.md`);
  }

  // Create manifest
  const now = new Date().toISOString();
  const conceptId = `concept-${generateId()}`;
  const versionId = `version-${generateId()}`;

  const projectName = project
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const manifest: Manifest = {
    project: {
      name: projectName,
      slug: project,
      client: client,
      canvas: canvasPreset,
      created: now,
      links: {},
    },
    concepts: [
      {
        id: conceptId,
        label: 'Concept 1',
        description: '',
        position: 0,
        visible: true,
        versions: [
          {
            id: versionId,
            number: 1,
            file: 'concept-1/v1.html',
            parentId: null,
            changelog: 'Initial version',
            visible: true,
            starred: false,
            created: now,
            thumbnail: '',
          },
        ],
      },
    ],
    workingSets: [],
    comments: [],
    clientEdits: [],
  };

  const manifestPath = path.join(projectDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`  Created projects/${client}/${project}/manifest.json`);

  // Create starter HTML file
  const preset = CANVAS_PRESETS[canvasPreset];
  const isLocked = !preset.responsive && typeof preset.height === 'number';
  const widthPx = typeof preset.width === 'number' ? preset.width : 1440;

  let starterHtml: string;
  if (isLocked) {
    starterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100vh;
            overflow: hidden;
        }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            -webkit-font-smoothing: antialiased;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
            color: #111111;
        }
        @media print {
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <h1 style="font-size: 2rem; font-weight: 300; letter-spacing: 0.05em;">${projectName}</h1>
</body>
</html>`;
  } else {
    starterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; }
        body {
            max-width: ${widthPx}px;
            margin: 0 auto;
            font-family: system-ui, -apple-system, sans-serif;
            -webkit-font-smoothing: antialiased;
            padding: 4rem 2rem;
            background: #ffffff;
            color: #111111;
        }
    </style>
</head>
<body>
    <h1 style="font-size: 2rem; font-weight: 300; letter-spacing: 0.05em;">${projectName}</h1>
</body>
</html>`;
  }

  const htmlPath = path.join(conceptDir, 'v1.html');
  await fs.writeFile(htmlPath, starterHtml, 'utf-8');
  console.log(`  Created projects/${client}/${project}/concept-1/v1.html`);

  console.log('');
  console.log(`Project initialized at: projects/${client}/${project}/`);
  console.log(`Canvas: ${preset.label} (${widthPx}${typeof preset.height === 'number' ? `x${preset.height}` : ' x auto'})`);
  console.log(`View at: http://localhost:3000/admin/${client}/${project}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
