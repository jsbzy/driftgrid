import { Dashboard } from '@/components/Dashboard';
import { LandingPage } from '@/components/LandingPage';
import { getUser } from '@/lib/auth';
import { isCloudMode } from '@/lib/supabase';

export default async function Home() {
  // Cloud mode: show landing page if not logged in
  if (isCloudMode()) {
    const user = await getUser();
    if (!user) {
      return <LandingPage />;
    }
  }

  return <Dashboard />;
}
