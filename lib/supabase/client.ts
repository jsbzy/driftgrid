import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Supabase client for server-side usage (API routes, server components).
 * Uses the service role key for admin operations.
 * Returns null if Supabase is not configured (local mode).
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Supabase client for client-side usage (browser components).
 * Uses the anon key — RLS policies enforce access control.
 * Returns null if Supabase is not configured (local mode).
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient<Database>(url, key);
}

/**
 * Check if cloud mode is available (Supabase is configured).
 */
export function isCloudEnabled(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
