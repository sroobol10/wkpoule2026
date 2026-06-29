import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import { getActivePlayerIds } from '@/lib/active-players'
import { computeAliveTeamIds, type AliveGroupMatch, type AliveKoMatch } from '@/lib/alive-teams'
import StatsClient, { type KampioenverdeligEntry, type BonusQuestionStat } from './stats-client'

// PostgREST levert standaard max. 1000 rijen per query. Met ~65 deelnemers ×
// tientallen wedstrijden/vragen lopen voorspellingen en bonusantwoorden daar
// ruim overheen, waardoor o.a. de joker-winst werd ondergeteld. Pagineren dus.
async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await makeQuery(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export default async function StatistiekenPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ league?: string }> }>) {
  const { league } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const nowMs = Date.now()

  // Toernooi "gestart" zodra er minimaal één groepswedstrijd gespeeld is
  const { count: playedCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('stage', 'group')
    .eq('result_entered', true)
  const tournamentStarted = (playedCount ?? 0) > 0 || new Date() >= GROUP_STAGE_DEADLINE

  // ── League-bepaling ──────────────────────────────────────────────────────
  // Statistieken gaan alleen over je eigen league. Wie in meerdere leagues
  // zit (Pim & Stefan) krijgt een filter: per league of beiden (default).
  type PouleRef = { id: string; name: string; is_general: boolean }
  const { data: leagueMemberships } = await supabase
    .from('poule_members')
    .select('poules(id, name, is_general)')
    .eq('user_id', user.id)
  const privePoules = ((leagueMemberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter((p): p is PouleRef => !!p && !p.is_general))
    .sort((a, b) => a.name.localeCompare(b.name))

  const selectedLeague = privePoules.length > 1 && privePoules.some((p) => p.id === league)
    ? (league as string)
    : null // null = beiden (of de enige league)
  const leagueIds = privePoules.length === 0
    ? [] // geen privé-league → alle actieve deelnemers
    : selectedLeague ? [selectedLeague] : privePoules.map((p) => p.id)

  // ── Deelnemers binnen de league ──────────────────────────────────────────
  // Alleen wie alle groepswedstrijden heeft voorspeld doet mee
  const activeIds = await getActivePlayerIds(supabase)
  let memberIds = activeIds
  if (leagueIds.length > 0) {
    const { data: leagueMembers } = await supabase
      .from('poule_members')
      .select('user_id')
      .in('poule_id', leagueIds)
    const leagueSet = new Set((leagueMembers ?? []).map((m) => m.user_id))
    memberIds = new Set([...activeIds].filter((id) => leagueSet.has(id)))
  }
  const totalDeelnemers = memberIds.size

  // ── Effectieve deadline per dag (voor bonus stats) ───────────────────────
  const { data: allGroupMatches } = await supabase
    .from('matches')
    .select('kickoff_at')
    .eq('stage', 'group')
    .order('kickoff_at')

  // Zelfde regel als de bonusvragenpagina en saveBonusAnswer:
  // deadline = aftrap van de vroegste wedstrijd op die CEST-kalenderdag
  const deadlineByDate: Record<string, string> = {}
  for (const m of allGroupMatches ?? []) {
    const cest = new Date(new Date(m.kickoff_at).getTime() + 2 * 60 * 60 * 1000)
    const day = cest.toISOString().slice(0, 10)
    if (!deadlineByDate[day]) deadlineByDate[day] = m.kickoff_at
  }

  // ── WK-kampioen verdeling ────────────────────────────────────────────────
  let kampioenStats: KampioenverdeligEntry[] = []

  if (tournamentStarted) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allFinalePicks } = await (supabase as any)
      .from('bracket_predictions')
      .select('user_id, predicted_team_id')
      .eq('slot', 104)
    const finalePicks = ((allFinalePicks ?? []) as { user_id: string; predicted_team_id: string }[])
      .filter((p) => memberIds.has(p.user_id))

    if (finalePicks && finalePicks.length > 0) {
      const teamIds = (finalePicks as { predicted_team_id: string }[]).map((p) => p.predicted_team_id)

      const { data: teams } = await supabase
        .from('teams')
        .select('id, name, flag_url')
        .in('id', teamIds)

      const teamById: Record<string, { name: string; flag_url: string }> = {}
      for (const t of teams ?? []) teamById[t.id] = t

      const counts: Record<string, number> = {}
      for (const { predicted_team_id } of finalePicks as { predicted_team_id: string }[]) {
        const name = teamById[predicted_team_id]?.name
        if (name) counts[name] = (counts[name] ?? 0) + 1
      }

      const flagMap: Record<string, string> = {}
      for (const t of teams ?? []) flagMap[t.name] = t.flag_url

      kampioenStats = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .map(([answer, count]) => ({
          answer,
          count,
          flag_url: flagMap[answer] ?? null,
        }))
    }
  }

  // ── Bonus-vraag statistieken ─────────────────────────────────────────────
  const { data: bonusQuestions } = await supabase
    .from('bonus_questions')
    .select('id, question, type, unlock_date, correct_answer_set, correct_answer')
    .order('type')
    .order('unlock_date')

  const allBonusAnswers = await fetchAllRows<{ user_id: string; question_id: string; answer: string }>(
    (from, to) => supabase.from('bonus_answers').select('user_id, question_id, answer').range(from, to),
  )
  const bonusAnswers = allBonusAnswers.filter((a) => memberIds.has(a.user_id))

  // Eigen antwoord per vraag — om de eigen selectie in de verdeling te markeren
  const myAnswerByQuestion: Record<string, string> = {}
  for (const a of allBonusAnswers) {
    if (a.user_id === user.id && a.answer) myAnswerByQuestion[a.question_id] = a.answer
  }

  const answersByQuestion: Record<string, string[]> = {}
  for (const a of bonusAnswers ?? []) {
    if (!a.answer) continue
    answersByQuestion[a.question_id] ??= []
    answersByQuestion[a.question_id].push(a.answer)
  }

  // Live landenpunten per categorie (zelfde berekening als awardCountryBonus in de
  // admin): goals voor (goalgettergigant), tegen (desastreuze defensie) en kaarten
  // (kaartenkoning: geel = 1, rood = 2). Voor weergave naast de landenvragen.
  const [{ data: scoreMatches }, { data: cardRows }, { data: teamIdNames }] = await Promise.all([
    supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score').eq('result_entered', true),
    supabase.from('match_cards').select('team_id, yellow_cards, red_cards'),
    supabase.from('teams').select('id, name'),
  ])
  const nameById: Record<string, string> = {}
  for (const t of teamIdNames ?? []) nameById[t.id] = t.name
  const goalsForByName: Record<string, number> = {}
  const goalsAgainstByName: Record<string, number> = {}
  const cardsByName: Record<string, number> = {}
  for (const m of scoreMatches ?? []) {
    if (m.home_team_id && m.home_score != null) {
      const n = nameById[m.home_team_id]
      if (n) { goalsForByName[n] = (goalsForByName[n] ?? 0) + m.home_score; goalsAgainstByName[n] = (goalsAgainstByName[n] ?? 0) + (m.away_score ?? 0) }
    }
    if (m.away_team_id && m.away_score != null) {
      const n = nameById[m.away_team_id]
      if (n) { goalsForByName[n] = (goalsForByName[n] ?? 0) + m.away_score; goalsAgainstByName[n] = (goalsAgainstByName[n] ?? 0) + (m.home_score ?? 0) }
    }
  }
  for (const c of (cardRows ?? []) as { team_id: string; yellow_cards: number; red_cards: number }[]) {
    const n = nameById[c.team_id]
    if (n) cardsByName[n] = (cardsByName[n] ?? 0) + (c.yellow_cards ?? 0) + (c.red_cards ?? 0) * 2
  }

  const bonusQuestionStats: BonusQuestionStat[] = []
  for (const q of bonusQuestions ?? []) {
    const closed = q.type === 'pre_tournament'
      ? tournamentStarted
      : q.unlock_date
        ? nowMs >= new Date(deadlineByDate[q.unlock_date] ?? (q.unlock_date + 'T00:00:00Z')).getTime()
        : false

    if (!closed) continue

    const answers = answersByQuestion[q.id] ?? []
    const countMap: Record<string, number> = {}
    for (const a of answers) countMap[a] = (countMap[a] ?? 0) + 1

    const total = answers.length
    const correctLower = q.correct_answer?.toLowerCase() ?? null
    const myAnswerLower = myAnswerByQuestion[q.id]?.toLowerCase() ?? null

    // Topscorer / Beste speler / de drie landenvragen: sorteren op aantal keer
    // gekozen (hoog→laag). Landenvragen tonen bovendien hun huidige puntentaantal.
    const ql = q.question.toLowerCase()
    const byCount = ['topscorer', 'beste speler', 'goalgettergigant', 'desastreuze', 'kaartenkoning'].some((k) => ql.includes(k))
    const pointsMap: Record<string, number> | null = ql.includes('goalgettergigant')
      ? goalsForByName
      : ql.includes('desastreuze')
        ? goalsAgainstByName
        : ql.includes('kaartenkoning')
          ? cardsByName
          : null

    const topAnswers = Object.entries(countMap)
      .sort(([a, ca], [b, cb]) => {
        if (byCount) return cb - ca || a.localeCompare(b, 'nl', { sensitivity: 'base' })
        const na = parseFloat(a)
        const nb = parseFloat(b)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.localeCompare(b, 'nl', { sensitivity: 'base' })
      })
      .map(([answer, count]) => ({
        answer,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        points: pointsMap ? (pointsMap[answer] ?? 0) : null,
        is_correct: correctLower !== null && answer.toLowerCase() === correctLower,
        is_mine: myAnswerLower !== null && answer.toLowerCase() === myAnswerLower,
      }))

    bonusQuestionStats.push({
      id: q.id,
      question: q.question,
      type: q.type,
      unlock_date: q.unlock_date,
      correct_answer_set: q.correct_answer_set,
      total_answers: total,
      participation_pct: (totalDeelnemers ?? 0) > 0
        ? Math.round((total / (totalDeelnemers ?? 1)) * 100)
        : 0,
      top_answers: topAnswers,
    })
  }

  // Vlaggen-map (landnaam → vlag) voor de antwoordverdeling
  const { data: allTeamsForFlags } = await supabase.from('teams').select('id, name, flag_url')
  const teamFlags: Record<string, string> = {}
  for (const t of allTeamsForFlags ?? []) if (t.flag_url) teamFlags[t.name] = t.flag_url

  // Uitgeschakelde landen → grijs bij de bonusvragen
  const [{ data: aliveGroupM }, { data: aliveKoM }] = await Promise.all([
    supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score, result_entered, home_team:teams!matches_home_team_id_fkey(id, name, group_name), away_team:teams!matches_away_team_id_fkey(id, name, group_name)').eq('stage', 'group'),
    supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score, result_entered').in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']),
  ])
  const aliveSet = computeAliveTeamIds(
    (aliveGroupM ?? []) as unknown as AliveGroupMatch[],
    (aliveKoM ?? []) as unknown as AliveKoMatch[],
  )
  const eliminatedCountries = (allTeamsForFlags ?? []).filter((t) => !aliveSet.has(t.id)).map((t) => t.name)

  return (
    <StatsClient
      tournamentStarted={tournamentStarted}
      leagues={privePoules.length > 1 ? privePoules.map(({ id, name }) => ({ id, name })) : []}
      selectedLeague={selectedLeague}
      kampioenStats={kampioenStats}
      totalDeelnemers={totalDeelnemers ?? 0}
      bonusQuestionStats={bonusQuestionStats}
      teamFlags={teamFlags}
      eliminatedCountries={eliminatedCountries}
    />
  )
}
