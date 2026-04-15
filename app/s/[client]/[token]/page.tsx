import { notFound, redirect } from 'next/navigation';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { Viewer } from '@/components/Viewer';

/**
 * Share link page: `/s/{client-slug}/{token}`
 *
 * The token is the sole security primitive — the client-slug is cosmetic, it only
 * gives the URL readable context. DB lookup is by token alone. If the slug in the
 * URL doesn't match the share's actual client, we redirect to the canonical URL so
 * bookmarks stay truthful.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ client: string; token: string }>;
}) {
  const { client: urlClient, token } = await params;

  let userId: string | undefined;
  let actualClient: string | undefined;
  let project: string | undefined;

  if (isCloudMode()) {
    const supabase = getSupabaseAdmin();
    try {
      const { data } = await supabase
        .from('share_links')
        .select('user_id, client, project, expires_at, is_active')
        .eq('token', token)
        .single();

      if (data?.is_active) {
        if (!data.expires_at || new Date(data.expires_at) > new Date()) {
          userId = data.user_id;
          actualClient = data.client;
          project = data.project;
        }
      }
    } catch {
      // Table not yet in schema cache — fall through to base64url decode
    }
  }

  // Fallback: base64url-encoded `userId/client/project` (legacy)
  if (!actualClient) {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = decoded.split('/');
      if (parts.length === 3) {
        userId = parts[0];
        actualClient = parts[1];
        project = parts[2];
      }
    } catch {
      // Invalid token
    }
  }

  if (!actualClient || !project) {
    notFound();
  }

  // Cosmetic redirect: if URL client slug doesn't match the share's actual client,
  // canonicalize so bookmarked URLs always reflect reality.
  if (urlClient !== actualClient) {
    redirect(`/s/${actualClient}/${token}`);
  }

  // Verify the project exists in storage before rendering
  if (isCloudMode() && userId) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from('projects')
      .download(`${userId}/${actualClient}/${project}/manifest.json`);
    if (error) notFound();
  }

  return <Viewer client={actualClient} project={project} mode="client" shareToken={token} />;
}
