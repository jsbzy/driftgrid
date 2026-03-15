'use client';

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

interface HtmlFrameProps {
  src: string;
  canvasWidth?: number;
  canvasHeight?: number;
  editMode?: boolean;
  showEdits?: boolean;
  hasEdits?: boolean;
  savedEdits?: Record<string, string>;
  onEditsChange?: (allEdits: Record<string, string>) => void;
}

export interface HtmlFrameHandle {
  getHtml: () => string | null;
}

export const HtmlFrame = forwardRef<HtmlFrameHandle, HtmlFrameProps>(
  function HtmlFrame({ src, canvasWidth, canvasHeight, editMode, showEdits, hasEdits, savedEdits, onEditsChange }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);
    const [iframeReady, setIframeReady] = useState(false);

    // Keep edit script loaded whenever editing or edits exist (avoids iframe reloads on toggle)
    const needsEditScript = editMode || hasEdits;
    const editSrc = needsEditScript ? `${src}${src.includes('?') ? '&' : '?'}mode=edit` : src;

    // Reset ready state when src changes
    useEffect(() => {
      setIframeReady(false);
    }, [editSrc]);

    useEffect(() => {
      if (iframeRef.current) {
        iframeRef.current.scrollTop = 0;
      }
    }, [editSrc]);

    // Handle iframe load
    const handleLoad = useCallback(() => {
      setIframeReady(true);
    }, []);

    // Ref for savedEdits to avoid re-triggering the effect on every keystroke
    const savedEditsRef = useRef(savedEdits);
    savedEditsRef.current = savedEdits;

    // Send messages based on mode
    useEffect(() => {
      if (!iframeReady || !iframeRef.current?.contentWindow) return;
      const win = iframeRef.current.contentWindow;

      if (editMode) {
        // Edit mode: restore edits + enable editing
        const edits = savedEditsRef.current;
        if (edits && Object.keys(edits).length > 0) {
          win.postMessage({ type: 'drift:restore-edits', edits }, '*');
        }
        win.postMessage({ type: 'drift:enable-edit' }, '*');
      } else {
        // Not editing: disable editing UI
        win.postMessage({ type: 'drift:disable-edit' }, '*');
        if (showEdits) {
          // Show edited content (no outlines)
          const edits = savedEditsRef.current;
          if (edits && Object.keys(edits).length > 0) {
            win.postMessage({ type: 'drift:restore-edits', edits }, '*');
          }
        } else if (hasEdits) {
          // Has edits but viewing original — reset content
          win.postMessage({ type: 'drift:show-originals' }, '*');
        }
      }
    }, [editMode, showEdits, hasEdits, iframeReady]);

    // Listen for edit-change messages from iframe
    useEffect(() => {
      if (!onEditsChange) return;
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'drift:edit-change') {
          onEditsChange(e.data.allEdits);
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }, [onEditsChange]);

    useEffect(() => {
      if (!canvasWidth || !canvasHeight || !containerRef.current) return;

      const updateScale = () => {
        const container = containerRef.current;
        if (!container) return;
        const scaleX = container.clientWidth / canvasWidth;
        const scaleY = container.clientHeight / canvasHeight;
        setScale(Math.min(scaleX, scaleY));
      };

      updateScale();
      const observer = new ResizeObserver(updateScale);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [canvasWidth, canvasHeight]);

    // Expose method to get the iframe's current HTML (with edits baked in)
    useImperativeHandle(ref, () => ({
      getHtml: () => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return null;
        return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      },
    }));

    // Locked canvas: render iframe at exact dimensions, scale to fit
    if (canvasWidth && canvasHeight) {
      const scaledWidth = canvasWidth * scale;
      const scaledHeight = canvasHeight * scale;

      return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
          <div style={{ width: scaledWidth, height: scaledHeight, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4 }}>
            <iframe
              ref={iframeRef}
              src={editSrc}
              sandbox="allow-same-origin allow-scripts allow-modals"
              title="Design preview"
              onLoad={handleLoad}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                border: 'none',
                ...(editMode
                  ? { zoom: scale }
                  : { transform: `scale(${scale})`, transformOrigin: '0 0' }
                ),
              }}
            />
          </div>
        </div>
      );
    }

    // Responsive canvas: stretch to fill
    return (
      <iframe
        ref={iframeRef}
        src={editSrc}
        className="w-full h-full border-0"
        sandbox="allow-same-origin allow-scripts allow-modals"
        title="Design preview"
        onLoad={handleLoad}
      />
    );
  }
);
