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
const EMAIL = process.argv[2] || 'jeff@bzydesign.com';

// Find user by email via auth admin API
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) { console.error('listUsers error:', listErr); process.exit(1); }
const user = list.users.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
if (!user) {
  console.error(`No user found with email ${EMAIL}. Listing all emails:`);
  for (const u of list.users) console.error('  -', u.email);
  process.exit(1);
}
console.log(`Found user: ${user.email} (id: ${user.id})`);

// Inspect profile
const { data: profBefore, error: selErr } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
if (selErr) console.error('profile select error:', selErr);
console.log('Profile BEFORE:', profBefore ?? '(none)');

// Upsert to pro
const now = new Date();
const future = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate()).toISOString();
const { data: upserted, error: upErr } = await admin.from('profiles').upsert({
  id: user.id,
  email: user.email,
  tier: 'pro',
  subscription_status: 'active',
  subscription_period_end: future,
}, { onConflict: 'id' }).select().single();
if (upErr) { console.error('upsert error:', upErr); process.exit(1); }
console.log('Profile AFTER:', upserted);
console.log('✅ Promoted to PRO');
