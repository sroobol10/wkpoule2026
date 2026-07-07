import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import { GameShot } from './game-shot'

export const metadata = { title: 'Ennovate Playground' }

// De game-bibliotheek: alle Kopstukken-sporten op één plek. Verhuist later naar een
// eigen repo (playground.ennovate.nl); tot die tijd woont-ie hier op /playground.
const GAMES = [
  {
    href: '/voetbal', emoji: '⚽', title: 'Kopstukken', accent: '#2EA84B',
    tagline: 'Het origineel — Sensible Soccer met collega-koppen',
    shot: '/games/screenshots/kopstukken.png',
    features: ['7 vs 7', 'Solo · 1v1 · co-op · 2v2', 'Online multiplayer', 'Omhalen, panna\'s & streakers'],
  },
  {
    href: '/ijshockey', emoji: '🏒', title: 'Puckstukken', accent: '#7DB8E8',
    tagline: 'IJshockey: boarding, powerplays en het strafbankje',
    shot: '/games/screenshots/puckstukken.png',
    features: ['6 vs 6 op glad ijs', 'Puck stuitert via de boarding', '2 min het strafbankje op', 'Online multiplayer'],
  },
  {
    href: '/boksen', emoji: '🥊', title: 'Knokstukken', accent: '#FF5A4D',
    tagline: '1v1 boksen — de grote koppen zijn letterlijk het doelwit',
    shot: '/games/screenshots/knokstukken.png',
    features: ['Jab, hoek & blok', 'Knock-downs: RAM spatie', '3× neer = TKO', 'Kies je eigen bokser'],
  },
  {
    href: '/darts', emoji: '🎯', title: 'Pijlwerk', accent: '#5FBF6E',
    tagline: '301/501 met dubbele finish — en een richtkruis dat zwabbert',
    shot: '/games/screenshots/pijlwerk.png',
    features: ['Hoe langer je twijfelt, hoe erger', 'Bust-regels zoals in de kroeg', 'Checkout-hints', '1-4 spelers of vs AI'],
  },
  {
    href: '/midgetgolf', emoji: '⛳', title: 'Putjesscheppers', accent: '#2C8A45',
    tagline: 'Midgetgolf over 9 random gegenereerde holes',
    shot: '/games/screenshots/putjesscheppers.png',
    features: ['Elke ronde een nieuwe baan', 'Molenwiek, water & bumper-koppen', '1-4 spelers hotseat', 'Birdies & dubbel-bogeys'],
  },
  {
    href: '/volleybal', emoji: '🏐', title: 'Netwerk', accent: '#E8A34D',
    tagline: '2v2 beachvolleybal bij zonsondergang — smash \'m het zand in',
    shot: '/games/screenshots/netwerk.png',
    features: ['Bump, set & SMASH', 'Max 3 aanrakingen', 'Vs AI · co-op · 1v1', 'De naam is een agency-grapje'],
  },
  {
    href: '/schaatsen', emoji: '⛸️', title: 'De Elfkoppentocht', accent: '#9FC4E8',
    tagline: 'Schaatsrace langs 11 steden — it giet oan!',
    shot: '/games/screenshots/elfstedentoch.png',
    features: ['Random gegenereerde tocht', 'Slipstream & scheuren', 'Kluunzones: RAM spatie', 'Vs vijf AI-koppen'],
  },
  {
    href: '/pingpong', emoji: '🏓', title: 'Tafelkoppen', accent: '#4FA8E0',
    tagline: '3D-tafeltennis — stuur je bat met de muis',
    shot: '/games/screenshots/tafelkoppen.png',
    features: ['Perspectief-tafel (echt 3D)', 'Muis of A/D', 'Tegenstander mét kop', 'Tot 7 of 11, win met 2'],
  },
  {
    href: '/kanon', emoji: '🎯', title: 'Koppenkanon', accent: '#F4B92E',
    tagline: 'Angry Birds met koppen — katapulteer een collega de toren in',
    shot: '/games/screenshots/koppenkanon.png',
    features: ['Trek terug & laat los', 'Wankele torens vol kisten', 'Sloop elke doelwit-kop', 'Steeds moeilijker per level'],
  },
]

