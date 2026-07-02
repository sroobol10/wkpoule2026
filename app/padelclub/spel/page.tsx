import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'
import { getPadelLeaderboard, PADEL_GAMES, type LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from './game-leaderboard'

export const metadata = { title: 'Spellen · Padel Club' }

export default async function SpelHubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  // Leaderboards voor de beschikbare spellen
  const boards: Record<string, LeaderEntry[]> = {}
  for (const g of PADEL_GAMES) {
    if (g.available && !g.noLeaderboard) boards[g.slug] = await getPadelLeaderboard(g.slug)
  }

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <div className="pointer-events-none absolute -left-40 -top-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.12]" style={{ background: 'radial-gradient(closest-side, var(--color-wk-gold), transparent)' }} />

      <Link
        href="/padelclub"
        aria-label="Sluiten"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-md mx-auto px-4 py-10 sm:py-14 space-y-6">
        <header className="text-center animate-fade-up">
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-2">Padel Club</p>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Spellen</h1>
        </header>

        {PADEL_GAMES.map((g) => (
          <div key={g.slug} className="space-y-3 animate-fade-up">
            {g.available ? (
              <Link
                href={`/padelclub/spel/${g.slug}`}
                className="group flex items-center gap-3 rounded-2xl border border-wk-green/30 bg-gradient-to-r from-wk-green/10 to-wk-gold/10 px-5 py-4 transition-colors hover:border-wk-green/60"
              >
                <span className="text-3xl">{g.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-xl uppercase leading-none text-wk-text">{g.title}</p>
                  <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mt-1">{g.tagline}</p>
                </div>
                <span className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase group-hover:translate-x-0.5 transition-transform">Speel →</span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-wk-surface px-5 py-4 opacity-60">
                <span className="text-3xl grayscale">{g.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-xl uppercase leading-none text-wk-soft">{g.title}</p>
                  <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mt-1">{g.tagline}</p>
                </div>
                <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">Binnenkort</span>
              </div>
            )}
            {g.available && boards[g.slug] && (
              <GameLeaderboard entries={boards[g.slug]} currentUserId={user.id} title={`${g.title} · beste score`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
