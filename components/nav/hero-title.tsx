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
    return { main: 'Dagoverzicht &', accent: 'klassement', sub: 'Hoe sta jij ervoor?' }
  if (pathname.startsWith('/statistieken'))
    return { main: 'Stats &', accent: 'cijfers', sub: 'Nauwkeurigheid & voorspellingen' }
  if (pathname.startsWith('/profiel'))
    return { main: 'Mijn', accent: 'profiel', sub: 'Instellingen & thema' }
  if (isRetro)
    return { main: 'Oranje', accent: 'boven', sub: 'Retro · EK 1988 · Nederland' }
  return { main: 'Mijn', accent: 'WK poule', sub: 'Voorspellen · Volgen · Winnen' }
}

export default function HeroTitle({ isRetro }: { isRetro: boolean }) {
  const pathname = usePathname()
  const { main, accent, sub } = getTitle(pathname, isRetro)

  const isVoorspellingen = pathname === '/voorspellingen' || pathname.startsWith('/voorspellingen')

  return (
    <>
      {/* key={pathname}: titel animeert opnieuw bij elke routewissel */}
      <div key={pathname} className="absolute bottom-0 left-0 px-6 md:px-8 pb-5 md:pb-6">
        <p className="animate-fade-up font-display text-3xl md:text-5xl text-white uppercase leading-none tracking-tight drop-shadow-lg">
          {main} <span className="text-wk-gold">{accent}</span>
        </p>
        <p className="animate-fade-up font-mono text-white/60 text-[10px] tracking-[0.18em] uppercase mt-1.5" style={{ animationDelay: '90ms' }}>
          {sub}
        </p>
      </div>

      {isVoorspellingen && (
        <div className="absolute bottom-0 right-0 px-6 md:px-8 pb-5 md:pb-6 hidden md:block">
          <a
            href="/hoe-werkt-het"
            className="font-mono text-[10px] text-white/60 hover:text-white tracking-[0.14em] uppercase transition-colors border border-white/20 hover:border-white/50 rounded-full px-3 py-1.5 backdrop-blur-sm bg-black/10"
          >
            Hoe werkt het? →
          </a>
        </div>
      )}
    </>
  )
}
