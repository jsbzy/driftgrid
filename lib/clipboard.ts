/**
 * Cross-context clipboard write.
 *
 * The modern Clipboard API (`navigator.clipboard.writeText`) ONLY works in secure
 * contexts: HTTPS, plus the literal hostnames `localhost` / `127.0.0.1`. Custom dev
 * hostnames like `driftgrid.local` over plain HTTP are NOT considered secure by Chrome,
 * so the modern API fails silently with a NotAllowedError.
 *
 * This wrapper tries the modern API first, and falls back to the legacy
 * `document.execCommand('copy')` path via a hidden textarea — which works in
 * non-secure contexts as long as the call originates from a user gesture (click).
 *
 * Returns true on success, false if both paths failed (caller should surface the
 * error to the user — e.g. "select the text manually").
 */
export async function copyTextSafely(text: string): Promise<boolean> {
  // Try the modern API first
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Falls through to legacy path
    }
  }

  // Legacy fallback — works on insecure origins (driftgrid.local over http, etc.)
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen but selectable
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