export default async function PlaygroundPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-wk-bg text-wk-text">
      {/* sfeer-glows */}
      <div className="pointer-events-none fixed -left-48 -top-48 h-[520px] w-[520px] rounded-full opacity-[0.10] blur-3xl" style={{ background: 'radial-gradient(closest-side, var(--color-wk-gold), transparent)' }} />
      <div className="pointer-events-none fixed -right-48 top-1/3 h-[460px] w-[460px] rounded-full opacity-[0.08] blur-3xl" style={{ background: 'radial-gradient(closest-side, #2D6BE5, transparent)' }} />

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-12">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex flex-col items-center gap-4 text-center animate-fade-up">
          <Image src="/ennovate.png" alt="Ennovate" width={960} height={153} priority className="h-9 w-auto" />
          <h1 className="font-display text-5xl uppercase leading-none tracking-tight sm:text-6xl">
            <span className="text-wk-gold">Play</span>ground
          </h1>
          <p className="max-w-xl font-mono text-[11px] uppercase leading-relaxed tracking-[0.2em] text-wk-muted">
            De Ennovate-arcadehal · negen spellen
          </p>
        </header>

        {/* ── Spelers ────────────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="mb-5 flex items-baseline justify-between gap-3 flex-wrap animate-fade-up">
            <h2 className="font-display text-2xl uppercase leading-none">De Kopstukken</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-wk-muted">{PLAYER_POOL.length} collega&apos;s · zelfde pool in elke game</p>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-8">
            {[...PLAYER_POOL].sort((a, b) => a.name.localeCompare(b.name, 'nl')).map((p, i) => (
              <div key={p.face}
                className="group flex flex-col items-center gap-2 text-center animate-fade-up"
                style={{ animationDelay: `${i * 30}ms` }}>
                <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white/15 transition group-hover:-translate-y-0.5 group-hover:border-wk-gold/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/spelers/${p.face}`} alt={p.name} className="h-full w-full object-cover" />
                </span>
                <p className="w-full truncate font-display text-sm uppercase leading-tight text-wk-text">{p.name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Games ──────────────────────────────────────────────────────── */}
        <section className="mt-16">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game, i) => (
              <Link key={game.href} href={game.href}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-wk-surface transition-all duration-200 hover:-translate-y-1 hover:border-white/25 hover:shadow-xl hover:shadow-black/40 animate-fade-up"
                style={{ animationDelay: `${80 + i * 70}ms` }}>
                <GameShot src={game.shot} emoji={game.emoji} accent={game.accent} alt={game.title} />
                <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${game.accent}, transparent)` }} />
                <div className="relative flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{game.emoji}</span>
                    <h2 className="font-display text-2xl uppercase leading-none" style={{ color: game.accent }}>{game.title}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-snug text-wk-soft">{game.tagline}</p>
                  <ul className="mt-4 space-y-1">
                    {game.features.map((f) => (
                      <li key={f} className="font-mono text-[10px] uppercase tracking-[0.12em] text-wk-muted">· {f}</li>
                    ))}
                  </ul>
                  <span className="mt-5 inline-block self-start rounded-lg border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-wk-soft transition group-hover:border-wk-gold/60 group-hover:text-wk-gold">
                    Spelen →
                  </span>
                </div>
              </Link>
            ))}

            {/* teaser-kaart voor wat nog komt */}
            <div className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 p-6 text-center animate-fade-up" style={{ animationDelay: `${80 + GAMES.length * 70}ms` }}>
              <span className="text-3xl opacity-50">♟️ 🎳 🏹</span>
              <p className="font-display text-lg uppercase text-wk-muted">Meer sporten volgen</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-wk-muted/70">De arcadehal wordt nog verbouwd</p>
            </div>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="mt-16 flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-center animate-fade-up">
          <Image src="/ennovate.png" alt="Ennovate" width={960} height={153} className="h-5 w-auto opacity-50" />
          <Link href="/poules" className="font-mono text-[10px] uppercase tracking-[0.16em] text-wk-soft underline decoration-wk-muted/40 underline-offset-4 hover:text-wk-gold">
            ← Terug naar de WK-poule
          </Link>
        </footer>
      </main>
    </div>
  )
}
