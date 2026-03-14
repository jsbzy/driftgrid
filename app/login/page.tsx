'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          drift
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoFocus
          className="w-full bg-transparent border-b outline-none py-2 text-sm font-mono"
          style={{
            borderColor: error ? '#e55' : 'var(--border)',
            color: 'var(--foreground)',
          }}
        />
        {error && (
          <p className="text-xs" style={{ color: '#e55' }}>
            incorrect password
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="text-xs tracking-widest uppercase cursor-pointer disabled:opacity-30"
          style={{ color: 'var(--muted)' }}
        >
          {loading ? '...' : 'enter'}
        </button>
      </form>
    </div>
  );
}
