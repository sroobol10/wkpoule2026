import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE, STAGE_LABELS } from '@/lib/constants'
import { getActivePlayerIds } from '@/lib/active-players'
import { AvatarCircle } from '@/components/avatar-circle'
import CloseButton from './close-button'

export const metadata = { title: 'Wedstrijdduel · WK Poule 2026' }

const HOME_COLOR = '#2D6BE5'
const DRAW_COLOR = '#7C8398'
const AWAY_COLOR = '#E63946'

type Supporter = {
  id: string
  username: string
  avatarUrl: string | null
  predLabel: string   // groep: "2–1"; knockout: leeg (het kamp toont de keuze)
  exact: boolean      // groep: exacte score; knockout: juiste winnaar
}

export default async function WedstrijdPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: match } = await supabase
    .from('matches')
    .select(`
      id, kickoff_at, stage, match_number, venue, home_score, away_score, result_entered, shootout_winner_id,
      home_team:teams!matches_home_team_id_fkey(id, name, flag_url),
      away_team:teams!matches_away_team_id_fkey(id, name, flag_url)
    `)
    .eq('id', id)
    .single()

  if (!match) notFound()

  type Team = { id: string; name: string; flag_url: string | null }
  const homeTeam = (match.home_team as Team | null) ?? { id: '', name: 'N.t.b.', flag_url: null }
  const awayTeam = (match.away_team as Team | null) ?? { id: '', name: 'N.t.b.', flag_url: null }
  const isKnockout = match.stage !== 'group'
  // KO-winnaar: gelijkspel → strafschoppen-winnaar
  const actualWinnerId = !match.result_entered
    ? null
    : (match.home_score ?? 0) > (match.away_score ?? 0) ? homeTeam.id
    : (match.away_score ?? 0) > (match.home_score ?? 0) ? awayTeam.id
    : (match.shootout_winner_id ?? null)

  // Vanaf de toernooistart zijn alle voorspellingen zichtbaar (zelfde regel als
  // de deelnemerspagina's); daarvoor blijven ze geheim.
  const now = new Date()
  const started = match.result_entered || new Date(match.kickoff_at) <= now
  const revealed = started || now >= GROUP_STAGE_DEADLINE

  const homeCamp: Supporter[] = []
  const drawCamp: Supporter[] = []
  const awayCamp: Supporter[] = []
  let hiddenCount = 0

  // Beperk tot de actieve leden van je eigen league(s) — zelfde filtering als
  // op de klassement- en statistiekenpagina (niet het hele algemene veld)
  const activeIds = await getActivePlayerIds(supabase)
  const { data: myMemberships } = await supabase
    .from('poule_members')
    .select('poules(id, is_general)')
    .eq('user_id', user.id)
  type PouleRef = { id: string; is_general: boolean }
  const privePouleIds = (myMemberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter((p): p is PouleRef => !!p && !p.is_general)
    .map((p) => p.id)
  let memberIds = activeIds
  if (privePouleIds.length > 0) {
    const { data: leagueMembers } = await supabase
      .from('poule_members')
      .select('user_id')
      .in('poule_id', privePouleIds)
    const leagueSet = new Set((leagueMembers ?? []).map((m) => m.user_id))
    memberIds = new Set([...activeIds].filter((uid) => leagueSet.has(uid)))
  }

  type Profile = { id: string; username: string; avatar_url: string | null }
  if (revealed) {
    if (isKnockout) {
      // Knockout: voorspelde winnaar (knockout_predictions) → kamp thuis/uit (geen gelijkspel)
      const { data: koPreds } = await supabase
        .from('knockout_predictions')
        .select('predicted_winner_id, profiles(id, username, avatar_url)')
        .eq('match_id', id)
      for (const p of koPreds ?? []) {
        const profile = p.profiles as Profile | null
        if (!profile || !memberIds.has(profile.id)) continue
        const supporter: Supporter = {
          id: profile.id,
          username: profile.username,
          avatarUrl: profile.avatar_url,
          predLabel: '',
          exact: match.result_entered && p.predicted_winner_id === actualWinnerId,
        }
        if (p.predicted_winner_id === homeTeam.id) homeCamp.push(supporter)
        else if (p.predicted_winner_id === awayTeam.id) awayCamp.push(supporter)
      }
    } else {
      const { data: predictions } = await supabase
        .from('predictions')
        .select('predicted_home, predicted_away, profiles(id, username, avatar_url)')
        .eq('match_id', id)
      for (const p of predictions ?? []) {
        const profile = p.profiles as Profile | null
        if (!profile || !memberIds.has(profile.id)) continue
        const supporter: Supporter = {
          id: profile.id,
          username: profile.username,
          avatarUrl: profile.avatar_url,
          predLabel: `${p.predicted_home}–${p.predicted_away}`,
          exact: match.result_entered && p.predicted_home === match.home_score && p.predicted_away === match.away_score,
        }
        if (p.predicted_home > p.predicted_away) homeCamp.push(supporter)
        else if (p.predicted_home < p.predicted_away) awayCamp.push(supporter)
        else drawCamp.push(supporter)
      }
    }
    const byWinnerThenName = (a: Supporter, b: Supporter) =>
      Number(b.exact) - Number(a.exact) || a.username.localeCompare(b.username)
    homeCamp.sort(byWinnerThenName)
    drawCamp.sort(byWinnerThenName)
    awayCamp.sort(byWinnerThenName)
  } else {
    const { data: predRows } = await supabase
      .from(isKnockout ? 'knockout_predictions' : 'predictions')
      .select('user_id')
      .eq('match_id', id)
    hiddenCount = (predRows ?? []).filter((p) => memberIds.has(p.user_id)).length
  }

  const winners = [...homeCamp, ...drawCamp, ...awayCamp].filter((s) => s.exact)
  const total = homeCamp.length + drawCamp.length + awayCamp.length

  const outcome: 'home' | 'draw' | 'away' | null = !match.result_entered
    ? null
    : (match.home_score ?? 0) > (match.away_score ?? 0)
      ? 'home'
      : (match.home_score ?? 0) < (match.away_score ?? 0)
        ? 'away'
        : 'draw'

  const kickoffLabel = new Date(match.kickoff_at).toLocaleString('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  })

  const camps = [
    { key: 'home' as const, label: `${homeTeam.name} wint`, color: HOME_COLOR, supporters: homeCamp },
    // Geen gelijkspel-kamp in de knockout
    ...(isKnockout ? [] : [{ key: 'draw' as const, label: 'Gelijkspel', color: DRAW_COLOR, supporters: drawCamp }]),
    { key: 'away' as const, label: `${awayTeam.name} wint`, color: AWAY_COLOR, supporters: awayCamp },
  ]

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      {/* Spotlights in kampkleuren */}
      <div
        className="pointer-events-none absolute -left-48 top-16 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 animate-pulse"
        style={{ background: `radial-gradient(closest-side, ${HOME_COLOR}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute -right-48 top-16 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 animate-pulse"
        style={{ background: `radial-gradient(closest-side, ${AWAY_COLOR}, transparent)`, animationDelay: '1s' }}
      />

      {/* Sluiten — terug naar de pagina waar je vandaan kwam */}
      <CloseButton />

      <div className="relative max-w-4xl mx-auto px-4 py-10 sm:py-14 space-y-8 sm:space-y-10">
        {/* Kop */}
        <div className="text-center animate-fade-up">
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-2">
            {STAGE_LABELS[match.stage] ?? match.stage}
            {match.match_number ? ` · Wedstrijd ${match.match_number}` : ''}
          </p>
          <h1 className="font-display text-2xl sm:text-4xl uppercase leading-none">Het duel</h1>
          <p className="font-mono text-xs text-wk-muted mt-2 tracking-[0.12em]">
            {kickoffLabel}{match.venue ? ` · ${match.venue}` : ''}
          </p>
        </div>

        {/* Affiche: vlaggen + stand */}
        <div className="animate-podium-pop flex items-center justify-center gap-4 sm:gap-10" style={{ animationDelay: '0.15s' }}>
          <div className="flex flex-col items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {homeTeam.flag_url && (
              <Image
                src={homeTeam.flag_url}
                alt={homeTeam.name}
                width={112}
                height={80}
                className="rounded-lg object-cover w-20 h-14 sm:w-28 sm:h-20 ring-1 ring-white/15 shadow-xl"
                unoptimized
              />
            )}
            <span className="font-display text-sm sm:text-xl uppercase text-center leading-tight">{homeTeam.name}</span>
          </div>

          <div className="text-center shrink-0">
            {match.result_entered ? (
              <p className="font-display text-4xl sm:text-7xl text-wk-gold leading-none whitespace-nowrap">
                {match.home_score} – {match.away_score}
              </p>
            ) : (
              <p className="font-display text-3xl sm:text-5xl text-wk-muted/60 leading-none">VS</p>
            )}
            <p className="font-mono text-[9px] sm:text-[10px] text-wk-muted tracking-[0.16em] uppercase mt-2">
              {match.result_entered ? 'Eindstand' : started ? 'Bezig / wacht op uitslag' : 'Nog niet gespeeld'}
            </p>
          </div>

          <div className="flex flex-col items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {awayTeam.flag_url && (
              <Image
                src={awayTeam.flag_url}
                alt={awayTeam.name}
                width={112}
                height={80}
                className="rounded-lg object-cover w-20 h-14 sm:w-28 sm:h-20 ring-1 ring-white/15 shadow-xl"
                unoptimized
              />
            )}
            <span className="font-display text-sm sm:text-xl uppercase text-center leading-tight">{awayTeam.name}</span>
          </div>
        </div>

        {!revealed ? (
          /* Tot de toernooistart blijven voorspellingen geheim */
          <div className="animate-fade-up bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center space-y-2">
            <p className="text-2xl">🔒</p>
            <p className="font-mono text-xs text-wk-soft tracking-[0.12em]">
              Voorspellingen blijven geheim tot de start van het toernooi.
            </p>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
              {hiddenCount} {hiddenCount === 1 ? 'deelnemer heeft' : 'deelnemers hebben'} al voorspeld.
            </p>
          </div>
        ) : (
          <>
            {/* Wedstrijdwinnaars: exacte score voorspeld */}
            {match.result_entered && (
              <div className="animate-podium-pop bg-wk-gold/5 border border-wk-gold/30 rounded-xl px-5 py-5 text-center" style={{ animationDelay: '0.35s' }}>
                <p className="font-mono text-[10px] text-wk-gold tracking-[0.2em] uppercase mb-3">
                  🏆 Winnaars van deze wedstrijd · {isKnockout ? 'juiste winnaar' : 'exacte score'}
                </p>
                {winners.length === 0 ? (
                  <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
                    {isKnockout ? 'Niemand had de juiste winnaar voorspeld.' : 'Niemand had de exacte score voorspeld.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    {winners.map(({ id: uid, username, avatarUrl }, i) => (
                      <Link
                        key={uid}
                        href={`/deelnemers/${uid}`}
                        className="animate-podium-pop flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-wk-gold/10 border border-wk-gold/40 hover:border-wk-gold transition-colors"
                        style={{ animationDelay: `${0.5 + i * 0.08}s` }}
                      >
                        <AvatarCircle username={username} avatarUrl={avatarUrl} size={24} />
                        <span className={`text-sm font-bold ${uid === user.id ? 'text-wk-gold' : 'text-wk-text'}`}>
                          {username}
                        </span>
                        <span className="text-sm">🥇</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Krachtmeting over de drie kampen */}
            {total > 0 && (
              <div className="animate-fade-up max-w-md mx-auto" style={{ animationDelay: '0.3s' }}>
                <div className="h-1.5 rounded-full overflow-hidden flex bg-white/5">
                  {camps.map(({ key, color, supporters }) => (
                    <div key={key} style={{ width: `${(supporters.length / total) * 100}%`, background: color }} />
                  ))}
                </div>
              </div>
            )}

            {/* De drie kampen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 border-t border-white/10 pt-8">
              {camps.map(({ key, label, color, supporters }) => {
                const isCorrect = outcome === key
                const isWrong = outcome !== null && !isCorrect
                return (
                  <div key={key} className={`min-w-0 transition-[filter,opacity] ${isWrong ? 'grayscale opacity-50' : ''}`}>
                    <p className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color }}>
                      {label} · {supporters.length}
                      {isCorrect && <span className="ml-1.5 text-wk-green">✓</span>}
                    </p>
                    <div className="flex flex-wrap gap-1.5 content-start">
                      {supporters.length === 0 ? (
                        <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">Niemand.</p>
                      ) : (
                        supporters.map(({ id: uid, username, avatarUrl, predLabel, exact }, i) => {
                          const isCurrentUser = uid === user.id
                          return (
                            <Link
                              key={uid}
                              href={`/deelnemers/${uid}`}
                              className={`animate-podium-pop flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-wk-surface border transition-colors hover:border-white/30 ${
                                exact ? 'border-wk-gold/50' : isCurrentUser ? 'border-wk-gold/40' : 'border-white/10'
                              }`}
                              style={{ animationDelay: `${Math.min(0.6 + i * 0.05, 2)}s` }}
                            >
                              <AvatarCircle username={username} avatarUrl={avatarUrl} size={20} />
                              <span className={`text-xs truncate max-w-24 ${isCurrentUser ? 'font-bold text-wk-gold' : 'text-wk-soft'}`}>
                                {username}
                              </span>
                              {predLabel && (
                                <span className={`font-mono text-[10px] font-bold shrink-0 ${exact ? 'text-wk-gold' : 'text-wk-muted'}`}>
                                  {predLabel}
                                </span>
                              )}
                              {isKnockout && exact && <span className="text-[10px] shrink-0">✓</span>}
                            </Link>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
