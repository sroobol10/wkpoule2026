import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePlayerIds } from '@/lib/active-players'
import { BRACKET, assignThirdPlaceSlots } from '@/lib/bracket'
import { computeAliveTeamIds, type AliveGroupMatch, type AliveKoMatch } from '@/lib/alive-teams'
import { koWinnerId } from '@/lib/ko-winner'
import KnockoutClient from './knockout-client'

const LIVE_STAGES = ['r32', 'r16', 'qf', 'sf', 'final']

// Server-versie van de bracket-resolutie (zelfde logica als computeBracket in de
// client): los per deelnemer de deelnemers + winnaar van elk slot op.
function resolveMemberBracket(
  advMap: Record<string, Record<number, string>>,
  thirdAssignment: Record<number, string>,
  picks: Record<number, string>,
): Record<number, { home: string | null; away: string | null; winner: string | null; loser: string | null }> {
  const resolved: Record<number, { home: string | null; away: string | null; winner: string | null; loser: string | null }> = {}
  const resolveSeed = (seed: string): string | null => {
    if (seed.startsWith('W')) return resolved[parseInt(seed.slice(1))]?.winner ?? null
    if (seed.startsWith('L')) return resolved[parseInt(seed.slice(1))]?.loser ?? null
    if (seed.startsWith('3_')) { const g = thirdAssignment[parseInt(seed.slice(2))]; return g ? (advMap[g]?.[3] ?? null) : null }
    const pos = parseInt(seed[0]); const group = seed[1]
    return advMap[group]?.[pos] ?? null
  }
  for (const m of BRACKET) {
    const home = resolveSeed(m.homeSeed)
    const away = resolveSeed(m.awaySeed)
    const winner = picks[m.slot] ?? null
    const loser = winner ? (winner === home ? away : home) : null
    resolved[m.slot] = { home, away, winner, loser }
  }
  return resolved
}

