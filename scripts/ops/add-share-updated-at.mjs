import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Apply the migration at supabase/migrations/20260416000000_share_updated_at.sql
// directly against the configured Supabase project using the service role.
// Required because Supabase migrations don't auto-run against production from
// the repo — they have to be pushed via `supabase db push`, the SQL editor, or
// a script like this.

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Check if the column already exists by asking for it via PostgREST.
// If it errors with a "column does not exist" shape, we need to add it.
const probe = await admin.from('share_links').select('updated_at').limit(1);
if (!probe.error) {
  console.log('✅ share_links.updated_at already present — nothing to do.');
  process.exit(0);
}

console.log('Column missing. Supabase JS client cannot run raw DDL —');
console.log('paste the SQL below into the Supabase SQL editor:');
console.log('   https://supabase.com/dashboard/project/_/sql/new');
console.log('');
console.log('─── begin sql ───');
console.log(readFileSync(new URL('../../supabase/migrations/20260416000000_share_updated_at.sql', import.meta.url), 'utf-8').trim());
console.log('─── end sql ───');
