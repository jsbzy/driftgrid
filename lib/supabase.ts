import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** True when Supabase env vars are configured AND cloud mode is explicitly enabled */
export function isCloudMode(): boolean {
  return process.env.DRIFT_CLOUD === '1' && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Server-side admin client using service role key — full access, no RLS */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return adminClient;
}

/** Browser-side anon client — for client components */
let anonClient: SupabaseClient | null = null;

export function getSupabaseAnon(): SupabaseClient {
  if (anonClient) return anonClient;
  anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return anonClient;
}
