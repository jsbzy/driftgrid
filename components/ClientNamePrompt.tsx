'use client';

import { useState, useRef, useEffect } from 'react';

interface ClientNamePromptProps {
  onSubmit: (name: string) => void;
}

/**
 * Full-screen overlay prompting the client to enter their name.
 * Name is stored in localStorage for future visits.
 */
export function ClientNamePrompt({ onSubmit }: ClientNamePromptProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          width: 360,
          background: 'rgba(20, 20, 20, 0.95)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 32,
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
            marginBottom: 12,
          }}
        >
          Review Mode
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 16,
            fontWeight: 500,
            color: '#fff',
            marginBottom: 6,
          }}
        >
          What's your name?
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.4)',
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          Your comments will be attributed to this name.
        </div>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            e.stopPropagation();
          }}
          placeholder="e.g. Alex"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 14,
            color: '#fff',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '10px 0',
            borderRadius: 8,
            border: 'none',
            background: name.trim() ? '#fff' : 'rgba(255,255,255,0.1)',
            color: name.trim() ? '#000' : 'rgba(255,255,255,0.3)',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: name.trim() ? 'pointer' : 'default',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
