import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env
const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false } });
const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error('Usage: node scripts/ops/demote-pro.mjs <email>');
  process.exit(1);
}

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
if (listErr) { console.error('listUsers error:', listErr); process.exit(1); }
const user = list.users.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
if (!user) {
  console.error(`No user found with email ${EMAIL}. Listing all emails:`);
  for (const u of list.users) console.error('  -', u.email);
  process.exit(1);
}
console.log(`Found user: ${user.email} (id: ${user.id})`);

const { data: profBefore } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
console.log('Profile BEFORE:', profBefore ?? '(none)');

// Reset to free tier + clear subscription state. Keep stripe_customer_id so a
// subsequent upgrade reuses the same customer record.
const { data: updated, error: upErr } = await admin.from('profiles').update({
  tier: 'free',
  subscription_status: null,
  subscription_period_end: null,
  stripe_subscription_id: null,
}).eq('id', user.id).select().single();
if (upErr) { console.error('update error:', upErr); process.exit(1); }

console.log('Profile AFTER:', updated);
console.log('✅ Demoted to FREE tier (stripe_customer_id retained for clean upgrade test)');
