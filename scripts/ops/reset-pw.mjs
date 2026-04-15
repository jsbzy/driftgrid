import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('/Users/jeffbzy/driftgrid/.env.local', 'utf-8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Generate a strong random password
const pw = 'DriftGrid-' + Array.from({length: 12}, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*54)]).join('');

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const user = list.users.find(u => u.email === 'jeff@bzydesign.com');
if (!user) { console.error('User not found'); process.exit(1); }

const { error } = await admin.auth.admin.updateUserById(user.id, { password: pw });
if (error) { console.error(error); process.exit(1); }

console.log('\n═══════════════════════════════════════════════');
console.log('  jeff@bzydesign.com');
console.log('  Password:', pw);
console.log('═══════════════════════════════════════════════');
console.log('\nYou can change it at https://driftgrid.ai/account');
