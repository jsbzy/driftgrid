#!/usr/bin/env node
// Generate an image with OpenAI's gpt-image-2 and save it to disk.
// Usage:
//   node bin/gen-image.js --prompt "..." --out projects/foo/bar/assets/hero.png
//   node bin/gen-image.js --prompt "..." --out path.png --size 1024x1536 --model gpt-image-2
//
// Requires OPENAI_API_KEY in env (or .env.local — loaded automatically if present).

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(argv) {
  const out = { model: 'gpt-image-2', size: '1024x1024', n: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prompt') out.prompt = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--size') out.size = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--n') out.n = Number(argv[++i]);
    else if (a === '--quality') out.quality = argv[++i];
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Usage: node bin/gen-image.js --prompt "..." --out <path> [--size 1024x1024] [--model gpt-image-2] [--n 1] [--quality high]`);
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);
  if (args.help || !args.prompt || !args.out) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not set. Add it to .env.local or export it.');
    process.exit(1);
  }

  const body = {
    model: args.model,
    prompt: args.prompt,
    size: args.size,
    n: args.n,
  };
  if (args.quality) body.quality = args.quality;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`ERROR: ${res.status} ${res.statusText}\n${text}`);
    process.exit(1);
  }

  const json = await res.json();
  const items = json.data || [];
  if (!items.length) {
    console.error('ERROR: API returned no images.');
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const outBase = args.out;
  const ext = path.extname(outBase) || '.png';
  const stem = outBase.slice(0, outBase.length - ext.length);

  const written = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const target = items.length === 1 ? outBase : `${stem}-${i + 1}${ext}`;
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (item.b64_json) {
      fs.writeFileSync(target, Buffer.from(item.b64_json, 'base64'));
    } else if (item.url) {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) {
        console.error(`ERROR: failed to download ${item.url}: ${imgRes.status}`);
        process.exit(1);
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(target, buf);
    } else {
      console.error('ERROR: API response had no b64_json or url field.');
      console.error(JSON.stringify(item, null, 2));
      process.exit(1);
    }
    written.push(target);
  }

  for (const f of written) console.log(f);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
