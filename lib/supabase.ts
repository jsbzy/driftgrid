import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * True when DriftGrid should use the cloud backend (Supabase Storage + Auth + DB).
 *
 * Cloud mode is enabled when all of:
 *   • Supabase env vars are configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *   • AND one of: DRIFT_CLOUD=1 (explicit opt-in locally) OR running on Vercel (production auto-detect)
 *
 * Local dev without DRIFT_CLOUD=1 always runs filesystem-only, free-tier.
 */
export function isCloudMode(): boolean {
  const hasEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hasEnv) return false;
  return process.env.DRIFT_CLOUD === '1' || !!process.env.VERCEL;
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
