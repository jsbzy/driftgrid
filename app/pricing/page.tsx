'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * /pricing — DriftGrid Pro upgrade page.
 *
 * Shows Free vs Pro comparison with monthly/annual toggle.
 * Calls /api/stripe/checkout to redirect to Stripe Checkout.
 */
export default function PricingPage() {
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const monthlyPrice = interval === 'month' ? '$10' : '$8';
  const billedLabel = interval === 'month' ? '/mo' : '/mo · billed $96/yr';

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
        if (res.status === 401) {
          window.location.href = `/login?next=/pricing`;
        } else {
          setError(data.error || `Checkout failed (${res.status})`);
        }
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto px-6 py-16" style={{ fontFamily: 'var(--font-mono, monospace)' }}>

        <div className="flex items-center justify-between mb-12">
          <Link
            href="/"
            className="text-xs tracking-widest uppercase"
            style={{ color: 'var(--muted)' }}
          >
            ← DriftGrid
          </Link>
        </div>

        <h1 className="text-3xl mb-3" style={{ color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
          Pricing
        </h1>
        <p className="text-sm mb-10" style={{ color: 'var(--muted)' }}>
          Free gets you started. Pro unlocks the cloud.
        </p>

        {/* Interval toggle */}
        <div className="flex items-center gap-3 mb-10">
          <button
            onClick={() => setInterval('month')}
            className="text-xs tracking-widest uppercase py-1 px-3 rounded"
            style={{
              background: interval === 'month' ? 'var(--foreground)' : 'transparent',
              color: interval === 'month' ? 'var(--background)' : 'var(--muted)',
              border: `1px solid ${interval === 'month' ? 'var(--foreground)' : 'var(--border)'}`,
            }}
          >
            monthly
          </button>
          <button
            onClick={() => setInterval('year')}
            className="text-xs tracking-widest uppercase py-1 px-3 rounded"
            style={{
              background: interval === 'year' ? 'var(--foreground)' : 'transparent',
              color: interval === 'year' ? 'var(--background)' : 'var(--muted)',
              border: `1px solid ${interval === 'year' ? 'var(--foreground)' : 'var(--border)'}`,
            }}
          >
            annual · save 20%
          </button>
        </div>

        {/* Tier comparison */}
        <div className="grid grid-cols-2 gap-6">

          {/* Free tier */}
          <div className="p-6 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--muted)', opacity: 0.6 }}>
              Free
            </div>
            <div className="text-2xl mb-1" style={{ color: 'var(--foreground)' }}>
              $0
            </div>
            <div className="text-xs mb-6" style={{ color: 'var(--muted)' }}>
              forever
            </div>
            <ul className="space-y-2 text-xs" style={{ color: 'var(--foreground)' }}>
              <Feature text="Local projects (no cloud)" />
              <Feature text="1 share link, lifetime" />
              <Feature text="All core features" />
              <Feature text="MCP server" />
              <Feature text="File watcher" />
              <Feature text="BYO agent" />
            </ul>
          </div>

          {/* Pro tier */}
          <div className="p-6 rounded-lg border" style={{ borderColor: '#8b5cf6', boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.3)' }}>
            <div className="text-[10px] tracking-widest uppercase mb-1" style={{ color: '#8b5cf6' }}>
              Pro
            </div>
            <div className="text-2xl mb-1" style={{ color: 'var(--foreground)' }}>
              {monthlyPrice}<span className="text-sm" style={{ color: 'var(--muted)' }}>{billedLabel}</span>
            </div>
            <div className="text-xs mb-6" style={{ color: 'var(--muted)' }}>
              {interval === 'year' ? 'billed annually' : 'billed monthly'}
            </div>
            <ul className="space-y-2 text-xs mb-6" style={{ color: 'var(--foreground)' }}>
              <Feature text="Everything in Free" />
              <Feature text="Cloud sync across devices" highlight />
              <Feature text="Unlimited share links" highlight />
              <Feature text="Client commenting" highlight />
              <Feature text="Priority support" />
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-3 rounded text-xs tracking-widest uppercase cursor-pointer disabled:opacity-40"
              style={{
                background: '#8b5cf6',
                color: '#ffffff',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {loading ? '...' : 'upgrade to pro →'}
            </button>
            {error && (
              <p className="text-xs mt-3" style={{ color: '#e55', fontFamily: 'var(--font-mono, monospace)' }}>
                {error}
              </p>
            )}
          </div>

        </div>

        <p className="text-[10px] tracking-widest uppercase text-center mt-8" style={{ color: 'var(--muted)', opacity: 0.5 }}>
          open source · mit license · byo agent
        </p>
      </div>
    </div>
  );
}

function Feature({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span style={{ color: highlight ? '#8b5cf6' : 'var(--muted)', fontSize: '10px' }}>✓</span>
      <span style={{ color: highlight ? 'var(--foreground)' : 'var(--muted)' }}>{text}</span>
    </li>
  );
}
