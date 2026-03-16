/**
 * Generate the viewport-lock HTML snippet for locked canvas exports.
 * Injects CSS + JS that fixes the design to exact dimensions and auto-scales
 * to fit any browser window with letterboxing.
 */
export function getViewportLockSnippet(width: number, height: number): string {
  return `
<style>
html { margin: 0 !important; padding: 0 !important; width: 100vw !important; height: 100vh !important; overflow: hidden !important; background: #000 !important; }
body { margin: 0 !important; padding: 0 !important; width: ${width}px !important; height: ${height}px !important; overflow: hidden !important; transform-origin: 0 0 !important; position: absolute !important; }
</style>
<script>
(function() {
  var w = ${width}, h = ${height};
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
}

/**
 * Inject viewport-lock into an HTML string (before </body>).
 * Only applies to locked canvases (non-responsive, fixed dimensions).
 */
export function injectViewportLock(html: string, width: number | string, height: number | string): string {
  if (typeof width !== 'number' || typeof height !== 'number') return html;
  const snippet = getViewportLockSnippet(width, height);
  return html.replace('</body>', snippet + '\n</body>');
}
