'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface UseClientEditsOptions {
  client: string;
  project: string;
  versionId: string;
  enabled: boolean;
}

interface UseClientEditsReturn {
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  edits: Record<string, string>;
  handleEditsChange: (allEdits: Record<string, string>) => void;
  clearEdits: () => void;
  hasEdits: boolean;
  editCount: number;
  viewEdited: boolean;
  setViewEdited: (v: boolean) => void;
}

function storageKey(client: string, project: string, versionId: string) {
  return `drift-edits:${client}/${project}/${versionId}`;
}

export function useClientEdits({
  client,
  project,
  versionId,
  enabled,
}: UseClientEditsOptions): UseClientEditsReturn {
  const [editMode, setEditModeRaw] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [viewEdited, setViewEdited] = useState(false);
  const editsRef = useRef(edits);
  editsRef.current = edits;

  // Load from localStorage when version changes
  useEffect(() => {
    if (!enabled) return;
    try {
      const key = storageKey(client, project, versionId);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        setEdits(parsed);
        // If there are saved edits, default to showing them
        if (Object.keys(parsed).length > 0) {
          setViewEdited(true);
        }
      } else {
        setEdits({});
      }
    } catch {
      setEdits({});
    }
  }, [client, project, versionId, enabled]);

  // Turn off edit mode when disabled
  useEffect(() => {
    if (!enabled) setEditModeRaw(false);
  }, [enabled]);

  // When exiting edit mode, auto-switch to edited view if edits exist
  const setEditMode = useCallback((v: boolean) => {
    setEditModeRaw(v);
    if (!v && Object.keys(editsRef.current).length > 0) {
      setViewEdited(true);
    }
  }, []);

  const handleEditsChange = useCallback(
    (allEdits: Record<string, string>) => {
      setEdits(allEdits);
      try {
        const key = storageKey(client, project, versionId);
        if (Object.keys(allEdits).length === 0) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(allEdits));
        }
      } catch {
        // localStorage full or unavailable
      }
    },
    [client, project, versionId]
  );

  const clearEdits = useCallback(() => {
    setEdits({});
    setViewEdited(false);
    try {
      localStorage.removeItem(storageKey(client, project, versionId));
    } catch {
      // ignore
    }
  }, [client, project, versionId]);

  return {
    editMode,
    setEditMode,
    edits,
    handleEditsChange,
    clearEdits,
    hasEdits: Object.keys(edits).length > 0,
    editCount: Object.keys(edits).length,
    viewEdited,
    setViewEdited,
  };
}
