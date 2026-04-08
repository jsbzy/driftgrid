import { notFound } from 'next/navigation';
import { resolveShareToken } from '@/lib/auth';
import { getManifest } from '@/lib/storage';
import { Viewer } from '@/components/Viewer';

/**
 * Share link page: /s/{token}
 * Shows the review view for a shared project without requiring authentication.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await resolveShareToken(token);

  if (!share) {
    notFound();
  }

  // Verify the project exists in storage
  const manifest = await getManifest(share.userId, share.client, share.project);
  if (!manifest) {
    notFound();
  }

  return <Viewer client={share.client} project={share.project} mode="client" shareToken={token} />;
}
