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
  placeholder?: string | null;
  onReady?: () => void;
  borderless?: boolean;
  /** Called with the iframe element on mount and again on null when unmounted. Lets the AnnotationOverlay observe scroll position for scrollable canvases. */
  onIframeRef?: (el: HTMLIFrameElement | null) => void;
  /**
   * Mobile client viewing. Defaults false → desktop renders byte-for-byte
   * unchanged. When true:
   *   - locked/fixed canvas: scale by WIDTH only (not min(scaleX,scaleY)) and
   *     let the outer container scroll vertically, so a tall fixed design
   *     becomes a readable strip instead of being shrunk to fit the screen.
   *   - responsive canvas: the iframe height follows its document
   *     scrollHeight (same-origin) so the page itself scrolls in document space.
   */
  mobile?: boolean;
}

export interface HtmlFrameHandle {
  getHtml: () => string | null;
  exportPdf: (filename: string, client: string, project: string) => Promise<void>;
  exportHtml: (filename: string) => Promise<void>;
}

export const HtmlFrame = forwardRef<HtmlFrameHandle, HtmlFrameProps>(
  function HtmlFrame({ src, canvasWidth, canvasHeight, editMode, showEdits, hasEdits, savedEdits, onEditsChange, onScaledWidth, placeholder, onReady, borderless, onIframeRef, mobile = false }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const setIframeRef = useCallback((el: HTMLIFrameElement | null) => {
      iframeRef.current = el;
      onIframeRef?.(el);
    }, [onIframeRef]);
    const [scale, setScale] = useState(0);
    const [iframeReady, setIframeReady] = useState(false);
    // 'loading' = audio still buffering, 'ready' = can play through, 'error' = failed,
    // null = no audio element on this slide. Drives the "Loading audio…" overlay.
    const [audioState, setAudioState] = useState<'loading' | 'ready' | 'error' | null>(null);
    // Mobile responsive path only: measured document height of the iframe so the
    // iframe element can grow to fit its content and the outer container scrolls.
    const [mobileContentHeight, setMobileContentHeight] = useState<number | null>(null);

    // Keep edit script loaded whenever editing or edits exist (avoids iframe reloads on toggle)
    const needsEditScript = editMode || hasEdits;
    const editSrc = needsEditScript ? `${src}${src.includes('?') ? '&' : '?'}mode=edit` : src;

    // Don't reset iframeReady on src change — keep old content visible
    // while new content loads to prevent white flash.
    //
    // Imperatively set iframe.src on change. React attribute updates sometimes
    // don't re-navigate the iframe when the previous src already loaded; assigning
    // iframe.src directly always triggers navigation.
    useEffect(() => {
      const el = iframeRef.current;
      if (!el) return;
      if (el.getAttribute('src') !== editSrc) {
        el.src = editSrc;
        // Pull keyboard focus back to the parent so arrow nav keeps working
        // through the brief window where the iframe doc is mid-load and its
        // forwarder hasn't re-attached yet.
        window.focus();
      }
      el.scrollTop = 0;
    }, [editSrc]);

    // Handle iframe load
    const handleLoad = useCallback(() => {
      setIframeReady(true);
      setAudioState(null); // reset for new slide; effect below re-evaluates
      onReady?.();
    }, [onReady]);

    // Surface audio loading state to the user. Iframe onLoad fires when the HTML
    // is parsed, but audio files (often multi-MB MP3s) keep downloading in the
    // background. Without this, the slide looks rendered while audio is silently
    // buffering and the user thinks it's broken.
    //
    // Same-origin iframe (share route serves from driftgrid.ai), so we can peek
    // into contentDocument and listen for readyState transitions.
    useEffect(() => {
      if (!iframeReady) return;
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const audios = Array.from(doc.querySelectorAll('audio')) as HTMLAudioElement[];
      if (audios.length === 0) {
        setAudioState(null);
        return;
      }

      // Initial pass — if anything's already at HAVE_ENOUGH_DATA, we're good.
      // readyState 4 = HAVE_ENOUGH_DATA, the threshold for canplaythrough.
      const allReady = () => audios.every(a => a.readyState >= 4);
      const anyError = () => audios.some(a => a.error != null);
      const update = () => {
        if (anyError()) setAudioState('error');
        else if (allReady()) setAudioState('ready');
        else setAudioState('loading');
      };
      update();

      const events = ['loadstart', 'progress', 'loadeddata', 'canplay', 'canplaythrough', 'waiting', 'playing', 'error', 'stalled'] as const;
      for (const a of audios) {
        for (const ev of events) a.addEventListener(ev, update);
      }
      return () => {
        for (const a of audios) {
          for (const ev of events) a.removeEventListener(ev, update);
        }
      };
    }, [iframeReady, src]);

    // Autoplay-policy bridge: browsers block <audio>.play() until the user has
    // interacted with the page. live-vo.js (and any similarly-shaped slide
    // script) arms a one-shot pointerdown listener INSIDE the iframe to recover
    // from this — but parent-page clicks (nav, chrome, comments hub) never
    // reach that listener, so audio stays silent unless the user happens to
    // click the slide canvas itself.
    //
    // Forward the first parent-page user gesture into the iframe document by
    // also calling .play() directly on any <audio>/<video> elements found
    // there. Belt-and-suspenders so this works regardless of how the slide
    // wires up its playback.
    useEffect(() => {
      if (!iframeReady) return;
      let used = false;
      const onGesture = () => {
        if (used) return;
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        used = true;
        try {
          // Direct play on any media elements (catches the live-vo.js #vo case
          // and any future slide that just has an <audio>).
          const media = doc.querySelectorAll('audio, video');
          media.forEach(el => {
            const m = el as HTMLMediaElement;
            // Only kick playback if the slide intends it — preload="auto"
            // signals "start me when allowed."
            if (m.preload === 'auto' || m.autoplay) {
              const p = m.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          });
          // Synthetic pointerdown into iframe doc so any gesture-armed
          // fallback inside the slide script also fires.
          doc.dispatchEvent(new (doc.defaultView?.PointerEvent ?? PointerEvent)('pointerdown', { bubbles: true }));
        } catch {
          // Cross-origin iframe — skip silently. (Not the case for our share
          // route, but defensive.)
        }
      };
      const opts = { once: true, capture: true } as AddEventListenerOptions;
      window.addEventListener('pointerdown', onGesture, opts);
      window.addEventListener('keydown', onGesture, opts);
      window.addEventListener('touchstart', onGesture, opts);
      return () => {
        window.removeEventListener('pointerdown', onGesture, opts);
        window.removeEventListener('keydown', onGesture, opts);
        window.removeEventListener('touchstart', onGesture, opts);
      };
    }, [iframeReady, src]);

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

    // Forward navigation keys from iframe to parent window.
    // Re-attaches whenever iframe loads new content (src changes trigger reload → handleLoad → iframeReady).
    // Also polls to re-attach if the iframe document gets replaced without a full reload.
    useEffect(() => {
      if (!iframeReady || !iframeRef.current) return;

      let currentDoc: Document | null = null;
      let cleanup: (() => void) | null = null;

      function attachListener() {
        try {
          const doc = iframeRef.current?.contentDocument;
          if (!doc || doc === currentDoc) return; // already attached to this doc
          // Detach from old doc
          if (cleanup) cleanup();
          currentDoc = doc;

          const handler = (e: KeyboardEvent) => {
            // Forward Cmd+K / Ctrl+K for command palette
            if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
              if (e.target instanceof (doc.defaultView?.HTMLInputElement ?? HTMLInputElement) ||
                  e.target instanceof (doc.defaultView?.HTMLTextAreaElement ?? HTMLTextAreaElement)) return;
              e.preventDefault();
              window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, bubbles: true }));
              return;
            }
            if (e.key === 'c' || e.key === 'C' ||
                e.key === 'd' || e.key === 'D' ||
                e.key === 'g' || e.key === 'G' || e.key === 'Escape' ||
                e.key === 'h' || e.key === 'H' ||
                e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
                e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                e.key === 'p' || e.key === 'P' ||
                e.key === 's' || e.key === 'S' ||
                e.key === '?') {
              if (e.target instanceof (doc.defaultView?.HTMLInputElement ?? HTMLInputElement) ||
                  e.target instanceof (doc.defaultView?.HTMLTextAreaElement ?? HTMLTextAreaElement)) return;
              if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                return;
              }
              e.preventDefault();
              window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, code: e.code, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, bubbles: true }));
            }
          };
          doc.addEventListener('keydown', handler, true);
          cleanup = () => { try { doc.removeEventListener('keydown', handler, true); } catch {} };
        } catch {
          // Cross-origin iframe — can't attach listener
        }
      }

      // Attach immediately
      attachListener();

      // Poll every 2s to re-attach if the iframe document changed (hot reload, SPA navigation)
      const poll = setInterval(attachListener, 2000);

      return () => {
        clearInterval(poll);
        if (cleanup) cleanup();
      };
    }, [iframeReady, src]);

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
        // Mobile: fit to WIDTH so a tall fixed design reads as a vertical strip
        // (the outer container scrolls). Desktop: fit the whole canvas on screen.
        const scaleY = container.clientHeight / canvasHeight;
        const s = mobile ? scaleX : Math.min(scaleX, scaleY);
        setScale(s);
        onScaledWidth?.(canvasWidth * s);
      };

      updateScale();
      const observer = new ResizeObserver(updateScale);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [canvasWidth, canvasHeight, mobile]);

    // Mobile responsive path: drive the iframe height from its document's
    // scrollHeight so the page flows naturally and the outer container scrolls.
    // Same-origin only (our share/html routes are same-origin); cross-origin
    // reads throw and we silently leave the height unmanaged.
    // Inactive on the locked path (canvasHeight set) and on desktop.
    useEffect(() => {
      if (!mobile || !iframeReady) return;
      if (canvasWidth && canvasHeight) return; // locked path handles its own sizing
      const el = iframeRef.current;
      if (!el) return;

      let rafId = 0;
      let resizeObs: ResizeObserver | null = null;

      const measure = () => {
        try {
          const doc = el.contentDocument;
          const root = doc?.documentElement;
          const body = doc?.body;
          if (!root) return;
          const h = Math.max(root.scrollHeight ?? 0, body?.scrollHeight ?? 0);
          if (h > 0) setMobileContentHeight(h);
        } catch {
          // cross-origin — leave height unmanaged
        }
      };

      const onScrollResize = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => { rafId = 0; measure(); });
      };

      measure();
      try {
        const doc = el.contentDocument;
        if (doc && typeof ResizeObserver !== 'undefined' && doc.documentElement) {
          resizeObs = new ResizeObserver(onScrollResize);
          resizeObs.observe(doc.documentElement);
          if (doc.body) resizeObs.observe(doc.body);
        }
      } catch { /* cross-origin */ }
      // Re-measure on a short poll for late reflow (font swap, image decode).
      const poll = setInterval(measure, 1000);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        if (resizeObs) resizeObs.disconnect();
        clearInterval(poll);
      };
    }, [mobile, iframeReady, canvasWidth, canvasHeight, src]);

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
        <div
          ref={containerRef}
          className={
            mobile
              // Mobile: fit-to-width strip. Pin to top + scroll the container
              // vertically so a tall fixed design reads top-to-bottom.
              ? 'w-full h-full flex items-start justify-center overflow-x-hidden overflow-y-auto'
              : 'w-full h-full flex items-center justify-center overflow-hidden'
          }
        >
          <div style={{
            width: scaledWidth,
            height: scaledHeight,
            overflow: 'hidden',
            border: borderless ? 'none' : '1px solid rgba(0,0,0,0.08)',
            borderRadius: borderless ? 0 : 4,
            position: 'relative',
            // Mobile only: don't let the scaled strip collapse below its height
            // when the flex container is shorter than the content (scroll case).
            // Omitted on desktop so the locked path is byte-for-byte unchanged.
            ...(mobile ? { flexShrink: 0 } : null),
          }}>
            {/* Thumbnail placeholder — visible until iframe loads */}
            {placeholder && !iframeReady && (
              <img
                src={placeholder}
                alt=""
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'top',
                  zIndex: 1,
                }}
              />
            )}
            <iframe
              ref={setIframeRef}
              src={editSrc}
              sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-fullscreen allow-pointer-lock allow-downloads" allow="autoplay"
              title="Design preview"
              onLoad={handleLoad}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                border: 'none',
                background: 'var(--canvas)',
                position: 'relative',
                zIndex: 2,
                opacity: iframeReady ? 1 : 0,
                transition: 'opacity 0.15s ease',
                ...(editMode
                  ? { zoom: scale }
                  : { transform: `scale(${scale})`, transformOrigin: '0 0' }
                ),
              }}
            />
            <AudioStatusPill state={audioState} />
          </div>
        </div>
      );
    }

    // Responsive canvas (mobile): the iframe grows to its content height and the
    // outer container scrolls. Pins stay in document space (AnnotationOverlay
    // tracks iframe scroll). Falls back to fill height until the doc is measured.
    if (mobile) {
      return (
        <div ref={containerRef} className="w-full h-full relative overflow-x-hidden overflow-y-auto">
          {placeholder && !iframeReady && (
            <img
              src={placeholder}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{ zIndex: 1 }}
            />
          )}
          <iframe
            ref={setIframeRef}
            src={editSrc}
            className="w-full relative block"
            style={{
              border: 'none',
              background: 'var(--canvas)',
              transition: 'opacity 0.15s ease',
              zIndex: 2,
              opacity: iframeReady ? 1 : 0,
              // Grow to content; until measured, fill the viewport so the
              // placeholder/blank doesn't collapse to 0.
              height: mobileContentHeight ?? '100%',
              minHeight: '100%',
            }}
            sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-fullscreen allow-pointer-lock allow-downloads" allow="autoplay"
            title="Design preview"
            onLoad={handleLoad}
          />
        </div>
      );
    }

    // Responsive canvas: stretch to fill
    return (
      <div className="w-full h-full relative">
        {placeholder && !iframeReady && (
          <img
            src={placeholder}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top"
            style={{ zIndex: 1 }}
          />
        )}
        <iframe
          ref={setIframeRef}
          src={editSrc}
          className="w-full h-full relative"
          style={{
            border: 'none',
            background: 'var(--canvas)',
            transition: 'opacity 0.15s ease',
            zIndex: 2,
            opacity: iframeReady ? 1 : 0,
          }}
          sandbox="allow-same-origin allow-scripts allow-modals allow-forms allow-popups allow-fullscreen allow-pointer-lock allow-downloads" allow="autoplay"
          title="Design preview"
        onLoad={handleLoad}
      />
        <AudioStatusPill state={audioState} />
      </div>
    );
  }
);

/**
 * Small pill in the top-right of the iframe container showing audio buffering
 * state. Renders nothing when the slide has no audio (state === null) or once
 * audio is fully buffered (state === 'ready'). Stays for the "loading" /
 * "error" cases so users can see what's happening on slides with VO.
 */
function AudioStatusPill({ state }: { state: 'loading' | 'ready' | 'error' | null }) {
  if (state == null || state === 'ready') return null;
  const isError = state === 'error';
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 3,
        background: 'rgba(0,0,0,0.72)',
        color: '#fff',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 10,
        letterSpacing: '0.08em',
        padding: '6px 10px 6px 8px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      {isError ? (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
      ) : (
        <span
          style={{
            width: 10,
            height: 10,
            border: '1.5px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.9s linear infinite',
          }}
        />
      )}
      {isError ? 'AUDIO FAILED' : 'LOADING AUDIO…'}
    </div>
  );
}
