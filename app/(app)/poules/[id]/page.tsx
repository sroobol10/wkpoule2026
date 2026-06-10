import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AvatarCircle } from '@/components/avatar-circle'
import DeletePouleButton from './delete-poule-button'
import SharePouleButton from './share-poule-button'
import { Podium } from './podium'

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
    .select(`
      user_id, total_pts, exact_hits, correct_results, rank_change,
      group_match_pts, group_standings_pts, knockout_pts,
      bonus_pre_pts, bonus_daily_pts, jokers_played
    `)
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

  type ScoreRow = {
    user_id: string
    total_pts: number
    exact_hits: number
    correct_results: number
    rank_change: number | null
    group_match_pts: number
    group_standings_pts: number
    knockout_pts: number
    bonus_pre_pts: number
    bonus_daily_pts: number
    jokers_played: number
  }
  const scoreMap: Record<string, ScoreRow> = {}
  for (const s of scores ?? []) scoreMap[s.user_id] = s as ScoreRow

  const ranked = Object.keys(profileMap)
    .map((uid) => ({
      profile: profileMap[uid],
      score: scoreMap[uid] ?? {
        user_id: uid, total_pts: 0, exact_hits: 0, correct_results: 0,
        rank_change: null, group_match_pts: 0, group_standings_pts: 0,
        knockout_pts: 0, bonus_pre_pts: 0, bonus_daily_pts: 0, jokers_played: 0,
      } as ScoreRow,
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
            <div className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3 text-right space-y-2">
              <div>
                <p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase mb-1">Uitnodigingscode</p>
                <p className="font-display text-2xl text-wk-gold tracking-wider">{poule.invite_code}</p>
              </div>
              <div className="flex justify-end">
                <SharePouleButton inviteCode={poule.invite_code} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Podium voor de top 3 */}
      {ranked.length > 0 && (
        <Podium
          currentUserId={user.id}
          entries={ranked.slice(0, 3).map(({ profile, score }) => ({
            id: profile.id,
            username: profile.username,
            avatarUrl: profile.avatar_url,
            totalPts: score.total_pts,
          }))}
        />
      )}

      {/* Leaderboard tabel */}
      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        {ranked.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">
            Nog geen deelnemers.
          </div>
        ) : (
          <>
          {/* Mobile: twee regels per deelnemer */}
          <div className="sm:hidden divide-y divide-white/5">
            {ranked.map(({ profile, score }, index) => {
              const isCurrentUser = profile.id === user.id
              const medals = ['🥇', '🥈', '🥉']
              const medal = index < 3 ? medals[index] : null
              return (
                <div key={profile.id} className={`px-4 py-3 space-y-1.5 ${isCurrentUser ? 'bg-wk-gold/5' : ''}`}>
                  {/* Rij 1: positie + naam + totaal */}
                  <div className="flex items-center gap-3">
                    <div className="w-6 text-center shrink-0">
                      {medal ? <span className="text-sm">{medal}</span> : <span className="font-mono text-xs text-wk-muted">{index + 1}</span>}
                    </div>
                    <RankBadge change={score.rank_change} />
                    <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={24} />
                    <Link href={`/deelnemers/${profile.id}`} className={`flex-1 text-sm font-medium hover:underline underline-offset-2 ${isCurrentUser ? 'text-wk-gold font-bold' : 'text-wk-text hover:text-wk-gold'}`}>{profile.username}</Link>
                    <span className="font-display text-base text-wk-gold shrink-0">{score.total_pts}<span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span></span>
                  </div>
                  {/* Rij 2 + 3: categorieën bovenop, waarden eronder */}
                  {(() => {
                    const cats = [
                      { label: 'WED',    val: score.group_match_pts },
                      { label: 'STAND',  val: score.group_standings_pts },
                      { label: 'KO',     val: score.knockout_pts },
                      { label: 'BONUS',  val: score.bonus_pre_pts },
                      { label: 'DAG',    val: score.bonus_daily_pts },
                      { label: 'JOKERS', val: score.jokers_played },
                    ]
                    return (
                      <div className="pl-9 space-y-0.5">
                        {/* Categorielabels */}
                        <div className="flex gap-0">
                          {cats.map(({ label }) => (
                            <span key={label} className="flex-1 font-mono text-[8px] text-wk-muted/60 tracking-widest text-center uppercase">
                              {label}
                            </span>
                          ))}
                        </div>
                        {/* Waarden */}
                        <div className="flex gap-0">
                          {cats.map(({ label, val }) => (
                            <span key={label} className={`flex-1 font-mono text-[11px] font-bold text-center ${val > 0 ? 'text-wk-soft' : 'text-wk-muted/40'}`}>
                              {val}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
          {/* Desktop: volledige tabel */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[680px] text-left border-collapse">
              {/* Header */}
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-10 bg-wk-surface px-3 py-2.5 w-8 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center">#</th>
                  <th className="sticky left-8 z-10 bg-wk-surface px-0 py-2.5 w-6 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center">±</th>
                  <th className="sticky left-14 z-10 bg-wk-surface pl-2 pr-4 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase">Deelnemer</th>
                  <th className="px-3 py-2.5 font-mono text-[9px] text-wk-gold tracking-widest uppercase text-right">Totaal</th>
                  <ColHeader label="JOKERS" sublabel="/ 12" />
                  <ColHeader label="WED" sublabel="Groepsfase" />
                  <ColHeader label="STAND" sublabel="Eindstand" />
                  <ColHeader label="KO" sublabel="KO-fase" />
                  <ColHeader label="BONUS" sublabel="Bonus vooraf" />
                  <ColHeader label="DAG" sublabel="Bonus dagelijks" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ranked.map(({ profile, score }, index) => {
                  const isCurrentUser = profile.id === user.id
                  const medals = ['🥇', '🥈', '🥉']
                  const medal = index < 3 ? medals[index] : null

                  return (
                    <tr
                      key={profile.id}
                      className={`${isCurrentUser ? 'bg-wk-gold/5' : 'hover:bg-white/2'}`}
                    >
                      {/* Positie */}
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-3 w-8 text-center">
                        {medal
                          ? <span className="text-sm">{medal}</span>
                          : <span className="font-mono text-xs text-wk-muted">{index + 1}</span>
                        }
                      </td>

                      {/* Rang-wijziging */}
                      <td className="sticky left-8 z-10 bg-inherit px-0 py-3 w-6 text-center">
                        <RankBadge change={score.rank_change} />
                      </td>

                      {/* Naam */}
                      <td className="sticky left-14 z-10 bg-inherit pl-2 pr-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={28} />
                          <Link href={`/deelnemers/${profile.id}`} className={`text-sm whitespace-nowrap hover:underline underline-offset-2 ${isCurrentUser ? 'font-bold text-wk-gold' : 'font-medium text-wk-text hover:text-wk-gold'}`}>
                            {profile.username}
                          </Link>
                        </div>
                      </td>

                      {/* Totaal */}
                      <td className="px-3 py-3 text-right">
                        <span className="font-display text-base text-wk-gold">{score.total_pts}</span>
                        <span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span>
                      </td>

                      {/* Jokers */}
                      <DataCell value={score.jokers_played} suffix={`/12`} />

                      {/* Groepsfase wedstrijden */}
                      <DataCell value={score.group_match_pts} suffix="pt" />

                      {/* Groepsfase eindstand */}
                      <DataCell value={score.group_standings_pts} suffix="pt" />

                      {/* KO-fase */}
                      <DataCell value={score.knockout_pts} suffix="pt" />

                      {/* Bonus vooraf */}
                      <DataCell value={score.bonus_pre_pts} suffix="pt" />

                      {/* Bonus dagelijks */}
                      <DataCell value={score.bonus_daily_pts} suffix="pt" />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Legenda */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          ['WED', 'Groepsfase wedstrijden'],
          ['STAND', 'Groepsfase eindstanden'],
          ['KO', 'Knockout-fase'],
          ['BONUS', 'Bonusvragen vooraf'],
          ['DAG', 'Bonusvragen dagelijks'],
          ['JOKERS', 'Ingezette jokers (max. 1 per groep)'],
        ].map(([abbr, label]) => (
          <div key={abbr} className="flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold text-wk-gold bg-wk-gold/10 border border-wk-gold/20 rounded px-1.5 py-0.5 tracking-widest shrink-0">
              {abbr}
            </span>
            <span className="font-mono text-[9px] text-wk-muted tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      {/* Owner info */}
      {isOwner && !poule.is_general && (
        <div className="bg-wk-gold/5 border border-wk-gold/20 rounded-xl px-5 py-4">
          <p className="font-mono text-[10px] text-wk-gold tracking-[0.16em] uppercase mb-1">Jij beheert deze poule</p>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
            Deel code <span className="text-wk-gold font-bold">{poule.invite_code}</span> met vrienden om ze uit te nodigen.
          </p>
          <div className="mt-3 pt-3 border-t border-white/10">
            <DeletePouleButton pouleId={poule.id} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tabel-subcomponenten ─────────────────────────────────────────────────────

function ColHeader({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <th className="px-3 py-2.5 text-right min-w-[56px]">
      <span className="block font-mono text-[9px] font-bold text-wk-muted tracking-widest uppercase">{label}</span>
      <span className="block font-mono text-[8px] text-wk-muted/50 tracking-widest normal-case">{sublabel}</span>
    </th>
  )
}

function DataCell({ value, suffix }: { value: number; suffix: string }) {
  const isEmpty = value === 0
  return (
    <td className="px-3 py-3 text-right">
      <span className={`font-mono text-xs ${isEmpty ? 'text-wk-muted/40' : 'text-wk-soft'}`}>
        {value}
      </span>
      <span className="font-mono text-[9px] text-wk-muted/40 ml-0.5">{suffix}</span>
    </td>
  )
}

function RankBadge({ change }: { change: number | null }) {
  if (change === null || change === 0) {
    return <span className="font-mono text-[10px] text-wk-muted/40">–</span>
  }
  if (change > 0) {
    return (
      <span className="font-mono text-[10px] font-bold text-wk-green tracking-tighter">
        ↑{change}
      </span>
    )
  }
  return (
    <span className="font-mono text-[10px] font-bold text-wk-red tracking-tighter">
      ↓{Math.abs(change)}
    </span>
  )
}
