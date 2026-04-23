'use client';
import { useState, useCallback } from 'react';
import type { Manifest, Concept } from '@/lib/types';

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
  activeRoundId: string | null,
) {
  const [lastDeleted, setLastDeleted] = useState<DeletedItem | null>(null);
  const [lastDrift, setLastDrift] = useState<DriftedItem | null>(null);

  // Round-aware read of the active concepts (mirrors useManifestMutations)
  const getActiveConcepts = useCallback((m: Manifest): Concept[] => {
    if (activeRoundId && m.rounds?.length) {
      const round = m.rounds.find(r => r.id === activeRoundId) || m.rounds[m.rounds.length - 1];
      return round?.concepts ?? [];
    }
    return m.concepts ?? [];
  }, [activeRoundId]);

  // Round-aware write — applies newConcepts to the active round and keeps the top-level alias in sync
  const withUpdatedConcepts = useCallback((m: Manifest, newConcepts: Concept[]): Manifest => {
    if (activeRoundId && m.rounds?.length) {
      return {
        ...m,
        rounds: m.rounds.map(r =>
          r.id === activeRoundId ? { ...r, concepts: newConcepts } : r
        ),
        concepts: newConcepts,
      };
    }
    return { ...m, concepts: newConcepts };
  }, [activeRoundId]);

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
      const concepts = getActiveConcepts(manifest);
      const newConcepts = concepts.map(c => {
        if (c.id !== conceptId) return c;
        return { ...c, versions: c.versions.filter(v => v.id !== versionId) };
      }).filter(c => c.versions.length > 0);
      const updated = withUpdatedConcepts(manifest, newConcepts);
      await fetch(`/api/manifest/${client}/${project}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const ci = newConcepts.findIndex(c => c.id === conceptId);
      if (ci >= 0) {
        const maxVi = newConcepts[ci].versions.length - 1;
        setConceptIndex(ci);
        setVersionIndex(Math.min(versionIndex, maxVi));
      }
      mutate();
      setLastDrift(null);
      return;
    }

    // Undo delete: restore the version to the active round
    if (!lastDeleted || !manifest) return;

    const concepts = getActiveConcepts(manifest);
    const target = concepts.find(c => c.id === lastDeleted.conceptId);
    if (!target) {
      // Concept was removed (last version deleted) — can't undo cleanly yet
      setLastDeleted(null);
      return;
    }
    const newConcepts = concepts.map(c => {
      if (c.id !== lastDeleted.conceptId) return c;
      const restoredVersions = [...c.versions, lastDeleted.version as Concept['versions'][0]];
      restoredVersions.sort((a, b) => a.number - b.number);
      return { ...c, versions: restoredVersions };
    });
    const updated = withUpdatedConcepts(manifest, newConcepts);

    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    const ci = newConcepts.findIndex(c => c.id === lastDeleted.conceptId);
    const vi = newConcepts[ci]?.versions.findIndex(v => v.id === lastDeleted.versionId) ?? 0;
    setConceptIndex(ci >= 0 ? ci : 0);
    setVersionIndex(vi >= 0 ? vi : 0);
    mutate();
    setLastDeleted(null);
  }, [lastDeleted, lastDrift, manifest, client, project, versionIndex, mutate, setConceptIndex, setVersionIndex, getActiveConcepts, withUpdatedConcepts]);

  return {
    lastDeleted,
    lastDrift,
    trackDelete,
    trackDrift,
    handleUndo,
  };
}
