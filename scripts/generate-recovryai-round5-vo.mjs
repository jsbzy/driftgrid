import fs from 'node:fs';
import path from 'node:path';

const repoRoot = '/Users/jeffbzy/driftgrid';
const projectRoot = path.join(repoRoot, 'projects/recovryai/demo-v4');
const envPath = path.join(repoRoot, '.env.local');
const outputDir = path.join(projectRoot, 'audio/round-5');

const targets = [
  ['intro', 'v2', 'intro/round-5/v2.html'],
  ['problem', 'v7', 'problem/round-5/v7.html'],
  ['solution', 'v4', 'solution/round-5/v4.html'],
  ['two-views', 'v2', 'two-views/round-5/v2.html'],
  ['meet-marcia', 'v2', 'meet-marcia/round-5/v2.html'],
  ['pre-surgery', 'v3', 'pre-surgery/round-5/v3.html'],
  ['onboarding-tour', 'v2', 'onboarding-tour/round-5/v2.html'],
  ['factors', 'v2', 'factors/round-5/v2.html'],
  ['three-outcomes', 'v3', 'three-outcomes/round-5/v3.html'],
  ['first-check-in', 'v2', 'first-check-in/round-5/v2.html'],
  ['recovery-guidance', 'v2', 'recovery-guidance/round-5/v2.html'],
  ['between-checkins', 'v2', 'between-checkins/round-5/v2.html'],
  ['provider-escalation', 'v2', 'provider-escalation/round-5/v2.html'],
  ['emergency-escalation', 'v2', 'emergency-escalation/round-5/v2.html'],
  ['portal-tour', 'v3', 'portal-tour/round-5/v3.html'],
  ['trajectory', 'v3', 'trajectory/round-5/v3.html'],
  ['dashboard', 'v3', 'dashboard/round-5/v3.html'],
  ['recap', 'v3', 'recap/round-5/v3.html'],
  ['close', 'v2', 'close/round-5/v2.html'],
];

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, '');
  }
}

function extractCaption(html) {
  const match = html.match(/data-drift-editable="vo"[^>]*>([\s\S]*?)<\/div>/);
  if (!match) throw new Error('No editable VO caption found');
  return match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function generateSpeech({ text, outputPath }) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'verse',
      response_format: 'mp3',
      speed: 0.96,
      instructions:
        'Professional, friendly healthcare product narration. Calm, clear, confident, and human. Avoid hype. Preserve clinical seriousness. Use natural pacing with short pauses after sentences.',
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI speech request failed: ${response.status} ${body}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, bytes);
}

loadEnv();

if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('sk-...')) {
  console.error(`OPENAI_API_KEY is missing. Add it to ${envPath} or export it, then rerun:`);
  console.error('node scripts/generate-recovryai-round5-vo.mjs');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

for (const [slug, version, relFile] of targets) {
  const htmlPath = path.join(projectRoot, relFile);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const text = extractCaption(html);
  const filename = `${slug}-${version}.mp3`;
  const outputPath = path.join(outputDir, filename);
  console.log(`Generating ${filename}`);
  await generateSpeech({ text, outputPath });
}

console.log(`Done. Wrote ${targets.length} MP3 files to ${outputDir}`);
