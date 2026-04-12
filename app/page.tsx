import { Dashboard } from '@/components/Dashboard';
import { LandingPage } from '@/components/LandingPage';
import { getUser } from '@/lib/auth';
import { isCloudMode } from '@/lib/supabase';

/**
 * Root page routing — three cases:
 *
 *   1. Local dev (no cloud mode)        → Dashboard (free tier, no auth, direct access)
 *   2. Cloud mode, unauthenticated      → LandingPage (marketing + sign-up CTA)
 *   3. Cloud mode, authenticated        → Dashboard (user's project list)
 */
export default async function Home() {
  if (!isCloudMode()) {
    return <Dashboard />;
  }

  const user = await getUser();
  if (!user) {
    return <LandingPage />;
  }

  return <Dashboard />;
}
