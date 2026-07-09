'use client';

/**
 * Inline "new project" form for the dashboard — works in both modes: local
 * writes to projects/ on disk, cloud writes to the signed-in user's Supabase
 * Storage (the standalone-web entry point). Thin wrapper over
 * POST /api/create-project; navigates to the new grid on success.
 */

import { useState } from 'react';

const CANVASES = [
  { value: 'desktop', label: 'Desktop · 1440 scroll' },
  { value: 'mobile', label: 'Mobile · 375 scroll' },
  { value: 'tablet', label: 'Tablet · 768 scroll' },
  { value: 'landscape-16-9', label: 'Slides · 1920×1080' },
  { value: 'a4-portrait', label: 'Document · A4' },
];

export function NewProjectForm({ onCancel }: { onCancel?: () => void }) {
  const [client, setClient] = useState('');
  const [project, setProject] = useState('');
  const [canvas, setCanvas] = useState('desktop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!client.trim() || !project.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: client.trim(), project: project.trim(), canvas }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create project');
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
      setBusy(false);
    }
  }

  const inputCls = 'text-xs py-2 px-3 border rounded bg-transparent';
  const inputStyle = { color: 'var(--foreground)', borderColor: 'var(--border)' } as const;

  return (
    <div className="max-w-md mx-auto text-left space-y-3 p-4 border rounded" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)', opacity: 0.6 }}>
        new project
      </div>
      <div className="flex gap-2">
        <input
          value={client} onChange={e => setClient(e.target.value)} placeholder="client (e.g. Acme)"
          className={`${inputCls} flex-1`} style={inputStyle} autoFocus
        />
        <input
          value={project} onChange={e => setProject(e.target.value)} placeholder="project (e.g. Landing Page)"
          onKeyDown={e => { if (e.key === 'Enter') create(); }}
          className={`${inputCls} flex-1`} style={inputStyle}
        />
      </div>
      <div className="flex items-center gap-2">
        <select value={canvas} onChange={e => setCanvas(e.target.value)} className={`${inputCls} flex-1`} style={inputStyle}>
          {CANVASES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button
          onClick={create} disabled={busy || !client.trim() || !project.trim()}
          className="text-[10px] tracking-widest uppercase py-2 px-4 border rounded shrink-0 disabled:opacity-40"
          style={{ color: 'var(--foreground)', borderColor: '#8b5cf6' }}
        >
          {busy ? '…' : 'create'}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-[10px] tracking-widest uppercase py-2 px-2" style={{ color: 'var(--muted)' }}>
            cancel
          </button>
        )}
      </div>
      {error && <div className="text-[11px]" style={{ color: '#ef4444' }}>{error}</div>}
    </div>
  );
}
