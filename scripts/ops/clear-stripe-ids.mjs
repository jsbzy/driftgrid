import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// One-time cleanup after switching Stripe from test mode to live mode:
// drops stripe_customer_id + subscription fields on every profile so the
// next checkout creates a fresh live customer. Safe because test-mode
// customers are useless against a live key ("No such customer: cus_...").

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: before, error: selErr } = await admin.from('profiles')
  .select('id, email, tier, stripe_customer_id, stripe_subscription_id, subscription_status');
if (selErr) { console.error('select error:', selErr); process.exit(1); }

const withStripe = before.filter(p => p.stripe_customer_id || p.stripe_subscription_id);
console.log(`Found ${before.length} profiles, ${withStripe.length} with Stripe references`);
for (const p of withStripe) {
  console.log(`  ${p.email} — customer=${p.stripe_customer_id || '∅'} sub=${p.stripe_subscription_id || '∅'} status=${p.subscription_status || '∅'} tier=${p.tier}`);
}

const { data: updated, error: upErr } = await admin.from('profiles').update({
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
  subscription_period_end: null,
  tier: 'free',
}).not('id', 'is', null).select('id, email');
if (upErr) { console.error('update error:', upErr); process.exit(1); }

console.log(`\n✅ Cleared Stripe state on ${updated.length} profiles. Next checkout creates a fresh live customer.`);
