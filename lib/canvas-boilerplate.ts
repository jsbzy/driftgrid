import { CANVAS_PRESETS } from './constants';

/**
 * Returns an empty HTML canvas boilerplate for a given preset.
 * Used by /api/iterate and /api/branch when creating new drift slots.
 * The body is empty (just a comment) — the designer directs their agent to fill it in.
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

  // Scrollable preset
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
