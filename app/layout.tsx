import type { Metadata, Viewport } from 'next'
import './globals.css'

const BASE_URL = 'https://www.mijnwkpoule.nl'

export const viewport: Viewport = {
  themeColor: '#0B0E14',
  colorScheme: 'dark',
  // De pagina's zijn al netjes geschaald; in-/uitzoomen blokkeren.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Mijn WK Poule — WK 2026',
    template: '%s | Mijn WK Poule',
  },
  description:
    'Voorspel WK 2026 wedstrijden, zet jokers in en strijd met vrienden & collega\'s om de meeste punten. Jouw persoonlijke WK-poule.',
  keywords: ['WK 2026', 'WK poule', 'voetbal voorspellen', 'World Cup 2026', 'poule spel'],
  authors: [{ name: 'Ennovate' }],
  creator: 'Ennovate',
  manifest: '/manifest.webmanifest',
  // Apple: toevoegen aan beginscherm als standalone app met eigen titel/icoon
  appleWebApp: {
    capable: true,
    title: 'WK Poule',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    locale: 'nl_NL',
    url: BASE_URL,
    siteName: 'Mijn WK Poule',
    title: 'Mijn WK Poule — Voorspel, Volg & Win',
    description:
      'Doe mee met het WK 2026 poule-spel. Voorspel alle 72 groepswedstrijden, zet jokers in en volg de stand live.',
    images: [
      {
        url: '/mijn-wk-poule.jpg',
        width: 1536,
        height: 768,
        alt: 'Mijn WK Poule 2026',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mijn WK Poule — WK 2026',
    description: 'Voorspel WK 2026 wedstrijden en strijd om de punten.',
    images: ['/mijn-wk-poule.jpg'],
  },
  robots: {
    index: false,    // app vereist login — standaard niet indexeren
    follow: false,
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  )
}
