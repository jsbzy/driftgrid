import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/auth';
import { isCloudMode } from '@/lib/supabase';
import { SignOutButton } from './sign-out-button';

export const metadata = {
  title: 'Account — DriftGrid',
};

export default async function AccountPage() {
  // Local dev doesn't have accounts.
  if (!isCloudMode()) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="max-w-sm space-y-4 text-center">
          <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            DriftGrid · local
          </div>
          <p className="text-sm" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono, monospace)' }}>
            Accounts are for cloud features only. Local dev runs entirely offline.
          </p>
          <Link
            href="/"
            className="inline-block text-xs tracking-widest uppercase"
            style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            ← back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const profile = await getProfile();
  if (!profile) {
    redirect('/login?next=/account');
  }

  const tierLabel = profile.tier === 'pro' ? 'Pro' : 'Free';
  const periodEnd = profile.subscription_period_end
    ? new Date(profile.subscription_period_end).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-lg mx-auto px-6 py-16 space-y-12" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs tracking-widest uppercase"
            style={{ color: 'var(--muted)' }}
          >
            ← DriftGrid
          </Link>
          <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            account
          </div>
        </div>

        <section className="space-y-4">
          <h1 className="text-xl" style={{ color: 'var(--foreground)' }}>
            {profile.display_name ?? profile.email}
          </h1>
          <Row label="email" value={profile.email} />
          <Row label="plan" value={tierLabel} />
          {profile.tier === 'pro' && profile.subscription_status && (
            <Row label="status" value={profile.subscription_status} />
          )}
          {profile.tier === 'pro' && periodEnd && (
            <Row label="renews" value={periodEnd} />
          )}
          <Row
            label="member since"
            value={new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          />
        </section>

        <section className="space-y-3">
          <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            billing
          </div>
          {profile.tier === 'free' ? (
            <Link
              href="/pricing"
              className="inline-block text-xs tracking-widest uppercase py-2 px-4 border rounded"
              style={{ color: 'var(--foreground)', borderColor: 'var(--border)' }}
            >
              upgrade to pro →
            </Link>
          ) : (
            <Link
              href="/api/stripe/portal"
              className="inline-block text-xs tracking-widest uppercase py-2 px-4 border rounded"
              style={{ color: 'var(--foreground)', borderColor: 'var(--border)' }}
            >
              manage billing →
            </Link>
          )}
        </section>

        <section className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)', opacity: 0.6 }}>
            session
          </div>
          <SignOutButton />
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)', opacity: 0.6 }}>
        {label}
      </div>
      <div className="text-xs" style={{ color: 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  );
}
