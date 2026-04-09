'use client';

/**
 * Teaser landing page — static crosshair grid with wordmark.
 */
export function LandingPage() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0a0a0a',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Grid lines */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage:
          `linear-gradient(rgba(255,255,255,0.03) 0.5px, transparent 0.5px),
           linear-gradient(90deg, rgba(255,255,255,0.03) 0.5px, transparent 0.5px)`,
        backgroundSize: '40px 40px',
      }} />

      {/* Center crosshair — slightly brighter lines */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: '0.5px',
        background: 'rgba(255,255,255,0.06)',
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: '0.5px',
        background: 'rgba(255,255,255,0.06)',
      }} />

      {/* Wordmark */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <h1 style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 15,
          fontWeight: 400,
          letterSpacing: '0.3em',
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'lowercase',
          margin: 0,
          padding: '8px 20px',
          background: '#0a0a0a',
        }}>
          driftgrid
        </h1>
        <p style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 400,
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.15)',
          marginTop: 12,
        }}>
          Design iteration for agents
        </p>
      </div>
    </div>
  );
}
