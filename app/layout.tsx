import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WK Poule 2026',
  description: 'Voorspel de WK 2026 wedstrijden en strijd om de punten.',
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
