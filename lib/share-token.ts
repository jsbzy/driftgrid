import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Resolve a public share token to its owning project.
 *
 * DB-only by design. Earlier versions fell back to decoding the token as
 * `base64url(userId/client/project)` when no `share_links` row matched — that
 * bypassed `is_active`/`expires_at` entirely (revoking or expiring a share did
 * nothing) and let anyone who learned a user's UUID mint a working token for any
 * of their projects. A share is valid only if it has an active, unexpired row.
 */
export interface ResolvedShare {
  userId: string;
  client: string;
  project: string;
  roundNumber: number | null;
}

export async function resolveShareToken(token: string): Promise<ResolvedShare | null> {
  if (!token) return null;
  const supabase = getSupabaseAdmin();

  try {
    const { data } = await supabase
      .from('share_links')
      .select('user_id, client, project, expires_at, is_active, round_number')
      .eq('token', token)
      .single();

    if (data?.is_active && (!data.expires_at || new Date(data.expires_at) > new Date())) {
      return {
        userId: data.user_id,
        client: data.client,
        project: data.project,
        roundNumber: data.round_number ?? null,
      };
    }
  } catch {
    // No matching row / table unavailable → not a valid share.
  }

  return null;
}
