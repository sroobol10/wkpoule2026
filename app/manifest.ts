import type { MetadataRoute } from 'next'

// Web App Manifest — maakt het mogelijk de site als app te installeren
// (Android: "App installeren", iOS: "Zet op beginscherm").
//
// Het app-icoon: Android gebruikt onderstaande PNG's, iOS gebruikt
// `app/apple-icon.png` (door Next.js automatisch opgepikt).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mijn WK Poule — WK 2026',
    short_name: 'WK Poule',
    description:
      'Voorspel WK 2026 wedstrijden, zet jokers in en strijd om de meeste punten.',
    start_url: '/poules',
    display: 'standalone',
    background_color: '#0B0E14',
    theme_color: '#0B0E14',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
