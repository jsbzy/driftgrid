'use client';
import { useState, useCallback } from 'react';
import type { Manifest } from '@/lib/types';

interface DeletedItem {
  conceptId: string;
  versionId: string;
  version: unknown;
  conceptIndex: number;
}

interface DriftedItem {
  conceptId: string;
  versionId: string;
}

export function useUndoManager(
  manifest: Manifest | null | undefined,
  client: string,
  project: string,
  mutate: () => Promise<Manifest | undefined>,
  setConceptIndex: (v: number) => void,
  setVersionIndex: (v: number | ((prev: number) => number)) => void,
  versionIndex: number,
) {
  const [lastDeleted, setLastDeleted] = useState<DeletedItem | null>(null);
  const [lastDrift, setLastDrift] = useState<DriftedItem | null>(null);

  const trackDelete = useCallback((item: DeletedItem) => {
    setLastDeleted(item);
    setLastDrift(null);
  }, []);

  const trackDrift = useCallback((item: DriftedItem) => {
    setLastDrift(item);
    setLastDeleted(null);
  }, []);

  const handleUndo = useCallback(async () => {
    // Undo drift: delete the version that was just created
    if (lastDrift && manifest) {
      const { conceptId, versionId } = lastDrift;
      const updated: Manifest = {
        ...manifest,
        concepts: manifest.concepts.map(c => {
          if (c.id !== conceptId) return c;
          return { ...c, versions: c.versions.filter(v => v.id !== versionId) };
        }).filter(c => c.versions.length > 0),
      };
      await fetch(`/api/manifest/${client}/${project}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      // Navigate back to the previous version
      const ci = updated.concepts.findIndex(c => c.id === conceptId);
      if (ci >= 0) {
        const maxVi = updated.concepts[ci].versions.length - 1;
        setConceptIndex(ci);
        setVersionIndex(Math.min(versionIndex, maxVi));
      }
      mutate();
      setLastDrift(null);
      return;
    }

    // Undo delete: restore the version
    if (!lastDeleted || !manifest) return;

    // Restore the version to the manifest — deep copy concepts to avoid mutating SWR cache
    const updated: Manifest = {
      ...manifest,
      concepts: manifest.concepts.map(c => {
        if (c.id !== lastDeleted.conceptId) return c;
        const restoredVersions = [...c.versions, lastDeleted.version as Manifest['concepts'][0]['versions'][0]];
        restoredVersions.sort((a, b) => a.number - b.number);
        return { ...c, versions: restoredVersions };
      }),
    };
    const concept = updated.concepts.find(c => c.id === lastDeleted.conceptId);
    if (!concept) {
      // Concept was removed — can't undo cleanly
      setLastDeleted(null);
      return;
    }

    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    // Navigate to restored version
    const ci = updated.concepts.findIndex(c => c.id === lastDeleted.conceptId);
    const vi = updated.concepts[ci]?.versions.findIndex(v => v.id === lastDeleted.versionId) ?? 0;
    setConceptIndex(ci >= 0 ? ci : 0);
    setVersionIndex(vi >= 0 ? vi : 0);
    mutate();
    setLastDeleted(null);
  }, [lastDeleted, lastDrift, manifest, client, project, versionIndex, mutate, setConceptIndex, setVersionIndex]);

  return {
    lastDeleted,
    lastDrift,
    trackDelete,
    trackDrift,
    handleUndo,
  };
}
