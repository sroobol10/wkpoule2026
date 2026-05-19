import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function PoulePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: poule } = await supabase
    .from('poules')
    .select('id, name, invite_code, is_general, creator_id')
    .eq('id', id)
    .single()

  if (!poule) notFound()

  const { data: membership } = await supabase
    .from('poule_members')
    .select('id')
    .eq('poule_id', id)
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/poules')

  const { data: scores } = await supabase
    .from('poule_scores')
    .select('user_id, total_pts, exact_hits, correct_results')
    .eq('poule_id', id)
    .order('total_pts', { ascending: false })

  const { data: members } = await supabase
    .from('poule_members')
    .select('user_id, profiles(id, username, avatar_url)')
    .eq('poule_id', id)

  type Profile = { id: string; username: string; avatar_url: string | null }
  const profileMap: Record<string, Profile> = {}
  for (const m of members ?? []) {
    const p = m.profiles as Profile | null
    if (p) profileMap[p.id] = p
  }

  type ScoreRow = { user_id: string; total_pts: number; exact_hits: number; correct_results: number }
  const scoreMap: Record<string, ScoreRow> = {}
  for (const s of scores ?? []) scoreMap[s.user_id] = s

  const ranked = Object.keys(profileMap)
    .map((uid) => ({
      profile: profileMap[uid],
      score: scoreMap[uid] ?? { user_id: uid, total_pts: 0, exact_hits: 0, correct_results: 0 },
    }))
    .sort((a, b) => b.score.total_pts - a.score.total_pts)

  const isOwner = poule.creator_id === user.id

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/poules"
          className="inline-flex items-center gap-1 font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.14em] uppercase mb-5 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Terug
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Klassement</p>
            <h1 className="font-display text-2xl text-wk-text uppercase leading-none">{poule.name}</h1>
            <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
              {ranked.length} {ranked.length === 1 ? 'deelnemer' : 'deelnemers'}
            </p>
          </div>
          {!poule.is_general && (
            <div className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3 text-right">
              <p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase mb-1">Uitnodigingscode</p>
              <p className="font-display text-2xl text-wk-gold tracking-wider">{poule.invite_code}</p>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase">Stand</span>
        </div>

        {ranked.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">
            Nog geen deelnemers.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {ranked.map(({ profile, score }, index) => {
              const isCurrentUser = profile.id === user.id
              const medals = ['🥇', '🥈', '🥉']
              const medal = index < 3 ? medals[index] : null

              return (
                <div
                  key={profile.id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${isCurrentUser ? 'bg-wk-gold/5' : ''}`}
                >
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {medal ? (
                      <span className="text-base">{medal}</span>
                    ) : (
                      <span className="font-mono text-xs text-wk-muted">{index + 1}</span>
                    )}
                  </div>

                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-wk-bg2 border border-white/10 flex items-center justify-center shrink-0 font-mono text-xs font-bold text-wk-gold">
                      {profile.username.charAt(0).toUpperCase()}
                    </div>
                    <span className={`text-sm truncate ${isCurrentUser ? 'font-bold text-wk-gold' : 'font-medium text-wk-text'}`}>
                      {profile.username}
                      {isCurrentUser && <span className="ml-1.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase">jij</span>}
                    </span>
                  </div>

                  {/* Stats — hidden on mobile */}
                  <div className="hidden sm:flex items-center gap-4 shrink-0">
                    <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">{score.exact_hits}× exact</span>
                    <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">{score.correct_results}× resultaat</span>
                  </div>

                  {/* Points */}
                  <div className="shrink-0 text-right">
                    <span className="font-display text-lg text-wk-gold">{score.total_pts}</span>
                    <span className="font-mono text-[10px] text-wk-muted ml-1">pt</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Owner info */}
      {isOwner && !poule.is_general && (
        <div className="bg-wk-gold/5 border border-wk-gold/20 rounded-xl px-5 py-4">
          <p className="font-mono text-[10px] text-wk-gold tracking-[0.16em] uppercase mb-1">Jij beheert deze poule</p>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
            Deel code <span className="text-wk-gold font-bold">{poule.invite_code}</span> met vrienden om ze uit te nodigen.
          </p>
        </div>
      )}
    </div>
  )
}
