'use client';

import { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
}

// Global toast state accessible from anywhere
let addToastGlobal: ((text: string, type?: ToastType) => void) | null = null;

export function toast(text: string, type: ToastType = 'success') {
  addToastGlobal?.(text, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: ToastType = 'success') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastGlobal = addToast;
    return () => { addToastGlobal = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 16,
      zIndex: 400,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {toasts.map(t => {
        const styles =
          t.type === 'error'
            ? { color: '#fca5a5', background: 'rgba(220, 38, 38, 0.9)', border: '1px solid transparent' }
            : t.type === 'info'
              ? { color: 'rgba(255,255,255,0.7)', background: 'rgba(30,30,30,0.7)', border: '1px solid rgba(255,255,255,0.08)' }
              : { color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.7)', border: '1px solid transparent' };
        return (
          <div
            key={t.id}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              color: styles.color,
              background: styles.background,
              border: styles.border,
              backdropFilter: 'blur(8px)',
              animation: 'toastIn 0.2s ease',
            }}
          >
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
