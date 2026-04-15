import { createClient } from '@supabase/supabase-js';
import { readFile, stat } from 'fs/promises';
import { readFileSync } from 'fs';
import { resolve, extname, dirname, join } from 'path';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase env');

const admin = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'projects';
const CLOUD_URL = env.NEXT_PUBLIC_DRIFTGRID_CLOUD_URL || 'https://driftgrid.ai';

const EMAIL = process.argv[2] || 'jeff@bzydesign.com';
const CLIENT = process.argv[3] || 'recovryai';
const PROJECT = process.argv[4] || 'demo-storyboard';

const MIME = {
  '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.md': 'text/markdown', '.css': 'text/css', '.txt': 'text/plain',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

async function main() {
  // 1) Find user
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const user = list.users.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
  if (!user) throw new Error(`User ${EMAIL} not found`);
  console.log(`User: ${user.email} (${user.id})`);

  // 2) Load manifest
  const projectDir = resolve(`projects/${CLIENT}/${PROJECT}`);
  const manifestPath = join(projectDir, 'manifest.json');
  const manifestRaw = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  // 3) Pick the latest round (user's "current" round at share time)
  const rounds = manifest.rounds || [];
  const activeRound = rounds.length ? rounds[rounds.length - 1] : { id: null, name: 'default', concepts: manifest.concepts };
  console.log(`Round: ${activeRound.name || activeRound.id} (${(activeRound.concepts || []).length} concepts)`);

  // 4) Collect starred versions
  const starred = [];
  for (const c of activeRound.concepts || []) {
    for (const v of c.versions || []) {
      if (v.starred) starred.push({ concept: c.label, version: v });
    }
  }
  console.log(`Starred in this round: ${starred.length}`);
  if (starred.length === 0) throw new Error('No starred versions in active round — nothing to share');

  // 5) Build upload list: manifest + each starred .html + .feedback.md (if exists) + thumbnail (if exists)
  const uploads = [{ path: 'manifest.json', absPath: manifestPath }];
  for (const { version: v } of starred) {
    if (v.file) {
      uploads.push({ path: v.file, absPath: join(projectDir, v.file) });
      const sidecar = v.file.replace(/\.html$/, '.feedback.md');
      uploads.push({ path: sidecar, absPath: join(projectDir, sidecar), optional: true });
    }
    if (v.thumbnail) {
      uploads.push({ path: v.thumbnail, absPath: join(projectDir, v.thumbnail), optional: true });
    }
  }

  // 6) Upload each
  let uploaded = 0, skipped = 0, failed = 0;
  for (const u of uploads) {
    try {
      await stat(u.absPath);
    } catch {
      if (u.optional) { skipped++; continue; }
      console.error(`MISSING required: ${u.path}`); failed++; continue;
    }
    const ext = extname(u.absPath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    const isText = ['text/html', 'application/json', 'image/svg+xml', 'text/markdown', 'text/css', 'text/plain'].includes(contentType);
    const raw = await readFile(u.absPath);
    const body = isText ? raw.toString('utf-8') : raw; // Supabase accepts Buffer directly
    const storagePath = `${user.id}/${CLIENT}/${PROJECT}/${u.path}`;
    const { error } = await admin.storage.from(BUCKET).upload(storagePath, body, { upsert: true, contentType });
    if (error) {
      console.error(`FAIL ${u.path}: ${error.message}`);
      failed++;
    } else {
      uploaded++;
    }
  }
  console.log(`Uploaded: ${uploaded} · Skipped(optional missing): ${skipped} · Failed: ${failed}`);
  if (failed > 0) throw new Error(`${failed} uploads failed — aborting`);

  // 7) Create or fetch share_links row
  const { data: existing } = await admin.from('share_links')
    .select('token, created_at')
    .eq('user_id', user.id).eq('client', CLIENT).eq('project', PROJECT).eq('is_active', true)
    .maybeSingle();

  let token;
  if (existing) {
    token = existing.token;
    console.log(`Reusing existing share: ${token}`);
  } else {
    const { data, error } = await admin.from('share_links')
      .insert({ user_id: user.id, client: CLIENT, project: PROJECT })
      .select('token, created_at').single();
    if (error) throw new Error(`share_links insert failed: ${error.message}`);
    token = data.token;
    console.log(`Created share: ${token}`);
  }

  const shareUrl = `${CLOUD_URL}/s/${CLIENT}/${token}`;
  console.log(`\n🔗 PUBLIC SHARE URL: ${shareUrl}\n`);
  return shareUrl;
}

main().catch(e => { console.error(e); process.exit(1); });
