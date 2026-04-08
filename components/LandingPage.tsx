'use client';

import Link from 'next/link';

/**
 * Marketing landing page — shown at root URL for unauthenticated visitors in cloud mode.
 * Jeff will design the actual content — this is the structural shell.
 */
export function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
    }}>
      {/* Logo / Wordmark */}
      <div style={{
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        color: '#666',
        marginBottom: 48,
      }}>
        DriftGrid
      </div>

      {/* Hero */}
      <h1 style={{
        fontSize: 32,
        fontWeight: 500,
        textAlign: 'center' as const,
        lineHeight: 1.3,
        maxWidth: 560,
        marginBottom: 16,
      }}>
        Design iteration<br />for agents.
      </h1>

      <p style={{
        fontSize: 14,
        color: '#888',
        textAlign: 'center' as const,
        maxWidth: 440,
        lineHeight: 1.6,
        marginBottom: 48,
      }}>
        Your AI agent creates designs locally. Push to the cloud.
        Share with clients. Iterate. Present.
      </p>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link
          href="/login"
          style={{
            padding: '10px 24px',
            background: '#e5e5e5',
            color: '#0a0a0a',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textDecoration: 'none',
          }}
        >
          Get started — $12/mo
        </Link>
        <a
          href="https://github.com/jsbzy/driftgrid"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 24px',
            border: '1px solid #333',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: '#888',
            textDecoration: 'none',
          }}
        >
          Self-host free
        </a>
      </div>

      {/* Features */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 32,
        maxWidth: 640,
        marginTop: 80,
      }}>
        {[
          { title: 'Agent-native', desc: 'Your AI agent writes HTML. DriftGrid organizes it.' },
          { title: 'Client review', desc: 'Share a link. Clients browse and comment. No login.' },
          { title: 'Local-first', desc: 'Work offline. Push when ready. Your files, your system.' },
        ].map(f => (
          <div key={f.title}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{f.title}</div>
            <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 80,
        fontSize: 9,
        color: '#333',
        letterSpacing: '0.04em',
      }}>
        BZY Design
      </div>
    </div>
  );
}
