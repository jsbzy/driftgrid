import { notFound } from 'next/navigation';
import ReviewClient from './ReviewClient';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Public review page — /r/{slug}
 *
 * No authentication required. Clients view designs, navigate
 * concepts/versions, and leave annotations without an account.
 */
export default async function ReviewPage({ params }: Props) {
  const { slug } = await params;

  // Fetch review link data server-side
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/r/${slug}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    if (res.status === 404) notFound();
    if (res.status === 410) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>This review link has expired.</p>
          </div>
        </div>
      );
    }
    notFound();
  }

  const data = await res.json();

  if (data.requiresPassword) {
    return <ReviewClient slug={slug} requiresPassword />;
  }

  return <ReviewClient slug={slug} initialData={data} />;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return {
    title: `Review — ${slug} | DriftGrid`,
    robots: 'noindex, nofollow',
  };
}
