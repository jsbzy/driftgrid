'use client';

import { useState, useRef, useCallback } from 'react';
import type { Concept } from '@/lib/types';

interface ArrangeModalProps {
  concepts: Concept[];
  onSave: (newOrder: string[]) => void;
  onClose: () => void;
}

export function ArrangeModal({ concepts, onSave, onClose }: ArrangeModalProps) {
  const [order, setOrder] = useState(() => concepts.map(c => c.id));
  const dragItem = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragItem.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(() => {
    if (dragItem.current === null || dragOverIdx === null) return;
    const from = dragItem.current;
    const to = dragOverIdx;
    if (from !== to) {
      setOrder(prev => {
        const next = [...prev];
        const item = next.splice(from, 1)[0];
        next.splice(to, 0, item);
        return next;
      });
    }
    dragItem.current = null;
    setDragOverIdx(null);
  }, [dragOverIdx]);

  const handleDragEnd = useCallback(() => {
    dragItem.current = null;
    setDragOverIdx(null);
  }, []);

  const move = useCallback((idx: number, dir: -1 | 1) => {
    setOrder(prev => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const conceptMap = new Map(concepts.map(c => [c.id, c]));
  const hasChanged = order.some((id, i) => concepts[i]?.id !== id);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-[var(--background)] rounded-lg border border-[var(--border)] shadow-xl w-[360px] mx-4 max-h-[80vh] flex flex-col"
        style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
            Arrange
          </span>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-xs">✕</button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 py-1">
          {order.map((id, idx) => {
            const concept = conceptMap.get(id);
            if (!concept) return null;
            const isDragOver = dragOverIdx === idx;
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 px-5 py-2 cursor-grab active:cursor-grabbing transition-colors"
                style={{
                  background: isDragOver ? 'rgba(0,0,0,0.03)' : 'transparent',
                  borderTop: isDragOver ? '2px solid var(--foreground)' : '2px solid transparent',
                }}
              >
                {/* Position number */}
                <span className="text-[10px] w-4 text-right shrink-0" style={{ color: 'var(--muted)', opacity: 0.4 }}>
                  {idx + 1}
                </span>

                {/* Drag handle */}
                <svg width="8" height="14" viewBox="0 0 8 14" className="shrink-0" style={{ opacity: 0.2 }}>
                  <circle cx="2" cy="2" r="1" fill="currentColor"/><circle cx="6" cy="2" r="1" fill="currentColor"/>
                  <circle cx="2" cy="7" r="1" fill="currentColor"/><circle cx="6" cy="7" r="1" fill="currentColor"/>
                  <circle cx="2" cy="12" r="1" fill="currentColor"/><circle cx="6" cy="12" r="1" fill="currentColor"/>
                </svg>

                {/* Label */}
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--foreground)' }}>
                  {concept.label}
                </span>

                {/* Version count */}
                <span className="text-[9px] shrink-0" style={{ color: 'var(--muted)', opacity: 0.4 }}>
                  {concept.versions.length}
                </span>

                {/* Up/down */}
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); move(idx, -1); }}
                    className="text-[8px] leading-none px-0.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    style={{ visibility: idx === 0 ? 'hidden' : 'visible' }}
                  >▲</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); move(idx, 1); }}
                    className="text-[8px] leading-none px-0.5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    style={{ visibility: idx === order.length - 1 ? 'hidden' : 'visible' }}
                  >▼</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onClose}
            className="text-[10px] px-3 py-1.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors tracking-wide"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(order); onClose(); }}
            disabled={!hasChanged}
            className="text-[10px] px-3 py-1.5 rounded tracking-wide transition-all"
            style={{
              background: hasChanged ? 'var(--foreground)' : 'var(--border)',
              color: hasChanged ? 'var(--background)' : 'var(--muted)',
              cursor: hasChanged ? 'pointer' : 'default',
              opacity: hasChanged ? 1 : 0.5,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
