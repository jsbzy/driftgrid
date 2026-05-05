'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Annotation } from '@/lib/types';
import { toast } from '@/components/Toast';

/**
 * Manages annotation state — fetching, adding, deleting pins on frames.
 *
 * In share mode (shareToken present), all mutations are client-side only —
 * comments persist in the session but reset on reload. This lets demo
 * visitors try the comment flow without writing to anyone's storage.
 */
export function useAnnotationState(
  client: string,
  project: string,
  conceptId: string | undefined,
  versionId: string | undefined,
  viewMode: 'frame' | 'grid',
  shareToken?: string,
) {
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  // Demo annotations: keyed by `${conceptId}:${versionId}` so each card has its own list
  const [demoAnnotations, setDemoAnnotations] = useState<Record<string, Annotation[]>>({});

  // Fetch annotations whenever the current card selection changes.
  // We fetch in both frame AND grid view so the grid prompt panel can
  // detect existing whole-version prompts and reply threads on drift slots.
  //
  // Agents can POST threaded replies at any time (Option A flow), so we also:
  //   • Refetch on window focus (user comes back from their agent chat)
  //   • Poll every 4s as a fallback so replies surface without a refresh
  useEffect(() => {
    if (!conceptId || !versionId) {
      setAnnotations([]);
      return;
    }
    if (shareToken) {
      // In share mode, only show demo annotations
      const key = `${conceptId}:${versionId}`;
      setAnnotations(demoAnnotations[key] || []);
      return;
    }

    // Clear immediately on navigation so pins from the previous frame don't
    // linger while the new fetch is in flight (or never returns). Without this,
    // a slow / failed fetch leaves the old frame's pins rendered indefinitely.
    setAnnotations([]);

    let cancelled = false;
    const url = `/api/annotations?client=${client}&project=${project}&conceptId=${conceptId}&versionId=${versionId}`;

    const fetchAnnotations = () => {
      fetch(url)
        .then(r => r.json())
        .then(data => {
          if (cancelled) return;
          if (Array.isArray(data)) {
            setAnnotations(prev => {
              // Avoid spurious re-renders if nothing actually changed
              if (prev.length === data.length) {
                const prevKey = prev.map(a => `${a.id}:${a.text.length}:${a.resolved ? 1 : 0}`).join('|');
                const nextKey = data.map(a => `${a.id}:${a.text.length}:${a.resolved ? 1 : 0}`).join('|');
                if (prevKey === nextKey) return prev;
              }
              return data;
            });
          }
        })
        .catch(() => {});
    };

    fetchAnnotations();
    const interval = setInterval(fetchAnnotations, 4000);
    const onFocus = () => fetchAnnotations();
    const onVisible = () => { if (!document.hidden) fetchAnnotations(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [client, project, conceptId, versionId, shareToken, demoAnnotations]);

  // Clear annotation mode when leaving frame
  useEffect(() => {
    if (viewMode !== 'frame') setAnnotationMode(false);
  }, [viewMode]);

  const handleAddAnnotation = useCallback(async (x: number | null, y: number | null, text: string, provider?: string): Promise<Annotation | null> => {
    if (!conceptId || !versionId) return null;

    if (shareToken) {
      // Client-side only — persist in demoAnnotations state
      const annotation: Annotation = {
        id: 'demo-' + Math.random().toString(36).substring(2, 10),
        x, y,
        element: null,
        text,
        author: 'You',
        isClient: true,
        isAgent: false,
        created: new Date().toISOString(),
        resolved: false,
        parentId: null,
        ...(provider ? { provider } : {}),
      };
      const key = `${conceptId}:${versionId}`;
      setDemoAnnotations(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), annotation],
      }));
      setAnnotations(prev => [...prev, annotation]);
      setAnnotationMode(false);
      toast('Prompt placed');
      return annotation;
    }

    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId,
        versionId,
        x, y, text,
        author: 'designer',
        isClient: false,
        ...(provider ? { provider } : {}),
      }),
    });
    if (res.ok) {
      const annotation = await res.json();
      setAnnotations(prev => [...prev, annotation]);
      setAnnotationMode(false);
      // Don't toast on whole-version (drift prompt) saves — the caller handles its own feedback
      if (x !== null && y !== null) {
        toast('Prompt placed');
      }
      return annotation;
    }
    return null;
  }, [client, project, conceptId, versionId, shareToken]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    if (!conceptId || !versionId) return;

    if (shareToken) {
      const key = `${conceptId}:${versionId}`;
      setDemoAnnotations(prev => ({
        ...prev,
        [key]: (prev[key] || []).filter(a => a.id !== id),
      }));
      setAnnotations(prev => prev.filter(a => a.id !== id));
      return;
    }

    await fetch('/api/annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId,
        versionId,
        annotationId: id,
      }),
    });
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, [client, project, conceptId, versionId, shareToken]);

  const handleResolveAnnotation = useCallback(async (id: string) => {
    if (!conceptId || !versionId) return;
    const res = await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId,
        versionId,
        annotationId: id,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: updated.resolved } : a));
    }
  }, [client, project, conceptId, versionId]);

  const handleEditAnnotation = useCallback(async (id: string, text: string) => {
    if (!conceptId || !versionId) return;

    if (shareToken) {
      // Demo mode: update locally only
      const key = `${conceptId}:${versionId}`;
      setDemoAnnotations(prev => ({
        ...prev,
        [key]: (prev[key] || []).map(a => a.id === id ? { ...a, text } : a),
      }));
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text } : a));
      return;
    }

    const res = await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId,
        versionId,
        annotationId: id,
        text,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text: updated.text } : a));
    }
  }, [client, project, conceptId, versionId, shareToken]);

  const handleReplyAnnotation = useCallback(async (parentId: string, text: string, asAgent: boolean = false) => {
    if (!conceptId || !versionId) return;

    if (shareToken) {
      const reply: Annotation = {
        id: 'demo-' + Math.random().toString(36).substring(2, 10),
        x: null, y: null,
        element: null,
        text,
        author: asAgent ? 'agent' : 'You',
        isClient: !asAgent,
        isAgent: asAgent,
        created: new Date().toISOString(),
        resolved: false,
        parentId,
      };
      const key = `${conceptId}:${versionId}`;
      setDemoAnnotations(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), reply],
      }));
      setAnnotations(prev => [...prev, reply]);
      return;
    }

    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId,
        versionId,
        x: null, y: null,
        text,
        author: asAgent ? 'agent' : 'designer',
        isClient: false,
        isAgent: asAgent,
        parentId,
      }),
    });
    if (res.ok) {
      const reply = await res.json();
      setAnnotations(prev => [...prev, reply]);
    }
  }, [client, project, conceptId, versionId, shareToken]);

  const handleSetAnnotationStatus = useCallback(async (id: string, status: 'running' | null) => {
    if (!conceptId || !versionId) return;

    if (shareToken) {
      const next = status === null ? undefined : status;
      const key = `${conceptId}:${versionId}`;
      setDemoAnnotations(prev => ({
        ...prev,
        [key]: (prev[key] || []).map(a => a.id === id ? { ...a, status: next } : a),
      }));
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, status: next } : a));
      return;
    }

    const res = await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId,
        versionId,
        annotationId: id,
        status,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, status: updated.status } : a));
    }
  }, [client, project, conceptId, versionId, shareToken]);

  return {
    annotations,
    annotationMode,
    setAnnotationMode,
    handleAddAnnotation,
    handleDeleteAnnotation,
    handleResolveAnnotation,
    handleEditAnnotation,
    handleReplyAnnotation,
    handleSetAnnotationStatus,
  };
}
