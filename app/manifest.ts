import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DriftGrid',
    short_name: 'DriftGrid',
    description:
      'Design iteration for agents — version every AI-generated design, compare any two, share a single link per round.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f5f4',
    theme_color: '#1c1c1c',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
