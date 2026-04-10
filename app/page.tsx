import { Dashboard } from '@/components/Dashboard';
import { LandingPage } from '@/components/LandingPage';
import { getUser } from '@/lib/auth';
import { isCloudMode } from '@/lib/supabase';

export default async function Home() {
  // Production (Vercel): always show landing page unless the user is logged in
  if (process.env.VERCEL) {
    if (isCloudMode()) {
      const user = await getUser();
      if (user) return <Dashboard />;
    }
    return <LandingPage />;
  }

  // Local dev: show dashboard (unless explicitly in cloud mode + logged out)
  if (isCloudMode()) {
    const user = await getUser();
    if (!user) return <LandingPage />;
  }

  return <Dashboard />;
}
