'use client';

import { useEffect, useState } from 'react';
import type { TourStep } from '@/lib/hooks/useTour';

interface TourOverlayProps {
  step: TourStep | null;
  stepIndex: number;
  onDismiss: () => void;
}

/**
 * Floating card in the bottom-right that walks visitors through DriftGrid.
 * Shows one step at a time. Non-blocking. Fade in/out.
 */
export function TourOverlay({ step, stepIndex, onDismiss }: TourOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (step) setMounted(true);
  }, [step]);

  if (!step) return null;

  return (
    <div
      key={stepIndex}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 320,
        background: 'rgba(10, 10, 10, 0.92)',
        color: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
        padding: '16px 18px',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 200,
        animation: mounted ? 'tourCardFadeIn 250ms ease-out' : undefined,
      }}
    >
      <style>{`
        @keyframes tourCardFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          color: 'rgba(255, 255, 255, 0.4)',
          textTransform: 'uppercase',
        }}>
          {step.eyebrow}
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.3)',
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: 0,
          }}
          title="Skip tour"
        >
          Skip
        </button>
      </div>

      {/* Hint */}
      <div style={{
        fontSize: 12,
        lineHeight: 1.55,
        color: 'rgba(255, 255, 255, 0.85)',
        marginBottom: step.keys?.length ? 12 : 0,
      }}>
        {step.hint}
      </div>

      {/* Key chips */}
      {step.keys && step.keys.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {step.keys.map((k, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                padding: '0 8px',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 4,
              }}
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
