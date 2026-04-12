'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ClientComment } from '@/lib/types';

const AUTHOR_KEY = 'driftgrid-client-name';

/**
 * Manages client comments for shared projects — backed by Supabase via
 * /api/s/{token}/comments. Comments are anonymous (author name stored in
 * localStorage). Returns both the raw comments and Annotation-compatible
 * objects for the existing overlay UI.
 */
export function useClientComments(shareToken: string | undefined) {
  const [comments, setComments] = useState<ClientComment[]>([]);
  const [authorName, setAuthorNameState] = useState<string>('');
  const [needsName, setNeedsName] = useState(false);
  const fetchedRef = useRef(false);

  // Load author name from localStorage
  useEffect(() => {
    if (!shareToken) return;
    const stored = localStorage.getItem(AUTHOR_KEY);
    if (stored) {
      setAuthorNameState(stored);
    } else {
      setNeedsName(true);
    }
  }, [shareToken]);

  const setAuthorName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(AUTHOR_KEY, trimmed);
    setAuthorNameState(trimmed);
    setNeedsName(false);
  }, []);

  // Fetch all comments for the share token
  useEffect(() => {
    if (!shareToken || fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`/api/s/${shareToken}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then((data: ClientComment[]) => setComments(data))
      .catch(() => {});
  }, [shareToken]);

  // Get comments for a specific version
  const getCommentsForVersion = useCallback(
    (conceptId: string, versionId: string): ClientComment[] => {
      return comments.filter(
        c => c.concept_id === conceptId && c.version_id === versionId
      );
    },
    [comments]
  );

  // Count comments per version (for grid badges)
  const getCommentCount = useCallback(
    (conceptId: string, versionId: string): number => {
      return comments.filter(
        c => c.concept_id === conceptId && c.version_id === versionId
      ).length;
    },
    [comments]
  );

  // Total comment counts per concept (for column badges)
  const getConceptCommentCount = useCallback(
    (conceptId: string): number => {
      return comments.filter(c => c.concept_id === conceptId).length;
    },
    [comments]
  );

  const addComment = useCallback(
    async (
      conceptId: string,
      versionId: string,
      body: string,
      xRel: number | null,
      yRel: number | null,
      elementSelector?: string,
      parentCommentId?: string,
    ): Promise<ClientComment | null> => {
      if (!shareToken || !authorName) return null;

      const res = await fetch(`/api/s/${shareToken}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: conceptId,
          version_id: versionId,
          author_name: authorName,
          body,
          x_rel: xRel,
          y_rel: yRel,
          element_selector: elementSelector ?? null,
          parent_comment_id: parentCommentId ?? null,
        }),
      });

      if (!res.ok) return null;
      const comment: ClientComment = await res.json();
      setComments(prev => [...prev, comment]);
      return comment;
    },
    [shareToken, authorName]
  );

  const resolveComment = useCallback(
    async (commentId: string): Promise<void> => {
      if (!shareToken) return;

      const comment = comments.find(c => c.id === commentId);
      if (!comment) return;
      const newStatus = comment.status === 'resolved' ? 'open' : 'resolved';

      const res = await fetch(`/api/s/${shareToken}/comments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_id: commentId, status: newStatus }),
      });

      if (res.ok) {
        const updated: ClientComment = await res.json();
        setComments(prev =>
          prev.map(c => c.id === commentId ? updated : c)
        );
      }
    },
    [shareToken, comments]
  );

  return {
    comments,
    authorName,
    needsName,
    setAuthorName,
    getCommentsForVersion,
    getCommentCount,
    getConceptCommentCount,
    addComment,
    resolveComment,
  };
}
