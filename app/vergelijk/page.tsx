import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePlayerIds } from '@/lib/active-players'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import { preBonusIndex } from '@/lib/bonus-order'
import { sortGroupStandings, type TeamStat } from '@/lib/group-standings'
import VergelijkClient, {
  type Deelnemer,
  type SpelerData,
  type MatchVergelijk,
  type BonusVergelijk,
  type GroupVergelijk,
  type KnockoutSide,
} from './vergelijk-client'

export const metadata = { title: 'Head-to-head · WK Poule 2026' }

type TeamRef = { name: string; flag_url: string | null }
type PredRow = {
  predicted_home: number
  predicted_away: number
  points_awarded: number | null
  match: {
    id: string
    match_number: number | null
    kickoff_at: string
    home_score: number | null
    away_score: number | null
    result_entered: boolean
    home_team: TeamRef | null
    away_team: TeamRef | null
  } | null
}

export default async function VergelijkPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ a?: string; b?: string; poule?: string }> }>) {
  const { a, b, poule } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Voorspellingen van anderen zijn pas zichtbaar vanaf de toernooistart
  if (new Date() < GROUP_STAGE_DEADLINE) redirect('/statistieken')

  // Privé-poules van de gebruiker als filteroptie
  type PouleRef = { id: string; name: string; is_general: boolean }
  const { data: memberships } = await supabase
    .from('poule_members')
    .select('poules(id, name, is_general)')
    .eq('user_id', user.id)
  const eigenPoules = ((memberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter((p): p is PouleRef => !!p && !p.is_general))
    .sort((x, y) => x.name.localeCompare(y.name))

  const pouleId = eigenPoules.some((p) => p.id === poule) ? (poule as string) : null

  // Actieve deelnemers als keuzelijst, optioneel beperkt tot één poule
  const activeIds = await getActivePlayerIds(supabase)
  let memberFilter: Set<string> | null = null
  if (pouleId) {
    const { data: pouleMembers } = await supabase
      .from('poule_members')
      .select('user_id')
      .eq('poule_id', pouleId)
    memberFilter = new Set((pouleMembers ?? []).map((m) => m.user_id))
  }

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .order('username')
  const deelnemers: Deelnemer[] = (profileRows ?? [])
    .filter((p) => activeIds.has(p.id) && (!memberFilter || memberFilter.has(p.id)))
    .map((p) => ({ id: p.id, username: p.username, avatarUrl: p.avatar_url }))
  const byId = Object.fromEntries(deelnemers.map((d) => [d.id, d]))

  // Stand in de algemene poule voor totalen + rangen
  const { data: generalPoule } = await supabase
    .from('poules')
    .select('id')
    .eq('is_general', true)
    .limit(1)
    .maybeSingle()

  type ScoreRow = {
    user_id: string
    total_pts: number
    group_match_pts: number
    group_standings_pts: number
    knockout_pts: number
    bonus_pre_pts: number
    bonus_daily_pts: number
    jokers_played: number
    exact_hits: number
    correct_results: number
  }
  const { data: scoreRows } = generalPoule
    ? await supabase
        .from('poule_scores')
        .select('user_id, total_pts, group_match_pts, group_standings_pts, knockout_pts, bonus_pre_pts, bonus_daily_pts, jokers_played, exact_hits, correct_results')
        .eq('poule_id', generalPoule.id)
        .order('total_pts', { ascending: false })
    : { data: [] }
  const ranked = ((scoreRows ?? []) as ScoreRow[]).filter((s) => activeIds.has(s.user_id))
  const scoreById: Record<string, ScoreRow> = {}
  for (const s of ranked) scoreById[s.user_id] = s

  // Rang binnen de getoonde (league-gefilterde) deelnemers
  const leagueRanked = ranked.filter((s) => byId[s.user_id])
  const leagueRankById: Record<string, number> = {}
  leagueRanked.forEach((s, i) => { leagueRankById[s.user_id] = i + 1 })

  // Selectie: ?a en ?b, met zinnige defaults (jij vs de koploper) — altijd
  // binnen de gefilterde deelnemerslijst, anders crasht de opbouw
  const valid = (id?: string) => (id && byId[id] ? id : null)
  const idA = valid(a) ?? (byId[user.id] ? user.id : deelnemers[0]?.id ?? null)
  const defaultB = leagueRanked.map((s) => s.user_id).find((uid) => uid !== idA)
    ?? deelnemers.find((d) => d.id !== idA)?.id
  const idB = valid(b) && valid(b) !== idA ? valid(b) : defaultB ?? null

  const emptyScore: Omit<ScoreRow, 'user_id'> = {
    total_pts: 0, group_match_pts: 0, group_standings_pts: 0, knockout_pts: 0,
    bonus_pre_pts: 0, bonus_daily_pts: 0, jokers_played: 0, exact_hits: 0, correct_results: 0,
  }

  const buildSpeler = (id: string): SpelerData => {
    const s = scoreById[id] ?? { user_id: id, ...emptyScore }
    return {
      ...byId[id],
      rank: leagueRankById[id] ?? null,
      totalPts: s.total_pts,
      groupMatchPts: s.group_match_pts,
      groupStandingsPts: s.group_standings_pts,
      knockoutPts: s.knockout_pts,
      bonusPrePts: s.bonus_pre_pts,
      bonusDailyPts: s.bonus_daily_pts,
      jokersPlayed: s.jokers_played,
      jokerPts: 0,
      exactHits: s.exact_hits,
      correctResults: s.correct_results,
    }
  }

  let spelerA: SpelerData | null = null
  let spelerB: SpelerData | null = null
  let matches: MatchVergelijk[] = []
  let bonus: BonusVergelijk[] = []
  let groepsfase: GroupVergelijk[] = []
  let koA: KnockoutSide | null = null
  let koB: KnockoutSide | null = null

  if (idA && idB) {
    spelerA = buildSpeler(idA)
    spelerB = buildSpeler(idB)

    const predSelect = `
      predicted_home, predicted_away, points_awarded,
      match:matches!predictions_match_id_fkey(
        id, match_number, kickoff_at, home_score, away_score, result_entered,
        home_team:teams!matches_home_team_id_fkey(name, flag_url),
        away_team:teams!matches_away_team_id_fkey(name, flag_url)
      )
    `
    const [{ data: predsA }, { data: predsB }, { data: jokers }, { data: preQuestions }, { data: bonusAnswers }] =
      await Promise.all([
        supabase.from('predictions').select(predSelect).eq('user_id', idA),
        supabase.from('predictions').select(predSelect).eq('user_id', idB),
        supabase.from('jokers').select('user_id, match_id').in('user_id', [idA, idB]),
        supabase.from('bonus_questions').select('id, question').eq('type', 'pre_tournament').order('created_at'),
        supabase.from('bonus_answers').select('user_id, question_id, answer, points_awarded').in('user_id', [idA, idB]),
      ])

    const jokersA = new Set((jokers ?? []).filter((j) => j.user_id === idA).map((j) => j.match_id))
    const jokersB = new Set((jokers ?? []).filter((j) => j.user_id === idB).map((j) => j.match_id))

    // Exact/Toto consistent met de profielpagina berekenen (Toto = juiste
    // 1X2-uitslag, inclusief exacte scores) i.p.v. de afwijkende stored waarde.
    // Plus jokerpunten = het extra dat de joker oplevert. De joker verdubbelt de
    // score, dus de bonus is de helft van de behaalde punten op die wedstrijd.
    const calcStats = (preds: PredRow[], jset: Set<string>) => {
      let exact = 0, toto = 0, jokerPts = 0
      for (const p of preds) {
        const m = p.match
        if (!m) continue
        if (jset.has(m.id)) jokerPts += (p.points_awarded ?? 0) / 2
        if (!m.result_entered || m.home_score == null || m.away_score == null) continue
        if (p.predicted_home === m.home_score && p.predicted_away === m.away_score) exact++
        if (Math.sign(p.predicted_home - p.predicted_away) === Math.sign(m.home_score - m.away_score)) toto++
      }
      return { exact, toto, jokerPts }
    }
    const statsA = calcStats((predsA ?? []) as unknown as PredRow[], jokersA)
    const statsB = calcStats((predsB ?? []) as unknown as PredRow[], jokersB)
    spelerA.exactHits = statsA.exact; spelerA.correctResults = statsA.toto; spelerA.jokerPts = statsA.jokerPts
    spelerB.exactHits = statsB.exact; spelerB.correctResults = statsB.toto; spelerB.jokerPts = statsB.jokerPts

    const predAByMatch: Record<string, PredRow> = {}
    for (const p of (predsA ?? []) as unknown as PredRow[]) {
      if (p.match) predAByMatch[p.match.id] = p
    }

    const now = Date.now()
    const rows: MatchVergelijk[] = []
    const seen = new Set<string>()
    const pushRow = (match: NonNullable<PredRow['match']>, pa: PredRow | null, pb: PredRow | null) => {
      if (seen.has(match.id)) return
      seen.add(match.id)
      if (new Date(match.kickoff_at).getTime() > now) return // alleen gestarte wedstrijden
      rows.push({
        id: match.id,
        kickoffAt: match.kickoff_at,
        homeTeam: match.home_team?.name ?? 'N.t.b.',
        awayTeam: match.away_team?.name ?? 'N.t.b.',
        homeFlag: match.home_team?.flag_url ?? null,
        awayFlag: match.away_team?.flag_url ?? null,
        actual: match.result_entered ? `${match.home_score}–${match.away_score}` : null,
        a: pa ? { pred: `${pa.predicted_home}–${pa.predicted_away}`, pts: pa.points_awarded, joker: jokersA.has(match.id) } : null,
        b: pb ? { pred: `${pb.predicted_home}–${pb.predicted_away}`, pts: pb.points_awarded, joker: jokersB.has(match.id) } : null,
      })
    }

    const predBByMatch: Record<string, PredRow> = {}
    for (const p of (predsB ?? []) as unknown as PredRow[]) {
      if (p.match) predBByMatch[p.match.id] = p
    }
    for (const p of (predsA ?? []) as unknown as PredRow[]) {
      if (p.match) pushRow(p.match, p, predBByMatch[p.match.id] ?? null)
    }
    for (const p of (predsB ?? []) as unknown as PredRow[]) {
      if (p.match) pushRow(p.match, predAByMatch[p.match.id] ?? null, p)
    }
    rows.sort((x, y) => y.kickoffAt.localeCompare(x.kickoffAt)) // nieuwste eerst
    matches = rows

    const bonusFor = (uid: string, qid: string) =>
      (bonusAnswers ?? []).find((ba) => ba.user_id === uid && ba.question_id === qid) ?? null
    // Zelfde volgorde als de bonusvragenpagina: topscorer eerst, kaartenkoning laatst
    bonus = [...(preQuestions ?? [])]
      .sort((x, y) => preBonusIndex(x.question) - preBonusIndex(y.question))
      .map((q) => {
        const ba = bonusFor(idA, q.id)
        const bb = bonusFor(idB, q.id)
        return {
          question: q.question,
          a: ba?.answer ?? null,
          b: bb?.answer ?? null,
          ptsA: ba?.points_awarded ?? null,
          ptsB: bb?.points_awarded ?? null,
        }
      })

    // ── Afgeronde groepen: head-to-head eindstand met punten ────────────────
    const { data: groupMatchRows } = await supabase
      .from('matches')
      .select(`
        id, home_score, away_score, result_entered,
        home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
        away_team:teams!matches_away_team_id_fkey(id, name, flag_url, group_name)
      `)
      .eq('stage', 'group')

    type GTeam = { id: string; name: string; flag_url: string | null; group_name: string }
    type GMatch = { id: string; home: GTeam; away: GTeam; hs: number | null; as: number | null; done: boolean }
    const teamMeta: Record<string, { name: string; flag: string | null }> = {}
    const teamNameById: Record<string, string> = {}
    const matchesByGroup: Record<string, GMatch[]> = {}
    for (const m of groupMatchRows ?? []) {
      const ht = m.home_team as GTeam | null
      const at = m.away_team as GTeam | null
      if (!ht || !at) continue
      teamMeta[ht.id] = { name: ht.name, flag: ht.flag_url }
      teamMeta[at.id] = { name: at.name, flag: at.flag_url }
      teamNameById[ht.id] = ht.name; teamNameById[at.id] = at.name
      ;(matchesByGroup[ht.group_name] ??= []).push({ id: m.id, home: ht, away: at, hs: m.home_score, as: m.away_score, done: m.result_entered })
    }

    // matchId → voorspelde uitslag per speler
    const predScore = (preds: PredRow[]): Record<string, { h: number; a: number }> => {
      const r: Record<string, { h: number; a: number }> = {}
      for (const p of preds) if (p.match) r[p.match.id] = { h: p.predicted_home, a: p.predicted_away }
      return r
    }
    const scoreA = predScore((predsA ?? []) as unknown as PredRow[])
    const scoreB = predScore((predsB ?? []) as unknown as PredRow[])

    // Eindrangschikking (teamId[]) op basis van een score-getter, met FIFA-tiebreak
    const orderFromScores = (gms: GMatch[], getScore: (gm: GMatch) => { h: number; a: number } | null): string[] => {
      const st: Record<string, TeamStat> = {}
      const h2h: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }[] = []
      for (const gm of gms) { st[gm.home.id] ??= { points: 0, gd: 0, gf: 0 }; st[gm.away.id] ??= { points: 0, gd: 0, gf: 0 } }
      for (const gm of gms) {
        const sc = getScore(gm)
        if (!sc) continue
        const { h, a } = sc
        st[gm.home.id].gf += h; st[gm.home.id].gd += h - a
        st[gm.away.id].gf += a; st[gm.away.id].gd += a - h
        if (h > a) st[gm.home.id].points += 3
        else if (h < a) st[gm.away.id].points += 3
        else { st[gm.home.id].points += 1; st[gm.away.id].points += 1 }
        h2h.push({ homeTeamId: gm.home.id, awayTeamId: gm.away.id, homeGoals: h, awayGoals: a })
      }
      return sortGroupStandings(Object.entries(st) as [string, TeamStat][], h2h, teamNameById).map(([id]) => id)
    }

    const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    for (const g of GROUPS) {
      const gms = matchesByGroup[g]
      if (!gms || gms.length < 6 || !gms.every((m) => m.done)) continue
      const actualOrder = orderFromScores(gms, (gm) => (gm.hs != null && gm.as != null ? { h: gm.hs, a: gm.as } : null))
      const sideFor = (scoreMap: Record<string, { h: number; a: number }>) => {
        const order = orderFromScores(gms, (gm) => scoreMap[gm.id] ?? null)
        return order.map((teamId, i) => ({
          name: teamMeta[teamId]?.name ?? '?',
          flag: teamMeta[teamId]?.flag ?? null,
          pts: teamId === actualOrder[i] ? 5 : 0,
        }))
      }
      groepsfase.push({ group: g, a: sideFor(scoreA), b: sideFor(scoreB) })
    }

    // ── Knockout-voorspelling (halve finales, finale, 3e plek, kampioen) ────
    // Elk slot bewaart de voorspelde winnaar: KF 97-100, HF 101-102, 3e 103,
    // finale 104. De HF-teams zijn de KF-winnaars, de finalisten de HF-winnaars.
    const KO_SLOTS = [97, 98, 99, 100, 101, 102, 103, 104]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: brackets } = await (supabase as any)
      .from('bracket_predictions')
      .select('user_id, slot, predicted_team_id')
      .in('user_id', [idA, idB])
      .in('slot', KO_SLOTS)
    type BracketRow = { user_id: string; slot: number; predicted_team_id: string | null }
    const bracketRows = (brackets ?? []) as BracketRow[]
    const koTeamIds = [...new Set(bracketRows.map((b) => b.predicted_team_id).filter(Boolean))] as string[]
    const { data: koTeamRows } = koTeamIds.length
      ? await supabase.from('teams').select('id, name, flag_url').in('id', koTeamIds)
      : { data: [] }
    const koTeamById: Record<string, { name: string; flag: string | null }> = {}
    for (const t of koTeamRows ?? []) koTeamById[t.id] = { name: t.name, flag: t.flag_url }

    const buildKo = (uid: string): KnockoutSide | null => {
      const pick: Record<number, { name: string; flag: string | null } | null> = {}
      for (const b of bracketRows) {
        if (b.user_id === uid) pick[b.slot] = b.predicted_team_id ? koTeamById[b.predicted_team_id] ?? null : null
      }
      if (!KO_SLOTS.some((s) => pick[s])) return null
      return {
        sf1: [pick[97] ?? null, pick[98] ?? null], sf1Winner: pick[101] ?? null,
        sf2: [pick[99] ?? null, pick[100] ?? null], sf2Winner: pick[102] ?? null,
        finalists: [pick[101] ?? null, pick[102] ?? null], champion: pick[104] ?? null,
        third: pick[103] ?? null,
      }
    }
    koA = buildKo(idA)
    koB = buildKo(idB)
  }

  return (
    <VergelijkClient
      deelnemers={deelnemers}
      poules={eigenPoules.map(({ id, name }) => ({ id, name }))}
      pouleId={pouleId}
      idA={idA}
      idB={idB}
      spelerA={spelerA}
      spelerB={spelerB}
      matches={matches}
      bonus={bonus}
      groepsfase={groepsfase}
      koA={koA}
      koB={koB}
    />
  )
}
