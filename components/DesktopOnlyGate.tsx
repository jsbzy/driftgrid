'use client';

/**
 * Desktop-only blocker. CSS-driven (`hidden max-md:flex`) so it is visible only
 * below the 768px breakpoint — no JS, no hydration branch.
 *
 * This used to live in the global app/layout.tsx, where it hard-blocked the
 * entire app on mobile (including client/share review links). It now lives here
 * and is mounted only on desktop-bound surfaces:
 *   - the dashboard / marketing pages (app/page.tsx, /pricing, /login, /account)
 *   - the designer Viewer (mounted only when mode !== 'client')
 * Client/share routes (/review, /s) never mount it, so a client can open a
 * review link on their phone and get the mobile experience instead of a wall.
 *
 * Copy and styling are unchanged from the original global blocker.
 */
export function DesktopOnlyGate() {
  return (
    <div
      className="hidden max-md:flex fixed inset-0 z-[9999] items-center justify-center p-8"
      style={{ background: 'var(--background)' }}
    >
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono, monospace)', maxWidth: 320 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--foreground)' }}>DriftGrid</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          DriftGrid is designed for desktop with keyboard shortcuts. Open this on a laptop or desktop for the best experience.
        </div>
      </div>
    </div>
  );
}
