'use client';

import { useEffect, useState } from 'react';
import type { TourStep } from '@/lib/hooks/useTour';

interface TourOverlayProps {
  step: TourStep | null;
  stepIndex: number;
  totalSteps: number;
  onDismiss: () => void;
  onNext: () => void;
}

/**
 * Floating card in the bottom-right that walks visitors through DriftGrid.
 * Shows one step at a time. Non-blocking. Has an explicit Next button so users
 * can advance without performing the keyboard action, and clear "Try:" labeling
 * on the key chips so they're obviously hints, not interactive buttons.
 */
export function TourOverlay({ step, stepIndex, totalSteps, onDismiss, onNext }: TourOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (step) setMounted(true);
  }, [step]);

  if (!step) return null;

  const isLast = stepIndex >= totalSteps - 1;

  return (
    <div
      key={stepIndex}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 340,
        background: 'rgba(10, 10, 10, 0.94)',
        color: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: '18px 20px 16px',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
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

      {/* Top row: step counter + Skip */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          color: 'rgba(255, 255, 255, 0.35)',
          textTransform: 'uppercase',
        }}>
          Tour · {stepIndex + 1} / {totalSteps}
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.35)',
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: 0,
          }}
          title="Skip tour"
        >
          Skip ✕
        </button>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.95)',
        marginBottom: 8,
        marginTop: 4,
      }}>
        {step.eyebrow}
      </div>

      {/* Hint */}
      <div style={{
        fontSize: 12,
        lineHeight: 1.55,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: step.keys?.length ? 14 : 16,
      }}>
        {step.hint}
      </div>

      {/* "Try:" row with keyboard chips (clearly labeled as hints, not buttons) */}
      {step.keys && step.keys.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{
            fontSize: 9,
            letterSpacing: '0.14em',
            color: 'rgba(255, 255, 255, 0.3)',
            textTransform: 'uppercase',
          }}>
            Try
          </span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {step.keys.map((k, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 22,
                  height: 22,
                  padding: '0 7px',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.75)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 4,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom: Next button */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={isLast ? onDismiss : onNext}
          style={{
            padding: '8px 16px',
            background: 'rgba(255, 255, 255, 0.92)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          {isLast ? 'Done' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
