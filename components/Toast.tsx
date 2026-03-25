'use client';

import { useState, useEffect, useCallback } from 'react';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error';
}

// Global toast state accessible from anywhere
let addToastGlobal: ((text: string, type?: 'success' | 'error') => void) | null = null;

export function toast(text: string, type: 'success' | 'error' = 'success') {
  addToastGlobal?.(text, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
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
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius-md, 8px)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            color: t.type === 'error' ? '#fca5a5' : 'rgba(255,255,255,0.8)',
            background: t.type === 'error' ? 'rgba(220, 38, 38, 0.9)' : 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            animation: 'toastIn 0.2s ease',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