export default async function KnockoutPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Live knockout matches (post-group stage) ───────────────────────────────
  const { data: matches } = await supabase
    .from('matches')
    .select('id, stage, kickoff_at, match_number, home_team_id, away_team_id, home_score, away_score, result_entered')
    .in('stage', LIVE_STAGES)
    .order('kickoff_at', { ascending: true })

  const liveTeamIds = new Set<string>()
  for (const m of matches ?? []) {
    if (m.home_team_id) liveTeamIds.add(m.home_team_id)
    if (m.away_team_id) liveTeamIds.add(m.away_team_id)
  }

  const { data: liveTeams } = liveTeamIds.size > 0
    ? await supabase.from('teams').select('id, name, code, flag_url').in('id', [...liveTeamIds])
    : { data: [] }

  const matchIds = (matches ?? []).map((m) => m.id)
  const { data: livePredictions } = matchIds.length > 0
    ? await supabase
        .from('knockout_predictions')
        .select('match_id, predicted_winner_id, points_awarded')
        .eq('user_id', user.id)
        .in('match_id', matchIds)
    : { data: [] }

  // ── Bracket prediction (pre-tournament) ───────────────────────────────────
  const [{ data: allTeams }, { data: advancement }, { data: firstGroupMatch }, { count: playedGroupCount }] =
    await Promise.all([
      supabase
        .from('teams')
        .select('id, name, flag_url, group_name')
        .order('name'),
      supabase
        .from('group_advancement')
        .select('team_id, predicted_position')
        .eq('user_id', user.id),
      supabase
        .from('matches')
        .select('kickoff_at')
        .eq('stage', 'group')
        .order('kickoff_at', { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('stage', 'group')
        .eq('result_entered', true),
    ])

  const anyGroupMatchPlayed = (playedGroupCount ?? 0) > 0

  // Bracket picks (incl. points_awarded na simulatie/live)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracketPicks } = await (supabase as any)
    .from('bracket_predictions')
    .select('slot, predicted_team_id, points_awarded')
    .eq('user_id', user.id)

  // Teams die daadwerkelijk naar de volgende ronde zijn doorgestoten
  // Sleutel = de ronde waaruit ze komen (r32 → wie staat in r16, etc.)
  const { data: koMatches } = await supabase
    .from('matches')
    .select('match_number, stage, kickoff_at, home_team_id, away_team_id, home_score, away_score, result_entered, shootout_winner_id')
    .order('kickoff_at', { ascending: true })
    .in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])

  // slot → werkelijke winnaar (gelijkspel → strafschoppen-winnaar)
  const actualWinners: Record<number, string> = {}
  for (const m of koMatches ?? []) {
    const w = m.match_number && m.result_entered ? koWinnerId(m) : null
    if (m.match_number && w) actualWinners[m.match_number] = w
  }

  // stage → teams die DEZE ronde halen (= advanced FROM previous stage)
  const teamsInStage: Record<string, Set<string>> = {}
  for (const m of koMatches ?? []) {
    if (!m.home_team_id || !m.away_team_id) continue
    if (!teamsInStage[m.stage]) teamsInStage[m.stage] = new Set()
    teamsInStage[m.stage].add(m.home_team_id)
    teamsInStage[m.stage].add(m.away_team_id)
  }

  // Wie is kampioen en wie werd 3e?
  const finalWinner = actualWinners[104] ?? null   // slot 104 = Finale
  const thirdWinner = actualWinners[103] ?? null   // slot 103 = Troostfinale

  // advancedFromStage[r32] = teams die R32 overleefden = teams in R16
  const advancedFromStage: Record<string, string[]> = {
    r32:         [...(teamsInStage['r16']         ?? [])],
    r16:         [...(teamsInStage['qf']          ?? [])],
    qf:          [...(teamsInStage['sf']          ?? [])],
    // "Overleefde de halve finale" = door naar de FINALE. De verliezers zakken af naar
    // de troostfinale; die zijn NIET doorgegaan (worden dus niet als "winnaar elders"
    // gekleurd) — ze blijven wél actief tot de troostfinale gespeeld is (zie alive-teams).
    sf:          [...(teamsInStage['final']       ?? [])],
    final:       finalWinner ? [finalWinner] : [],
    third_place: thirdWinner ? [thirdWinner] : [],
  }

  // reachedStage[stage] = teams die DEZE ronde daadwerkelijk bereikten (in de echte wedstrijden
  // stonden) → onderscheidt "verloor deze ronde" (rood) van "eerder uitgeschakeld" (grijs).
  const reachedStage: Record<string, string[]> = Object.fromEntries(
    Object.entries(teamsInStage).map(([k, v]) => [k, [...v]]),
  )

  // ── "Wie koos wat" per live KO-wedstrijd (over je eigen league) ─────────────
  // Per deelnemer resolven we de volledige bracket en tellen we, per actueel team
  // in elk live duel: hoe vaak gekozen op deze plek (bereikt dit duel) en hoe vaak
  // als winnaar van dit duel.
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
    const { data: lm } = await supabase.from('poule_members').select('user_id').in('poule_id', privePouleIds)
    const set = new Set((lm ?? []).map((m) => m.user_id))
    memberIds = new Set([...activeIds].filter((id) => set.has(id)))
  }

  // Uitgeschakelde ploegen → rood in de bracket (geen punten meer te halen)
  const { data: groupForAlive } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, result_entered, home_team:teams!matches_home_team_id_fkey(id, name, group_name), away_team:teams!matches_away_team_id_fkey(id, name, group_name)')
    .eq('stage', 'group')
  const aliveSet = computeAliveTeamIds(
    (groupForAlive ?? []) as unknown as AliveGroupMatch[],
    (koMatches ?? []) as unknown as AliveKoMatch[],
  )
  const eliminatedTeams = (allTeams ?? []).filter((t) => !aliveSet.has(t.id)).map((t) => t.id)

  const groupByTeam: Record<string, string> = {}
  for (const t of allTeams ?? []) if (t.group_name) groupByTeam[t.id] = t.group_name

  // Alle bracket-keuzes + groepsvoorspellingen van de league-leden (gepagineerd)
  async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await make(from, from + 999)
      const rows = data ?? []
      out.push(...rows)
      if (rows.length < 1000) break
    }
    return out
  }
  const memberArr = [...memberIds]
  const [allBracket, allAdv] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAll<{ user_id: string; slot: number; predicted_team_id: string }>((f, t) => (supabase as any)
      .from('bracket_predictions').select('user_id, slot, predicted_team_id').in('user_id', memberArr).range(f, t)),
    fetchAll<{ user_id: string; team_id: string; predicted_position: number }>((f, t) => supabase
      .from('group_advancement').select('user_id, team_id, predicted_position').in('user_id', memberArr).range(f, t)),
  ])

  // Groepeer per deelnemer
  const picksByUser: Record<string, Record<number, string>> = {}
  for (const b of allBracket) (picksByUser[b.user_id] ??= {})[b.slot] = b.predicted_team_id
  const advByUser: Record<string, { advMap: Record<string, Record<number, string>>; thirdGroups: Set<string> }> = {}
  for (const a of allAdv) {
    const g = groupByTeam[a.team_id]
    if (!g) continue
    const u = (advByUser[a.user_id] ??= { advMap: {}, thirdGroups: new Set() })
    ;(u.advMap[g] ??= {})[a.predicted_position] = a.team_id
    if (a.predicted_position === 3) u.thirdGroups.add(g)
  }

  // Tel per slot, gesplitst per seed: hoe vaak elk team op de thuis-plek en op de
  // uit-plek werd voorspeld (= bereikt dit duel via die seed).
  const homeBySlot: Record<number, Record<string, number>> = {}
  const awayBySlot: Record<number, Record<string, number>> = {}
  // Daarnaast: hoe vaak elk team als WINNAAR van dit slot werd getipt (los van de seed).
  const winnerBySlot: Record<number, Record<string, number>> = {}
  for (const uid of memberArr) {
    const picks = picksByUser[uid] ?? {}
    const adv = advByUser[uid]
    if (!adv && Object.keys(picks).length === 0) continue
    const advMap = adv?.advMap ?? {}
    const thirdAssignment = assignThirdPlaceSlots([...(adv?.thirdGroups ?? [])].sort())
    const resolved = resolveMemberBracket(advMap, thirdAssignment, picks)
    for (const b of BRACKET) {
      const r = resolved[b.slot]
      if (!r) continue
      if (r.home) (homeBySlot[b.slot] ??= {})[r.home] = ((homeBySlot[b.slot]?.[r.home]) ?? 0) + 1
      if (r.away) (awayBySlot[b.slot] ??= {})[r.away] = ((awayBySlot[b.slot]?.[r.away]) ?? 0) + 1
      const w = picks[b.slot]
      if (w) (winnerBySlot[b.slot] ??= {})[w] = ((winnerBySlot[b.slot]?.[w]) ?? 0) + 1
    }
  }

  // Werkelijke teams per seed (uit de live KO-wedstrijden) voor de kleuren
  const actualHomeBySlot: Record<number, string | null> = {}
  const actualAwayBySlot: Record<number, string | null> = {}
  for (const m of matches ?? []) {
    if (m.match_number == null) continue
    actualHomeBySlot[m.match_number] = m.home_team_id
    actualAwayBySlot[m.match_number] = m.away_team_id
  }

  const sortRows = (m: Record<string, number>) =>
    Object.entries(m).map(([teamId, count]) => ({ teamId, count })).sort((a, c) => c.count - a.count)

  const koSlotDist: Record<number, {
    homeSeed: string; awaySeed: string
    home: { teamId: string; count: number }[]
    away: { teamId: string; count: number }[]
    winner: { teamId: string; count: number }[]
    actualHome: string | null; actualAway: string | null
    actualWinner: string | null
  }> = {}
  for (const b of BRACKET) {
    const home = sortRows(homeBySlot[b.slot] ?? {})
    const away = sortRows(awayBySlot[b.slot] ?? {})
    const winner = sortRows(winnerBySlot[b.slot] ?? {})
    if (!home.length && !away.length && !winner.length) continue
    koSlotDist[b.slot] = {
      homeSeed: b.homeSeed,
      awaySeed: b.awaySeed,
      home,
      away,
      winner,
      actualHome: actualHomeBySlot[b.slot] ?? null,
      actualAway: actualAwayBySlot[b.slot] ?? null,
      actualWinner: actualWinners[b.slot] ?? null,
    }
  }

  return (
    <KnockoutClient
      matches={matches ?? []}
      liveTeams={liveTeams ?? []}
      livePredictions={livePredictions ?? []}
      slotDist={koSlotDist}
      allTeams={allTeams ?? []}
      advancement={advancement ?? []}
      bracketPicks={bracketPicks ?? []}
      groupStageStartsAt={firstGroupMatch?.kickoff_at ?? null}
      anyMatchPlayed={anyGroupMatchPlayed}
      actualWinners={actualWinners}
      advancedFromStage={advancedFromStage}
      reachedStage={reachedStage}
      eliminatedTeams={eliminatedTeams}
    />
  )
}
