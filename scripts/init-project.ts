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
import * as readline from 'readline';
import { CANVAS_PRESETS } from '../lib/constants';
import { driftPromptBoilerplate } from '../lib/canvas-boilerplate';
import type { Manifest } from '../lib/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');
const VALID_PRESETS = Object.keys(CANVAS_PRESETS);

function usage(): never {
  console.error('Usage: driftgrid init [client-name] [project-name] [--canvas <preset>]');
  console.error('');
  console.error('Canvas presets:', VALID_PRESETS.join(', '));
  console.error('');
  console.error('Examples:');
  console.error('  driftgrid init Acme "Landing Page"');
  console.error('  driftgrid init Acme "Pitch Deck" --canvas landscape-16-9');
  console.error('');
  console.error('Run without arguments for interactive mode.');
  process.exit(1);
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
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

  let clientRaw: string;
  let projectRaw: string;
  let canvasPreset: string | null = null;
  let outputType: 'vector' | 'image' | 'hybrid' = 'vector';

  if (args.length >= 2 && !args[0].startsWith('--')) {
    // Non-interactive: args provided
    clientRaw = args[0];
    projectRaw = args[1];
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--canvas' && args[i + 1]) {
        canvasPreset = args[i + 1];
        i++;
      } else if (args[i] === '--output' && args[i + 1]) {
        const v = args[i + 1];
        if (v === 'vector' || v === 'image' || v === 'hybrid') {
          outputType = v;
        } else {
          console.error(`  ERROR: --output must be one of: vector, image, hybrid (got "${v}")`);
          process.exit(1);
        }
        i++;
      }
    }
    if (!canvasPreset) {
      console.error('');
      console.error('  ERROR: --canvas is required.');
      console.error('  Pick the format that matches your output:');
      console.error('');
      VALID_PRESETS.forEach((p) => {
        const preset = CANVAS_PRESETS[p];
        const dims = typeof preset.height === 'number'
          ? `${preset.width}×${preset.height}`
          : `${preset.width} × auto`;
        console.error(`    --canvas ${p.padEnd(18)} ${dims}`);
      });
      console.error('');
      console.error(`  Example: driftgrid init "${clientRaw}" "${projectRaw}" --canvas desktop`);
      console.error('');
      process.exit(1);
    }
  } else if (args.includes('--help') || args.includes('-h')) {
    usage();
  } else {
    // Interactive wizard
    console.log('');
    console.log('  DriftGrid — New Project');
    console.log('  ──────────────────────');
    console.log('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    clientRaw = await ask(rl, '  Client name (e.g. Acme): ');
    projectRaw = await ask(rl, '  Project name (e.g. Landing Page): ');

    console.log('');
    console.log('  Canvas preset — REQUIRED. Pick the format that matches your output:');
    VALID_PRESETS.forEach((p, i) => {
      const preset = CANVAS_PRESETS[p];
      const dims = typeof preset.height === 'number'
        ? `${preset.width}×${preset.height}`
        : `${preset.width} × auto`;
      console.log(`    ${i + 1}. ${p} — ${dims}`);
    });
    console.log('');

    // Loop until they pick a valid preset — no default fallback.
    while (!canvasPreset) {
      const canvasInput = (await ask(rl, '  Canvas preset (number or name): ')).trim();
      if (!canvasInput) {
        console.log('  Required — please pick one of the presets above.');
        continue;
      }
      const num = parseInt(canvasInput, 10);
      if (!isNaN(num) && num >= 1 && num <= VALID_PRESETS.length) {
        canvasPreset = VALID_PRESETS[num - 1];
      } else if (VALID_PRESETS.includes(canvasInput)) {
        canvasPreset = canvasInput;
      } else {
        console.log(`  "${canvasInput}" is not a valid preset. Try a number 1–${VALID_PRESETS.length} or a name from the list.`);
      }
    }

    // Output type — what the agent will produce
    console.log('');
    console.log('  Output type — what is the agent producing?');
    console.log('    1. vector  — HTML/CSS/SVG. Editable, exportable, any agent. (default — pick this for most things)');
    console.log('    2. image   — raster (PNG) per frame. Needs an image-gen model (OpenAI gpt-image / Gemini Imagen).');
    console.log('                 Best for: moodboards, photo treatments, brand exploration.');
    console.log('    3. hybrid  — HTML canvas with regenerable <img> slots. Image-gen the visuals, HTML the layout.');
    console.log('                 Best for: rapid iteration where only the imagery changes.');
    console.log('');
    const outputInput = (await ask(rl, '  Output type (number or name, default vector): ')).trim().toLowerCase();
    if (outputInput === '2' || outputInput === 'image') outputType = 'image';
    else if (outputInput === '3' || outputInput === 'hybrid') outputType = 'hybrid';
    else outputType = 'vector';

    rl.close();
    console.log('');
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
  const thumbsDir = path.join(projectDir, '.thumbs');

  // Check if project already exists
  if (await dirExists(projectDir)) {
    console.error(`Error: project already exists at projects/${client}/${project}/`);
    process.exit(1);
  }

  // Create project directories
  await fs.mkdir(thumbsDir, { recursive: true });
  for (let i = 1; i <= 3; i++) {
    await fs.mkdir(path.join(projectDir, `concept-${i}`), { recursive: true });
  }
  console.log(`  Created projects/${client}/${project}/ (3 concepts)`);

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

  // Create manifest with 3 starter concepts
  const now = new Date().toISOString();

  const projectName = project
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const conceptLabels = ['Direction A', 'Direction B', 'Direction C'];
  const concepts = conceptLabels.map((label, i) => {
    const cId = `concept-${generateId()}`;
    const vId = `version-${generateId()}`;
    return {
      id: cId,
      slug: `concept-${i + 1}`,
      label,
      description: '',
      position: i,
      visible: true,
      versions: [
        {
          id: vId,
          number: 1,
          file: `concept-${i + 1}/v1.html`,
          parentId: null,
          changelog: 'New drift slot — empty',
          visible: true,
          starred: false,
          created: now,
          thumbnail: '',
        },
      ],
    };
  });

  const manifest: Manifest = {
    project: {
      name: projectName,
      slug: project,
      client: client,
      canvas: canvasPreset,
      created: now,
      links: {},
      output: outputType,
    },
    concepts,
    rounds: [],
    workingSets: [],
    comments: [],
    clientEdits: [],
  };

  const manifestPath = path.join(projectDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`  Created projects/${client}/${project}/manifest.json`);

  // Create drift-prompt boilerplate HTML for each concept
  for (let i = 0; i < conceptLabels.length; i++) {
    const html = driftPromptBoilerplate(
      canvasPreset,
      `${projectName} — ${conceptLabels[i]}`,
      conceptLabels[i],
      1,
    );
    const htmlPath = path.join(projectDir, `concept-${i + 1}`, 'v1.html');
    await fs.writeFile(htmlPath, html, 'utf-8');
  }
  console.log(`  Created 3 concept slots (Direction A, B, C)`);

  // Write/update CLAUDE.md with DriftGrid conventions
  const claudeMdPath = path.join(PROJECTS_DIR, '..', 'CLAUDE.md');
  const presetInfo = CANVAS_PRESETS[canvasPreset];
  const widthPx = typeof presetInfo.width === 'number' ? presetInfo.width : 1440;
  const driftgridSection = `
## DriftGrid Conventions

This project uses DriftGrid for design iteration. Key rules:

- **Never overwrite versions.** Copy to the next version number (v2, v3, etc.) and edit the copy.
- **Update manifest.json** when adding versions or concepts.
- **HTML files must be self-contained** — inline CSS/JS, Google Fonts via \`<link>\` tags, no external URLs.
- **Canvas preset:** \`${canvasPreset}\` (${widthPx}${typeof presetInfo.height === 'number' ? `x${presetInfo.height}` : ' x auto'})

### API Endpoints (localhost:3000)
- \`GET /api/current\` — what the user is currently viewing
- \`POST /api/iterate\` — create a new version (drift)
- \`POST /api/branch\` — fork into a new concept
- \`POST /api/create-project\` — create a new project
`;

  try {
    const existing = await fs.readFile(claudeMdPath, 'utf-8');
    if (!existing.includes('DriftGrid Conventions')) {
      await fs.writeFile(claudeMdPath, existing + '\n' + driftgridSection, 'utf-8');
      console.log(`  Updated CLAUDE.md with DriftGrid conventions`);
    }
  } catch {
    // CLAUDE.md doesn't exist — that's fine, the main one in the repo root covers it
  }

  console.log('');
  console.log(`  Project ready: projects/${client}/${project}/`);
  console.log(`  Canvas: ${presetInfo.label} (${widthPx}${typeof presetInfo.height === 'number' ? `x${presetInfo.height}` : ' x auto'})`);
  console.log(`  3 empty concepts — prompt your agent to fill them in.`);
  console.log('');
  console.log(`  View at: http://localhost:3000/admin/${client}/${project}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
