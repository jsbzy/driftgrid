'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Annotation } from '@/lib/types';

interface AnnotationOverlayProps {
  annotations: Annotation[];
  editMode?: boolean;
  placingPin?: boolean;
  annotationMode?: boolean;
  onAdd: (x: number, y: number, text: string) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
}

interface PendingPin {
  x: number;
  y: number;
}

export function AnnotationOverlay({
  annotations,
  editMode,
  placingPin,
  annotationMode,
  onAdd,
  onResolve,
  onDelete,
}: AnnotationOverlayProps) {
  // Unified: overlay captures clicks when in legacy annotationMode OR when placing a pin in edit mode
  const isCapturing = annotationMode || (editMode && placingPin);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [activePin, setActivePin] = useState<string | null>(null);

  // Focus input when pending pin appears
  useEffect(() => {
    if (pendingPin && inputRef.current) {
      inputRef.current.focus();
    }
  }, [pendingPin]);

  // Close active pin popup on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingPin) {
          setPendingPin(null);
          setPendingText('');
        }
        if (activePin) {
          setActivePin(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingPin, activePin]);

  // Clear pending/active states when capture mode changes
  useEffect(() => {
    if (!isCapturing) {
      setPendingPin(null);
      setPendingText('');
      setActivePin(null);
    }
  }, [isCapturing]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isCapturing) return;
      // Don't place pins when clicking on existing pins or popups
      if ((e.target as HTMLElement).closest('[data-annotation-pin]') || (e.target as HTMLElement).closest('[data-annotation-popup]')) {
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const relativeX = (e.clientX - rect.left) / rect.width;
      const relativeY = (e.clientY - rect.top) / rect.height;

      setPendingPin({ x: relativeX, y: relativeY });
      setPendingText('');
      setActivePin(null);
    },
    [isCapturing]
  );

  const handleSubmitPending = useCallback(() => {
    if (!pendingPin || !pendingText.trim()) return;
    onAdd(pendingPin.x, pendingPin.y, pendingText.trim());
    setPendingPin(null);
    setPendingText('');
  }, [pendingPin, pendingText, onAdd]);

  const handlePinClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setActivePin(prev => (prev === id ? null : id));
      setPendingPin(null);
      setPendingText('');
    },
    []
  );

  // Determine popup position (above or below pin)
  const getPopupPosition = (y: number): 'above' | 'below' => {
    return y > 0.7 ? 'above' : 'below';
  };

  return (
    <div
      ref={containerRef}
      onClick={handleOverlayClick}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        pointerEvents: isCapturing ? 'auto' : 'none',
        cursor: isCapturing ? 'crosshair' : 'default',
      }}
    >
      {/* Pin placement indicator — shown during legacy annotation mode or unified edit pin placement */}
      {isCapturing && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent-orange)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.8)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Add Comment
          </span>
          <span
            className="hidden md:inline"
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            click to pin · Esc to cancel
          </span>
          <span
            className="md:hidden"
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            tap to pin
          </span>
        </div>
      )}

      {/* Existing pins */}
      {annotations.map((annotation, index) => {
        if (annotation.x === null || annotation.y === null) return null;
        const isActive = activePin === annotation.id;
        const popupPos = getPopupPosition(annotation.y);

        return (
          <div
            key={annotation.id}
            data-annotation-pin
            style={{
              position: 'absolute',
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isActive ? 15 : 12,
            }}
          >
            {/* Pin circle */}
            <button
              onClick={(e) => handlePinClick(e, annotation.id)}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                background: annotation.isClient ? 'var(--accent-orange)' : 'var(--foreground)',
                opacity: annotation.resolved ? 0.3 : 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s ease, opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              {index + 1}
            </button>

            {/* Pin popup */}
            {isActive && (
              <div
                data-annotation-popup
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  ...(popupPos === 'below'
                    ? { top: 22 }
                    : { bottom: 22 }),
                  width: 220,
                  background: 'rgba(20, 20, 20, 0.95)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: 10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  zIndex: 20,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Note text */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: annotation.resolved ? 'rgba(255,255,255,0.4)' : '#fff',
                    textDecoration: annotation.resolved ? 'line-through' : 'none',
                    marginBottom: 8,
                    wordBreak: 'break-word',
                  }}
                >
                  {annotation.text}
                </div>

                {/* Meta line */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 9,
                      color: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {annotation.isClient ? annotation.author : 'designer'}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Resolve toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onResolve(annotation.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: 'none',
                        background: annotation.resolved
                          ? 'rgba(34,197,94,0.15)'
                          : 'rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 9,
                        color: annotation.resolved
                          ? 'rgba(34,197,94,0.8)'
                          : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {annotation.resolved ? 'resolved' : 'resolve'}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(annotation.id);
                        setActivePin(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        border: 'none',
                        background: 'rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                        color: 'rgba(255,255,255,0.35)',
                        transition: 'color 0.15s ease, background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = '#ef4444';
                        (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Pending pin (new annotation input) */}
      {pendingPin && (
        <div
          data-annotation-popup
          style={{
            position: 'absolute',
            left: `${pendingPin.x * 100}%`,
            top: `${pendingPin.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pending pin dot */}
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--foreground)',
              border: '2px solid var(--accent-orange)',
              margin: '0 auto 6px',
            }}
          />

          {/* Input popup */}
          <div
            style={{
              width: 220,
              transform: 'translateX(calc(-50% + 8px))',
              background: 'rgba(20, 20, 20, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              padding: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitPending();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPendingPin(null);
                  setPendingText('');
                }
                // Stop propagation so keyboard shortcuts don't fire
                e.stopPropagation();
              }}
              placeholder="Add note..."
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 12,
                color: '#fff',
                lineHeight: 1.5,
              }}
            />
            <div
              style={{
                marginTop: 4,
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 9,
                color: 'rgba(255,255,255,0.25)',
              }}
            >
              Enter to save · Esc to cancel
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
