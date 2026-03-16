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
  onScaledWidth?: (width: number) => void;
}

export interface HtmlFrameHandle {
  getHtml: () => string | null;
  exportPdf: (filename: string, client: string, project: string) => Promise<void>;
  exportHtml: (filename: string) => Promise<void>;
}

export const HtmlFrame = forwardRef<HtmlFrameHandle, HtmlFrameProps>(
  function HtmlFrame({ src, canvasWidth, canvasHeight, editMode, showEdits, hasEdits, savedEdits, onEditsChange, onScaledWidth }, ref) {
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
        const s = Math.min(scaleX, scaleY);
        setScale(s);
        onScaledWidth?.(canvasWidth * s);
      };

      updateScale();
      const observer = new ResizeObserver(updateScale);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [canvasWidth, canvasHeight]);

    // Embed all images in HTML as base64 data URLs for self-contained export
    const embedImages = async (html: string): Promise<string> => {
      const urlPattern = /url\(['"]?((?!data:)[^'")\s]+)['"]?\)/g;
      const imgPattern = /<img[^>]+src=["']((?!data:)[^"']+)["']/g;
      const urls = new Set<string>();
      let match;
      while ((match = urlPattern.exec(html)) !== null) urls.add(match[1]);
      while ((match = imgPattern.exec(html)) !== null) urls.add(match[1]);

      for (const imgUrl of urls) {
        try {
          const resolved = new URL(imgUrl, iframeRef.current?.src || window.location.href).href;
          const res = await fetch(resolved);
          if (!res.ok) continue;
          const blob = await res.blob();
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          html = html.split(imgUrl).join(dataUrl);
        } catch {
          // Skip URLs that can't be fetched
        }
      }
      return html;
    };

    // Expose methods for export
    useImperativeHandle(ref, () => ({
      getHtml: () => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return null;
        return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      },
      exportPdf: async (filename: string, client: string, project: string) => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        let html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

        // Embed images as base64 so headless browser can render them
        html = await embedImages(html);

        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client, project, format: 'pdf', htmlContent: html }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          alert(data?.error || 'Export failed');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      exportHtml: async (filename: string) => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        let html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

        // Embed images as base64 for a self-contained file
        html = await embedImages(html);

        // Remove the injected edit script if present
        html = html.replace(/<style>\s*\[data-drift-editable\][\s\S]*?<\/script>/g, '');
        // Remove data-drift attributes for a clean file
        html = html.replace(/\s*data-drift-editable="[^"]*"/g, '');
        html = html.replace(/\s*data-drift-maxlen="[^"]*"/g, '');

        // Lock exported HTML to exact canvas dimensions with auto-scaling
        if (canvasWidth && canvasHeight) {
          const w = canvasWidth, h = canvasHeight;
          const viewportLock = `
<style>
html { margin: 0 !important; padding: 0 !important; width: 100vw !important; height: 100vh !important; overflow: hidden !important; background: #000 !important; }
body { margin: 0 !important; padding: 0 !important; width: ${w}px !important; height: ${h}px !important; overflow: hidden !important; transform-origin: 0 0 !important; position: absolute !important; }
</style>
<script>
(function() {
  var w = ${w}, h = ${h};
  function fit() {
    var s = Math.min(innerWidth / w, innerHeight / h);
    var b = document.body;
    b.style.transform = 'scale(' + s + ')';
    b.style.left = ((innerWidth - w * s) / 2) + 'px';
    b.style.top = ((innerHeight - h * s) / 2) + 'px';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  } else {
    fit();
  }
  window.addEventListener('resize', fit);
})();
</script>`;
          html = html.replace('</body>', viewportLock + '\n</body>');
        }

        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
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
