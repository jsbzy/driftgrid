/**
 * Server-side auth helpers for extracting user + profile info from requests.
 * Cloud-mode only — local dev has no auth and these helpers return null.
 */

import { cookies } from 'next/headers';
import { isCloudMode, getSupabaseAdmin } from './supabase';
import { createServerClient } from '@supabase/ssr';

export interface AuthUser {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  tier: 'free' | 'pro';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
  created_at: string;
  updated_at: string;
}

/** Get the current user from the request. Returns null in local mode or if not authenticated. */
export async function getUser(): Promise<AuthUser | null> {
  if (!isCloudMode()) return null;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only in server components/route handlers — cookie writes happen in middleware.
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  return { id: user.id, email: user.email || '' };
}

/** Get userId for storage operations. Returns null in local mode. */
export async function getUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.id ?? null;
}

/**
 * Get the current user's profile row (joins auth.users → public.profiles).
 * Returns null if not authenticated or if the profile row doesn't exist yet
 * (which shouldn't happen once the handle_new_user trigger is in place, but
 * we handle it defensively).
 */
export async function getProfile(): Promise<Profile | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

/**
 * Count the number of active share links owned by a user. Used for the
 * free-tier paywall check (free = max 1 lifetime share).
 */
export async function countUserShares(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('share_links')
    .select('token', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) return 0;
  return count ?? 0;
}

/** Resolve a share token to the project owner's userId + project info */
export async function resolveShareToken(token: string): Promise<{ userId: string; client: string; project: string } | null> {
  if (!isCloudMode()) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('share_links')
    .select('user_id, client, project, expires_at, is_active')
    .eq('token', token)
    .single();

  if (error || !data || !data.is_active) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  return { userId: data.user_id, client: data.client, project: data.project };
}
