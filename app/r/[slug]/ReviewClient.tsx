'use client';

import { useState, useEffect } from 'react';

interface ReviewClientProps {
  slug: string;
  requiresPassword?: boolean;
  initialData?: any;
}

/**
 * Client-side review page component.
 * Handles password entry, design viewing, and annotations.
 */
export default function ReviewClient({ slug, requiresPassword, initialData }: ReviewClientProps) {
  const [data, setData] = useState(initialData);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(requiresPassword);
  const [selectedConcept, setSelectedConcept] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [reviewerName, setReviewerName] = useState('');

  // Load reviewer name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('driftgrid-reviewer-name');
    if (stored) setReviewerName(stored);
  }, []);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch(`/api/r/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      const result = await res.json();
      setData(result);
      setNeedsPassword(false);
    } else {
      setError('Incorrect password');
    }
    setLoading(false);
  }

  // Password gate
  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <form onSubmit={handlePasswordSubmit} className="w-full max-w-xs space-y-4">
          <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            review
          </div>
          <p className="text-sm" style={{ color: 'var(--foreground)' }}>
            This review is password protected.
          </p>
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
          {error && <p className="text-xs" style={{ color: '#e55' }}>{error}</p>}
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

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading...</p>
      </div>
    );
  }

  const { project, concepts, plan } = data;
  const concept = concepts?.[selectedConcept];
  const version = concept?.versions?.[selectedVersion];

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            {project?.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Concept tabs */}
          {concepts?.map((c: any, i: number) => (
            <button
              key={c.id}
              onClick={() => { setSelectedConcept(i); setSelectedVersion(0); }}
              className="px-3 py-1 text-xs font-mono cursor-pointer"
              style={{
                color: i === selectedConcept ? 'var(--foreground)' : 'var(--muted)',
                borderBottom: i === selectedConcept ? '2px solid var(--foreground)' : '2px solid transparent',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      {/* Version selector */}
      {concept && concept.versions.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          {concept.versions.map((v: any, i: number) => (
            <button
              key={v.id}
              onClick={() => setSelectedVersion(i)}
              className="px-2 py-1 text-xs font-mono cursor-pointer"
              style={{
                color: i === selectedVersion ? 'var(--foreground)' : 'var(--muted)',
                background: i === selectedVersion ? 'var(--border)' : 'transparent',
                borderRadius: '2px',
              }}
            >
              v{v.number}
            </button>
          ))}
        </div>
      )}

      {/* Design frame */}
      {version && (
        <div className="flex justify-center p-4">
          <iframe
            src={`/api/html/${project.client}/${project.slug}/${version.file}?mode=edit`}
            className="border"
            style={{
              borderColor: 'var(--border)',
              width: '100%',
              maxWidth: '1440px',
              height: '80vh',
            }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      {/* DriftGrid watermark (free tier) */}
      {plan === 'free' && (
        <div
          className="fixed bottom-4 right-4 px-3 py-1 text-xs font-mono"
          style={{
            color: 'var(--muted)',
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            opacity: 0.7,
          }}
        >
          Powered by DriftGrid
        </div>
      )}
    </div>
  );
}
