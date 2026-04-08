'use client';

import { useEffect, useRef } from 'react';

/**
 * Minimalist teaser landing page — dot grid with subtle drift animation.
 */
export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let time = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      ctx!.scale(dpr, dpr);
    }

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);

      const spacing = 32;
      const cols = Math.ceil(w / spacing) + 2;
      const rows = Math.ceil(h / spacing) + 2;
      const cx = w / 2;
      const cy = h / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const baseX = col * spacing;
          const baseY = row * spacing;

          // Distance from center
          const dx = baseX - cx;
          const dy = baseY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const normDist = dist / maxDist;

          // Subtle drift: dots near center drift slowly, edges are still
          const driftAmount = (1 - normDist) * 3;
          const angle = Math.atan2(dy, dx) + time * 0.15;
          const x = baseX + Math.cos(angle + dist * 0.008) * driftAmount;
          const y = baseY + Math.sin(angle + dist * 0.008) * driftAmount;

          // Opacity: brighter near center, fading to edges
          const opacity = 0.06 + (1 - normDist) * 0.08;

          // Size: slightly larger near center
          const size = 0.8 + (1 - normDist) * 0.4;

          ctx!.beginPath();
          ctx!.arc(x, y, size, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx!.fill();
        }
      }

      time += 0.008;
      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

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
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />

      {/* Wordmark */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: '0.25em',
          color: 'rgba(255, 255, 255, 0.5)',
          textTransform: 'lowercase',
          margin: 0,
        }}>
          driftgrid
        </h1>
      </div>
    </div>
  );
}
