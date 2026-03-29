import path from 'path';
import { promises as fs } from 'fs';
import { getManifest, writeManifest } from '../lib/manifest';
import { resolveCanvas } from '../lib/constants';
import { generateThumbnail } from '../lib/thumbnails';

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter(a => !a.startsWith('--'));

if (positional.length < 2) {
  console.error('Usage: npm run generate-thumbs -- <client> <project> [--force]');
  process.exit(1);
}

const [client, project] = positional;
const projectDir = path.join(process.cwd(), 'projects', client, project);

async function main() {
  const manifest = await getManifest(client, project);
  if (!manifest) {
    console.error(`Manifest not found for ${client}/${project}`);
    process.exit(1);
  }

  const resolved = resolveCanvas(manifest.project.canvas);
  const width = resolved.width;
  const height = resolved.height;

  const thumbsDir = path.join(projectDir, '.thumbs');
  await fs.mkdir(thumbsDir, { recursive: true });

  let generated = 0;
  let skipped = 0;

  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      const thumbName = `${concept.id}-${version.id}`;
      const outputPath = path.join(thumbsDir, `${thumbName}.webp`);
      const thumbRelative = `.thumbs/${thumbName}.webp`;

      // Skip if exists (unless --force)
      if (!force) {
        try {
          await fs.access(outputPath);
          version.thumbnail = thumbRelative;
          skipped++;
          continue;
        } catch {
          // doesn't exist, generate
        }
      }

      const htmlPath = path.resolve(projectDir, version.file);
      console.log(`  ${version.id}...`);
      await generateThumbnail(htmlPath, outputPath, width, height);
      version.thumbnail = thumbRelative;
      generated++;
    }
  }

  await writeManifest(client, project, manifest);
  console.log(`Done. ${generated} generated, ${skipped} skipped.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
