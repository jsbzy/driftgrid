'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
      style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
    >
      {loading ? '...' : 'sign out →'}
    </button>
  );
}
