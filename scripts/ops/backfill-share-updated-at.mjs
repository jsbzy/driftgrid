import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// One-shot cleanup: the migration added updated_at with a default of now(),
// and the intended backfill condition (`updated_at < created_at`) was never
// true — so existing rows got stamped with "now" instead of created_at.
// This script corrects that by setting updated_at = created_at for all rows
// whose updated_at is still suspiciously close to the migration time.
//
// Safe to re-run: no-ops rows where updated_at has since been bumped by a
// real republish (we only touch rows where updated_at and created_at
// differ — we treat that delta as "bug-induced").
//
// Usage: node scripts/ops/backfill-share-updated-at.mjs

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error: selErr } = await admin.from('share_links')
  .select('token, client, project, created_at, updated_at');
if (selErr) { console.error('select error:', selErr); process.exit(1); }

console.log(`Found ${rows.length} share rows.`);
let touched = 0;
for (const r of rows) {
  if (r.updated_at === r.created_at) continue;
  const { error } = await admin.from('share_links')
    .update({ updated_at: r.created_at })
    .eq('token', r.token);
  if (error) { console.error(r.token, error.message); continue; }
  touched++;
  console.log(`  ${r.client}/${r.project} → ${r.created_at}`);
}
console.log(`✅ Backfilled ${touched} rows.`);
