import { ImageResponse } from 'next/og';

// Generates the og:image and twitter:image at build time via the Next.js
// file-based convention. Auto-picked up for `/` and any route without its
// own opengraph-image.tsx.

export const alt = 'DriftGrid — Design iteration for agents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          background: '#0a0a0a',
          color: '#f5f5f5',
          fontFamily: 'monospace',
          padding: '80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: '#22c55e',
            }}
          />
          <div style={{ fontSize: 24, letterSpacing: '0.2em', color: '#888' }}>
            DRIFTGRID
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 96, lineHeight: 1, color: '#f5f5f5', letterSpacing: '-0.02em' }}>
            Design iteration
          </div>
          <div style={{ fontSize: 96, lineHeight: 1, color: '#555', letterSpacing: '-0.02em' }}>
            for agents.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 18, color: '#555', letterSpacing: '0.1em' }}>
          <div>VERSION · COMPARE · SHARE</div>
          <div>DRIFTGRID.AI</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
