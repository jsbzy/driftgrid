import { CANVAS_PRESETS } from './constants';

/**
 * Drift-slot template boilerplates.
 *
 * A drift slot moves through four visible states. Each state renders a different template
 * HTML file so the card thumbnail always reflects the slot's current phase:
 *
 *   empty     → driftPromptBoilerplate     — "awaiting prompt", kbd chip
 *   awaiting  → awaitingAgentBoilerplate   — "awaiting agent", prompt preview
 *   running   → inProgressBoilerplate      — "agent working", subtle pulsing grid
 *   done      → (agent overwrites the file) — no template, the agent's real HTML
 */

const JETBRAINS_MONO_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;

/** Shared light-theme styles used by all three drift-state templates. */
const SHARED_STYLES = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #ffffff;
      color: #111111;
      -webkit-font-smoothing: antialiased;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .drift-prompt {
      text-align: center;
      padding: 48px;
      max-width: 560px;
      position: relative;
      z-index: 1;
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.12em;
      color: rgba(0, 0, 0, 0.4);
      margin-bottom: 24px;
    }
    .eyebrow .accent {
      color: rgba(180, 130, 30, 0.9);
    }
    .title {
      font-size: 56px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: #111111;
      margin-bottom: 32px;
      line-height: 1.05;
    }
    .hint {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.4);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .prompt-preview {
      margin-top: 24px;
      margin-bottom: 0;
      padding: 16px 20px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.015);
      font-size: 13px;
      line-height: 1.6;
      color: rgba(0, 0, 0, 0.72);
      text-align: left;
      max-height: 180px;
      overflow: hidden;
      position: relative;
    }
    .prompt-preview::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 40px;
      background: linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1));
      pointer-events: none;
    }
    kbd {
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.15);
      background: rgba(0, 0, 0, 0.03);
      color: rgba(0, 0, 0, 0.7);
    }
    /* Subtle pulsing grid for the in-progress state */
    .grid-bg {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(to right, rgba(0, 0, 0, 0.04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0, 0, 0, 0.04) 1px, transparent 1px);
      background-size: 56px 56px;
      animation: grid-pulse 3.2s ease-in-out infinite;
      z-index: 0;
    }
    @keyframes grid-pulse {
      0%, 100% { opacity: 0.3; }
      50%      { opacity: 0.8; }
    }`;

function wrapDocument(
  canvas: string,
  title: string,
  content: string,
): string {
  const preset = CANVAS_PRESETS[canvas];
  const isLocked = preset && !preset.responsive;
  const width = typeof preset?.width === 'number' ? preset.width : 1440;

  if (isLocked) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${JETBRAINS_MONO_LINK}
    <style>
        html, body { width: 100%; height: 100vh; overflow: hidden; }${SHARED_STYLES}
    </style>
</head>
<body>${content}
</body>
</html>
`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${JETBRAINS_MONO_LINK}
    <style>
        html, body { width: 100%; min-height: 100vh; }
        body { max-width: ${width}px; margin: 0 auto; min-height: 100vh; }${SHARED_STYLES}
    </style>
</head>
<body>${content}
</body>
</html>
`;
}

/** Escape characters that could break out of HTML context when we inline prompt text. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `empty` state — just drifted, no prompt yet.
 * Displays: "Concept · Vn" eyebrow, "New version" headline, "press C to prompt" hint.
 */
export function driftPromptBoilerplate(
  canvas: string,
  title: string,
  conceptLabel: string,
  versionNumber: number,
): string {
  const eyebrow = `${conceptLabel.toUpperCase()} · V${versionNumber} · <span class="accent">AWAITING PROMPT</span>`;
  const content = `
    <div class="drift-prompt">
      <div class="eyebrow">${eyebrow}</div>
      <h1 class="title">New version</h1>
      <div class="hint">Press <kbd>C</kbd> to prompt agent with a comment</div>
    </div>`;
  return wrapDocument(canvas, title, content);
}

/**
 * `awaiting-agent` state — prompt has been saved, agent hasn't picked it up yet.
 * Displays: "Concept · Vn · AWAITING AGENT" eyebrow, prompt preview block, MCP hint.
 */
export function awaitingAgentBoilerplate(
  canvas: string,
  title: string,
  conceptLabel: string,
  versionNumber: number,
  promptText: string,
): string {
  const eyebrow = `${conceptLabel.toUpperCase()} · V${versionNumber} · <span class="accent">AWAITING AGENT</span>`;
  const content = `
    <div class="drift-prompt">
      <div class="eyebrow">${eyebrow}</div>
      <h1 class="title">New version</h1>
      <div class="prompt-preview">${escapeHtml(promptText)}</div>
      <div class="hint" style="margin-top: 20px;">copy to your agent · or install the DriftGrid MCP server</div>
    </div>`;
  return wrapDocument(canvas, title, content);
}

/**
 * `in-progress` state — agent is actively working.
 * Displays: pulsing grid background, "Agent working…" headline, prompt preview.
 */
export function inProgressBoilerplate(
  canvas: string,
  title: string,
  conceptLabel: string,
  versionNumber: number,
  promptText: string,
): string {
  const eyebrow = `${conceptLabel.toUpperCase()} · V${versionNumber} · <span class="accent">IN PROGRESS</span>`;
  const content = `
    <div class="grid-bg"></div>
    <div class="drift-prompt">
      <div class="eyebrow">${eyebrow}</div>
      <h1 class="title">agent working…</h1>
      <div class="prompt-preview">${escapeHtml(promptText)}</div>
    </div>`;
  return wrapDocument(canvas, title, content);
}

/**
 * Returns an empty HTML canvas boilerplate for a given preset.
 * Used by /api/iterate and /api/branch when creating new drift slots.
 * The body is empty (just a comment) — the designer directs their agent to fill it in.
 *
 * Kept for backwards compatibility; new drift slots now use `driftPromptBoilerplate`.
 */
export function emptyCanvasBoilerplate(canvas: string, title: string = 'Untitled'): string {
  const preset = CANVAS_PRESETS[canvas];
  const isLocked = preset && !preset.responsive;
  const width = typeof preset?.width === 'number' ? preset.width : 1440;

  if (isLocked) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100vh; overflow: hidden; }
        body { font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; background: #ffffff; color: #111111; }
    </style>
</head>
<body>
    <!-- Empty drift slot. Direct your agent to fill this in. -->
</body>
</html>
`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; }
        body { max-width: ${width}px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; background: #ffffff; color: #111111; }
    </style>
</head>
<body>
    <!-- Empty drift slot. Direct your agent to fill this in. -->
</body>
</html>
`;
}
