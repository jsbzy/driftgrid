import { CanvasPreset } from './types';

export const CANVAS_PRESETS: Record<string, CanvasPreset> = {
  'a4-portrait': {
    slug: 'a4-portrait',
    label: 'A4 Portrait',
    width: 794,
    height: 1123,
    responsive: false,
  },
  'landscape-16-9': {
    slug: 'landscape-16-9',
    label: '16:9 Landscape',
    width: 1920,
    height: 1080,
    responsive: false,
  },
  desktop: {
    slug: 'desktop',
    label: 'Desktop',
    width: 1440,
    height: 'auto',
    responsive: true,
  },
  tablet: {
    slug: 'tablet',
    label: 'Tablet',
    width: 768,
    height: 'auto',
    responsive: true,
  },
  mobile: {
    slug: 'mobile',
    label: 'Mobile',
    width: 375,
    height: 'auto',
    responsive: true,
  },
  freeform: {
    slug: 'freeform',
    label: 'Freeform',
    width: 'custom',
    height: 'custom',
    responsive: false,
  },
};

export interface ResolvedCanvas {
  width: number;
  height: number | 'auto';
  label: string;
  /** Display string for the canvas info badge, e.g. "16:9 · 1920×1080 · Fixed" */
  displayLabel: string;
}

/**
 * Resolves a canvas config to concrete dimensions.
 * Accepts either a preset string (e.g. "desktop") or a freeform object
 * (e.g. { type: "freeform", width: 800, height: 600 }).
 * Falls back to Desktop (1440 x auto) if the config is unrecognized.
 */
export function resolveCanvas(
  canvas: string | { type?: string; width?: number; height?: number | 'auto' }
): ResolvedCanvas {
  // Handle object canvas configs (freeform)
  if (typeof canvas === 'object' && canvas !== null) {
    const w = canvas.width ?? 1440;
    const h = canvas.height ?? 'auto';
    const label = canvas.type
      ? canvas.type.charAt(0).toUpperCase() + canvas.type.slice(1)
      : `${w}×${h}`;
    const dims = h === 'auto' ? `${w}w` : `${w}×${h}`;
    return { width: w, height: h, label, displayLabel: `${label} · ${dims}` };
  }

  // Handle string preset lookup
  const preset = CANVAS_PRESETS[canvas];
  if (preset) {
    const w = typeof preset.width === 'number' ? preset.width : 1440;
    const h = typeof preset.height === 'number' ? preset.height : 'auto';
    const dims = h === 'auto' ? `${w}w` : `${w}×${h}`;
    const mode = preset.responsive ? 'Responsive' : 'Fixed';
    return { width: w, height: h, label: preset.label, displayLabel: `${preset.label} · ${dims} · ${mode}` };
  }

  // Unknown string — fall back to Desktop defaults
  return { width: 1440, height: 'auto', label: canvas || 'Desktop', displayLabel: `Desktop · 1440w · Responsive` };
}
