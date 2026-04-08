/**
 * Server-side auth helpers for extracting user info from requests.
 * Works in both local mode (no auth needed) and cloud mode (Supabase session).
 */

import { cookies } from 'next/headers';
import { isCloudMode, getSupabaseAdmin } from './supabase';
import { createServerClient } from '@supabase/ssr';

export interface AuthUser {
  id: string;
  email: string;
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
          // Read-only in server components/route handlers — cookie writes happen in middleware
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  return { id: user.id, email: user.email || '' };
}

/** Get userId for storage operations. Returns null in local mode (storage ignores null userId). */
export async function getUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.id ?? null;
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
