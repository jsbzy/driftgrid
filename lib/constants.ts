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
