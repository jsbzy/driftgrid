'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Annotation } from '@/lib/types';
import { toast } from '@/components/Toast';

/**
 * Manages annotation state — fetching, adding, deleting pins on frames.
 */
export function useAnnotationState(
  client: string,
  project: string,
  conceptId: string | undefined,
  versionId: string | undefined,
  viewMode: 'frame' | 'grid'
) {
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Fetch annotations when viewing a frame
  useEffect(() => {
    if (!conceptId || !versionId || viewMode !== 'frame') {
      setAnnotations([]);
      return;
    }
    fetch(`/api/annotations?client=${client}&project=${project}&conceptId=${conceptId}&versionId=${versionId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAnnotations(data); })
      .catch(() => {});
  }, [client, project, conceptId, versionId, viewMode]);

  // Clear annotation mode when leaving frame
  useEffect(() => {
    if (viewMode !== 'frame') setAnnotationMode(false);
  }, [viewMode]);

  const handleAddAnnotation = useCallback(async (x: number, y: number, text: string) => {
    if (!conceptId || !versionId) return;
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
  }, [client, project, conceptId, versionId]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    if (!conceptId || !versionId) return;
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
  }, [client, project, conceptId, versionId]);

  return {
    annotations,
    annotationMode,
    setAnnotationMode,
    handleAddAnnotation,
    handleDeleteAnnotation,
  };
}
