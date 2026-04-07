'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await res.json();

    if (res.ok) {
      if (data.confirmEmail) {
        setSuccess(true);
      } else {
        router.push('/');
      }
    } else {
      setError(data.error || 'Failed to sign up');
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    const res = await fetch('/api/auth/oauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-xs space-y-4 text-center">
          <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            check your email
          </div>
          <p className="text-sm" style={{ color: 'var(--foreground)' }}>
            We sent a confirmation link to <strong>{email}</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-xs space-y-6">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          driftgrid
        </div>

        {/* OAuth buttons */}
        <div className="space-y-2">
          <button
            onClick={() => handleOAuth('google')}
            className="w-full py-2 text-sm font-mono border cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'transparent' }}
          >
            Continue with Google
          </button>
          <button
            onClick={() => handleOAuth('github')}
            className="w-full py-2 text-sm font-mono border cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'transparent' }}
          >
            Continue with GitHub
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>or</span>
          <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            className="w-full bg-transparent border-b outline-none py-2 text-sm font-mono"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            required
            className="w-full bg-transparent border-b outline-none py-2 text-sm font-mono"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            required
            minLength={8}
            className="w-full bg-transparent border-b outline-none py-2 text-sm font-mono"
            style={{ borderColor: error ? '#e55' : 'var(--border)', color: 'var(--foreground)' }}
          />
          {error && (
            <p className="text-xs" style={{ color: '#e55' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--muted)' }}
          >
            {loading ? '...' : 'create account'}
          </button>
        </form>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Already have an account?{' '}
          <a href="/login" className="underline" style={{ color: 'var(--foreground)' }}>
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
