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

  // Fetch annotations when viewing a frame
  useEffect(() => {
    if (!conceptId || !versionId || viewMode !== 'frame') {
      setAnnotations([]);
      return;
    }
    if (shareToken) {
      // In share mode, only show demo annotations
      const key = `${conceptId}:${versionId}`;
      setAnnotations(demoAnnotations[key] || []);
      return;
    }
    fetch(`/api/annotations?client=${client}&project=${project}&conceptId=${conceptId}&versionId=${versionId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAnnotations(data); })
      .catch(() => {});
  }, [client, project, conceptId, versionId, viewMode, shareToken, demoAnnotations]);

  // Clear annotation mode when leaving frame
  useEffect(() => {
    if (viewMode !== 'frame') setAnnotationMode(false);
  }, [viewMode]);

  const handleAddAnnotation = useCallback(async (x: number, y: number, text: string) => {
    if (!conceptId || !versionId) return;

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
      };
      const key = `${conceptId}:${versionId}`;
      setDemoAnnotations(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), annotation],
      }));
      setAnnotations(prev => [...prev, annotation]);
      setAnnotationMode(false);
      toast('Comment added');
      return;
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
      }),
    });
    if (res.ok) {
      const annotation = await res.json();
      setAnnotations(prev => [...prev, annotation]);
      setAnnotationMode(false);
      toast('Annotation added');
    }
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

  return {
    annotations,
    annotationMode,
    setAnnotationMode,
    handleAddAnnotation,
    handleDeleteAnnotation,
    handleResolveAnnotation,
  };
}
