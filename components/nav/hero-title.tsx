'use client'

import { usePathname } from 'next/navigation'

function getTitle(pathname: string, isRetro: boolean) {
  if (pathname.startsWith('/groep/')) {
    const g = pathname.split('/')[2]?.toUpperCase() ?? ''
    return { main: 'Groep', accent: g, sub: 'Deelnemende landen & statistieken' }
  }
  if (pathname.startsWith('/groepen'))
    return { main: 'Groepen', accent: 'A–L', sub: 'Overzicht alle poulefases' }
  if (pathname.startsWith('/knockout'))
    return { main: 'Knock-out', accent: 'fase', sub: 'Voorspel de winnaar per ronde' }
  if (pathname.startsWith('/bonusvragen'))
    return { main: 'Bonus', accent: 'vragen', sub: 'Extra punten verdienen' }
  if (pathname.startsWith('/poules'))
    return { main: 'Poules &', accent: 'klassement', sub: 'Hoe sta jij ervoor?' }
  if (pathname.startsWith('/statistieken'))
    return { main: 'Statistie', accent: 'ken', sub: 'Cijfers & voorspellingen' }
  if (pathname.startsWith('/profiel'))
    return { main: 'Mijn', accent: 'profiel', sub: 'Instellingen & thema' }
  if (isRetro)
    return { main: 'Oranje', accent: 'boven', sub: 'Retro · EK 1988 · Nederland' }
  return { main: 'Mijn', accent: 'WK poule', sub: 'Voorspellen · Volgen · Winnen' }
}

export default function HeroTitle({ isRetro }: { isRetro: boolean }) {
  const pathname = usePathname()
  const { main, accent, sub } = getTitle(pathname, isRetro)

  return (
    <div className="absolute bottom-0 left-0 px-6 md:px-8 pb-5 md:pb-6">
      <p className="font-display text-3xl md:text-5xl text-white uppercase leading-none tracking-tight drop-shadow-lg">
        {main} <span className="text-wk-gold">{accent}</span>
      </p>
      <p className="font-mono text-white/60 text-[10px] tracking-[0.18em] uppercase mt-1.5">
        {sub}
      </p>
    </div>
  )
}
