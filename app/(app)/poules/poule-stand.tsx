import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { AvatarCircle } from '@/components/avatar-circle'
import { getActivePlayerIds } from '@/lib/active-players'
import { Podium } from './[id]/podium'
import { Bergetappe } from './[id]/bergetappe'
import { LeaderboardTabs } from './[id]/leaderboard-tabs'
import { StandFilter, type StandFilterEntry } from './[id]/stand-filter'

// Deze poule krijgt het Ennovate-logo als titel i.p.v. de poulenaam
const ENNOVATE_POULE_ID = '14ccff59-b97a-41d9-9856-5c6413cd2c05'

// Prijzengeld per positie — alleen voor Schmitt's scorebordstrijd
const PRIJZEN = [300, 150, 75, 50, 25, 12.5, 12.5, 12.5]
const prijsLabel = (bedrag: number) =>
  `€ ${bedrag.toLocaleString('nl-NL', { minimumFractionDigits: bedrag % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

// Volledig klassement van één poule: titel, podium/bergetappe, tabel en legenda.
// Wordt gebruikt op /poules (direct de eigen league) en /poules/[id].
export async function PouleStand({
  pouleId,
  currentUserId,
  showTitle = true,
}: {
  pouleId: string
  currentUserId: string
  showTitle?: boolean
}) {
  const supabase = await createClient()

  const { data: poule } = await supabase
    .from('poules')
    .select('id, name, is_general')
    .eq('id', pouleId)
    .single()
  if (!poule) return null

  const { data: scores } = await supabase
    .from('poule_scores')
    .select(`
      user_id, total_pts, exact_hits, correct_results, rank_change,
      group_match_pts, group_standings_pts, knockout_pts,
      bonus_pre_pts, bonus_daily_pts, jokers_played
    `)
    .eq('poule_id', pouleId)
    .order('total_pts', { ascending: false })

  const { data: members } = await supabase
    .from('poule_members')
    .select('user_id, profiles(id, username, full_name, avatar_url)')
    .eq('poule_id', pouleId)

  type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null }
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

  // Alleen deelnemers die alle groepswedstrijden hebben voorspeld doen mee
  const activeIds = await getActivePlayerIds(supabase)

  const ranked = Object.keys(profileMap)
    .filter((uid) => activeIds.has(uid))
    .map((uid) => ({
      profile: profileMap[uid],
      score: scoreMap[uid] ?? {
        user_id: uid, total_pts: 0, exact_hits: 0, correct_results: 0,
        rank_change: null, group_match_pts: 0, group_standings_pts: 0,
        knockout_pts: 0, bonus_pre_pts: 0, bonus_daily_pts: 0, jokers_played: 0,
      } as ScoreRow,
    }))
    .sort((a, b) => b.score.total_pts - a.score.total_pts)

  // Gedeelde posities bij gelijk puntentotaal: 1, –, –, 4 i.p.v. 1, 2, 3, 4.
  // tiedAbove[i] = deze deelnemer heeft hetzelfde totaal als die erboven.
  const tiedAbove = ranked.map((r, i) => i > 0 && ranked[i - 1].score.total_pts === r.score.total_pts)

  // Prijzengeld hoort bij Schmitt's scorebordstrijd, o.b.v. positie in die league.
  // Bij ex aequo wordt de som van de betreffende prijzen gelijk verdeeld.
  const isSchmitt = poule.name.toLowerCase().includes('schmitt')
  // Ennovate toont de legenda ónder de stand; de overige poules erboven (onder de titel)
  const isEnnovate = poule.id === ENNOVATE_POULE_ID || poule.name.toLowerCase().includes('ennovate')
  const prijsByIndex: (string | null)[] = new Array(ranked.length).fill(null)
  if (isSchmitt) {
    let i = 0
    while (i < ranked.length) {
      let j = i
      while (j + 1 < ranked.length && ranked[j + 1].score.total_pts === ranked[i].score.total_pts) j++
      let sum = 0
      for (let k = i; k <= j; k++) sum += k < PRIJZEN.length ? PRIJZEN[k] : 0
      const avg = sum / (j - i + 1)
      if (avg > 0) for (let k = i; k <= j; k++) prijsByIndex[k] = prijsLabel(avg)
      i = j + 1
    }
  }
  const prijsVoor = (index: number): string | null => prijsByIndex[index] ?? null

  // ── Voorspelde wereldkampioen per deelnemer (vlag naast de naam) ────────────
  const rankedIds = ranked.map((r) => r.profile.id)
  const champByUser: Record<string, string> = {}
  if (rankedIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: champPicks } = await (supabase as any)
      .from('bracket_predictions')
      .select('user_id, predicted_team_id')
      .eq('slot', 104)
      .in('user_id', rankedIds)
    for (const p of (champPicks ?? []) as { user_id: string; predicted_team_id: string }[]) {
      champByUser[p.user_id] = p.predicted_team_id
    }
  }
  const champTeamIds = [...new Set(Object.values(champByUser))]
  const { data: champTeams } = champTeamIds.length
    ? await supabase.from('teams').select('id, name, flag_url').in('id', champTeamIds)
    : { data: [] }
  const champTeamById: Record<string, { name: string; flag_url: string }> = {}
  for (const t of champTeams ?? []) champTeamById[t.id] = t

  // Landen die nog actief zijn (= teams met een nog niet gespeelde wedstrijd).
  // Bepaalt of het kampioensvlaggetje in kleur of grijstinten staat.
  const { data: unplayedMatches } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id')
    .eq('result_entered', false)
  const activeTeamIds = new Set<string>()
  for (const m of unplayedMatches ?? []) {
    if (m.home_team_id) activeTeamIds.add(m.home_team_id)
    if (m.away_team_id) activeTeamIds.add(m.away_team_id)
  }
  const champFor = (uid: string) => {
    const teamId = champByUser[uid]
    const team = teamId ? champTeamById[teamId] : null
    return team ? { team, active: activeTeamIds.has(teamId) } : null
  }

  // ── Jokerpunten (alleen voor de Ennovate-statfilter) ────────────────────────
  // Een joker verdubbelt de wedstrijdpunten; de jokerbonus is dus de helft van
  // de toegekende punten op die wedstrijd. Alleen gespeelde (uitslag-ingevoerde)
  // jokers tellen mee.
  // Aantal gespeelde groepswedstrijden = noemer voor het 'correct resultaat'-
  // percentage (elke actieve deelnemer heeft alle groepswedstrijden voorspeld).
  let playedGroupMatches = 0
  const jokerPointsByUser: Record<string, number> = {}
  if (isEnnovate && rankedIds.length) {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('stage', 'group')
      .eq('result_entered', true)
    playedGroupMatches = count ?? 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jokerRows } = await (supabase as any)
      .from('jokers')
      .select('user_id, match_id, match:matches!jokers_match_id_fkey(result_entered)')
      .in('user_id', rankedIds)
    const activeJokers = ((jokerRows ?? []) as {
      user_id: string; match_id: string; match: { result_entered: boolean } | null
    }[]).filter((j) => j.match?.result_entered)
    if (activeJokers.length) {
      const jokerMatchIds = [...new Set(activeJokers.map((j) => j.match_id))]
      const { data: predRows } = await supabase
        .from('predictions')
        .select('user_id, match_id, points_awarded')
        .in('user_id', rankedIds)
        .in('match_id', jokerMatchIds)
      const predPts: Record<string, number> = {}
      for (const p of predRows ?? []) predPts[`${p.user_id}:${p.match_id}`] = p.points_awarded ?? 0
      for (const j of activeJokers) {
        const pts = predPts[`${j.user_id}:${j.match_id}`] ?? 0
        jokerPointsByUser[j.user_id] = (jokerPointsByUser[j.user_id] ?? 0) + Math.round(pts / 2)
      }
    }
  }

  const filterEntries: StandFilterEntry[] = ranked.map(({ profile, score }) => ({
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    // 'Correct resultaat' = juiste richting incl. exacte scores, net als op de
    // deelnemer-detailpagina (poule_scores.correct_results telt exact NIET mee).
    correct: score.correct_results + score.exact_hits,
    exact: score.exact_hits,
    joker: jokerPointsByUser[profile.id] ?? 0,
    dag: score.bonus_daily_pts,
    bonus: score.bonus_pre_pts,
  }))

  // De bergetappe-weergave is voorlopig alleen beschikbaar in de Ennovate-poule
  const showBergetappe = poule.name.toLowerCase().includes('ennovate')
  let tournamentProgress = 0
  if (showBergetappe) {
    const { count: totalMatches } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
    const { count: playedMatches } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('result_entered', true)
    tournamentProgress = totalMatches ? (playedMatches ?? 0) / totalMatches : 0
  }

  // Sticky-offsets (desktop). De prijzenkolom staat vooraan (bij Schmitt),
  // daarna positie, rangwijziging en de naamkolom.
  const prijsLeft = 'left-0'
  const posLeft = isSchmitt ? 'left-14' : 'left-0'
  const changeLeft = isSchmitt ? 'left-22' : 'left-8'
  const naamLeft = isSchmitt ? 'left-28' : 'left-14'

  // Positieweergave (medaille of nummer; – bij gedeelde positie)
  const posCell = (index: number) => {
    if (tiedAbove[index]) return '–'
    const medals = ['🥇', '🥈', '🥉']
    return index < 3 ? medals[index] : String(index + 1)
  }

  return (
    <div className="space-y-6">
      {showTitle && (
        <div>
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Tussenstand</p>
          {poule.id === ENNOVATE_POULE_ID ? (
            <h2 className="leading-none">
              <Image src="/ennovate.png" alt={poule.name} width={500} height={80} className="h-7 sm:h-8 w-auto" />
            </h2>
          ) : (
            <h2 className="font-display text-2xl text-wk-text uppercase leading-none">{poule.name}</h2>
          )}
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {ranked.length} {ranked.length === 1 ? 'deelnemer' : 'deelnemers'}
          </p>
          {/* Legenda onder de titel (desktop) — niet bij Ennovate, die staat onder de stand */}
          {!isEnnovate && <KlassementLegenda className="hidden md:grid mt-4" />}
        </div>
      )}

      {/* Twee weergaven: klassiek klassement of de bergetappe */}
      <LeaderboardTabs
        bergetappe={
          showBergetappe ? (
            <Bergetappe
              currentUserId={currentUserId}
              progress={tournamentProgress}
              entries={ranked.map(({ profile, score }) => ({
                id: profile.id,
                username: profile.username,
                avatarUrl: profile.avatar_url,
                totalPts: score.total_pts,
              }))}
            />
          ) : undefined
        }
      >

      {/* Statfilter (alleen Ennovate): bekijk de stand per losse statistiek */}
      <StandFilter enabled={isEnnovate} entries={filterEntries} playedCount={playedGroupMatches} currentUserId={currentUserId}>

      {/* Podium voor de top 3 — niet in de Schmitt-league (daar geldt prijzengeld) */}
      {ranked.length > 0 && !isSchmitt && (
        <Podium
          currentUserId={currentUserId}
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
              const isCurrentUser = profile.id === currentUserId
              const pos = posCell(index)
              const isMedal = ['🥇', '🥈', '🥉'].includes(pos)
              const prijs = prijsVoor(index)
              const champ = champFor(profile.id)
              return (
                <div key={profile.id} className={`px-4 py-3 space-y-1.5 ${isCurrentUser ? 'bg-wk-gold/5' : ''}`}>
                  {/* Rij 1: positie + naam + totaal */}
                  <div className="flex items-center gap-3">
                    <div className="w-6 text-center shrink-0">
                      {isMedal ? <span className="text-sm">{pos}</span> : <span className="font-mono text-xs text-wk-muted">{pos}</span>}
                    </div>
                    <RankBadge change={score.rank_change} />
                    <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={24} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link href={`/deelnemers/${profile.id}`} className={`text-sm font-medium truncate hover:underline underline-offset-2 ${isCurrentUser ? 'text-wk-gold font-bold' : 'text-wk-text hover:text-wk-gold'}`}>{profile.username}</Link>
                        {champ && <ChampFlag team={champ.team} active={champ.active} />}
                      </div>
                      {profile.full_name && (
                        <p className="font-mono text-[9px] text-wk-muted truncate leading-tight">{profile.full_name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-display text-lg text-wk-gold [text-shadow:0_0_12px_rgba(244,185,46,0.45)]">{score.total_pts}<span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span></span>
                      {prijs && (
                        <p className="font-mono text-[9px] font-bold text-wk-green leading-tight">{prijs}</p>
                      )}
                    </div>
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
                  {isSchmitt && (
                    <th className={`sticky ${prijsLeft} z-10 bg-wk-surface px-2 py-2.5 w-14 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center`}>Prijs</th>
                  )}
                  <th className={`sticky ${posLeft} z-10 bg-wk-surface px-3 py-2.5 w-8 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center`}>#</th>
                  <th className={`sticky ${changeLeft} z-10 bg-wk-surface px-0 py-2.5 w-6 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center`}>±</th>
                  <th className={`sticky ${naamLeft} z-10 bg-wk-surface pl-2 pr-4 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase`}>Deelnemer</th>
                  <th className="px-3 py-2.5 w-20 min-w-20 font-mono text-[9px] text-wk-gold tracking-widest uppercase text-right">Totaal</th>
                  <ColHeader label="JOKERS" />
                  <ColHeader label="WED" />
                  <ColHeader label="STAND" />
                  <ColHeader label="KO" />
                  <ColHeader label="BONUS" />
                  <ColHeader label="DAG" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ranked.map(({ profile, score }, index) => {
                  const isCurrentUser = profile.id === currentUserId
                  const pos = posCell(index)
                  const isMedal = ['🥇', '🥈', '🥉'].includes(pos)
                  const prijs = prijsVoor(index)
                  const champ = champFor(profile.id)

                  return (
                    <tr
                      key={profile.id}
                      className={`${isCurrentUser ? 'bg-wk-gold/5' : 'hover:bg-white/2'}`}
                    >
                      {/* Prijzengeld (alleen Schmitt-league) — vooraan */}
                      {isSchmitt && (
                        <td className={`sticky ${prijsLeft} z-10 bg-inherit px-2 py-3 w-14 text-center`}>
                          {prijs && (
                            <span className="font-mono text-[10px] font-bold text-wk-green whitespace-nowrap">{prijs}</span>
                          )}
                        </td>
                      )}

                      {/* Positie */}
                      <td className={`sticky ${posLeft} z-10 bg-inherit px-3 py-3 w-8 text-center`}>
                        {isMedal
                          ? <span className="text-sm">{pos}</span>
                          : <span className="font-mono text-xs text-wk-muted">{pos}</span>
                        }
                      </td>

                      {/* Rang-wijziging */}
                      <td className={`sticky ${changeLeft} z-10 bg-inherit px-0 py-3 w-6 text-center`}>
                        <RankBadge change={score.rank_change} />
                      </td>

                      {/* Naam */}
                      <td className={`sticky ${naamLeft} z-10 bg-inherit pl-2 pr-4 py-3`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={28} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Link href={`/deelnemers/${profile.id}`} className={`text-sm whitespace-nowrap hover:underline underline-offset-2 ${isCurrentUser ? 'font-bold text-wk-gold' : 'font-medium text-wk-text hover:text-wk-gold'}`}>
                                {profile.username}
                              </Link>
                              {champ && <ChampFlag team={champ.team} active={champ.active} />}
                            </div>
                            {profile.full_name && (
                              <p className="font-mono text-[9px] text-wk-muted whitespace-nowrap leading-tight">{profile.full_name}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Totaal */}
                      <td className="px-3 py-3 w-20 text-right">
                        <span className="font-display text-lg text-wk-gold [text-shadow:0_0_12px_rgba(244,185,46,0.45)]">{score.total_pts}</span>
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

      </StandFilter>

      {/* Legenda onder de stand — mobiel altijd, op desktop alleen bij Ennovate */}
      <KlassementLegenda className={isEnnovate ? '' : 'md:hidden'} />

      </LeaderboardTabs>
    </div>
  )
}

// ─── Legenda ──────────────────────────────────────────────────────────────────
// Volgorde gelijk aan de kolommen van het klassement (die is leidend).
const LEGEND_ITEMS: [string, string][] = [
  ['JOKERS', 'Ingezette jokers (max. 1 per groep)'],
  ['WED', 'Groepsfase wedstrijden'],
  ['STAND', 'Groepsfase eindstanden'],
  ['KO', 'Knockout-fase'],
  ['BONUS', 'Bonusvragen vooraf'],
  ['DAG', 'Bonusvragen dagelijks'],
]

export function KlassementLegenda({ className = '' }: { className?: string }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${className}`}>
      {LEGEND_ITEMS.map(([abbr, label]) => (
        <div key={abbr} className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-bold text-wk-gold bg-wk-gold/10 border border-wk-gold/20 rounded px-1.5 py-0.5 tracking-widest shrink-0">
            {abbr}
          </span>
          <span className="font-mono text-[9px] text-wk-muted tracking-widest">{label}</span>
        </div>
      ))}
    </div>
  )
}

// Voorspelde wereldkampioen als vlaggetje naast de naam; grijstinten zodra
// het gekozen land is uitgeschakeld.
function ChampFlag({ team, active }: { team: { name: string; flag_url: string }; active: boolean }) {
  return (
    <Image
      src={team.flag_url}
      alt={team.name}
      title={`Voorspeld wereldkampioen: ${team.name}${active ? '' : ' (uitgeschakeld)'}`}
      width={18}
      height={12}
      className={`rounded-sm object-cover w-[18px] h-3 shrink-0 ${active ? '' : 'grayscale opacity-60'}`}
    />
  )
}

// ─── Tabel-subcomponenten ─────────────────────────────────────────────────────

function ColHeader({ label }: { label: string }) {
  return (
    <th className="px-3 py-2.5 text-right w-20 min-w-20">
      <span className="block font-mono text-[9px] font-bold text-wk-muted tracking-widest uppercase">{label}</span>
    </th>
  )
}

function DataCell({ value, suffix }: { value: number; suffix: string }) {
  const isEmpty = value === 0
  return (
    <td className="px-3 py-3 w-20 text-right">
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
