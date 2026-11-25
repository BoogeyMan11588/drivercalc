import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const base = process.env.NEXT_BASE_PATH || '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Driver Calculator — Logistics Fleet Planning',
    short_name: 'Driver Calc',
    description: 'Calculate how many drivers you need to move your fleet efficiently.',
    start_url: `${base}/`,
    display: 'standalone',
    background_color: '#f0f3f7',
    theme_color: '#1e3a5f',
    icons: [
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
