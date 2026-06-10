import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import StatsClient, { type KampioenverdeligEntry, type MatchStat, type ScoreDist, type AccuracyStats, type BonusQuestionStat, type TopStandingEntry, type JokerStat } from './stats-client'

export default async function StatistiekenPage() {
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

  // ── Totaal deelnemers ────────────────────────────────────────────────────
  const { count: totalDeelnemers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  // ── Effectieve deadline per dag (voor bonus stats) ───────────────────────
  const { data: allGroupMatches } = await supabase
    .from('matches')
    .select('kickoff_at')
    .eq('stage', 'group')
    .order('kickoff_at')

  const firstKickoffByDay: Record<string, string> = {}
  for (const m of allGroupMatches ?? []) {
    const cest = new Date(new Date(m.kickoff_at).getTime() + 2 * 60 * 60 * 1000)
    const day = cest.toISOString().slice(0, 10)
    const hourCEST = cest.getUTCHours()
    if (hourCEST < 13) continue
    if (!firstKickoffByDay[day]) firstKickoffByDay[day] = m.kickoff_at
  }
  const deadlineByDate: Record<string, string> = {}
  for (const [day, kickoff] of Object.entries(firstKickoffByDay)) {
    deadlineByDate[day] = new Date(new Date(kickoff).getTime() - 60 * 60 * 1000).toISOString()
  }

  // ── WK-kampioen verdeling ────────────────────────────────────────────────
  let kampioenStats: KampioenverdeligEntry[] = []

  if (tournamentStarted) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: finalePicks } = await (supabase as any)
      .from('bracket_predictions')
      .select('predicted_team_id')
      .eq('slot', 104)

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

  // ── Uitslagverdeling + nauwkeurigheid ────────────────────────────────────
  const { data: startedMatches } = await supabase
    .from('matches')
    .select(`
      id, match_number, kickoff_at, stage,
      home_score, away_score,
      home_team:teams!matches_home_team_id_fkey(name, flag_url, group_name),
      away_team:teams!matches_away_team_id_fkey(name, flag_url, group_name)
    `)
    .eq('stage', 'group')
    .eq('result_entered', true)
    .order('kickoff_at')

  type TeamRef = { name: string; flag_url: string; group_name: string }

  const groupedMatches: Record<string, MatchStat[]> = {}
  let accuracyStats: AccuracyStats | null = null

  if (startedMatches && startedMatches.length > 0) {
    const matchIds = startedMatches.map((m) => m.id)

    const { data: predictions } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away')
      .in('match_id', matchIds)

    type PredEntry = { match_id: string; predicted_home: number; predicted_away: number }
    const predsByMatch: Record<string, PredEntry[]> = {}
    for (const p of predictions ?? []) {
      predsByMatch[p.match_id] ??= []
      predsByMatch[p.match_id].push(p)
    }

    // Score lookup voor nauwkeurigheidsberekening
    const scoreByMatchId: Record<string, { home: number; away: number }> = {}
    for (const m of startedMatches) {
      if (m.home_score != null && m.away_score != null) {
        scoreByMatchId[m.id] = { home: m.home_score, away: m.away_score }
      }
    }

    let exactCount = 0
    let correctResultCount = 0
    let totalScoredPredictions = 0

    for (const p of predictions ?? []) {
      const actual = scoreByMatchId[p.match_id]
      if (!actual) continue
      totalScoredPredictions++
      if (p.predicted_home === actual.home && p.predicted_away === actual.away) exactCount++
      if (Math.sign(p.predicted_home - p.predicted_away) === Math.sign(actual.home - actual.away)) correctResultCount++
    }

    if (totalScoredPredictions > 0) {
      accuracyStats = {
        playedMatches: Object.keys(scoreByMatchId).length,
        totalPredictions: totalScoredPredictions,
        exactCount,
        correctResultCount,
      }
    }

    for (const m of startedMatches) {
      const homeTeam = m.home_team as TeamRef | null
      const awayTeam = m.away_team as TeamRef | null
      if (!homeTeam || !awayTeam) continue

      const group = homeTeam.group_name
      const matchPreds = predsByMatch[m.id] ?? []

      const distMap: Record<string, number> = {}
      for (const p of matchPreds) {
        const key = `${p.predicted_home}-${p.predicted_away}`
        distMap[key] = (distMap[key] ?? 0) + 1
      }

      const distribution: ScoreDist[] = Object.entries(distMap)
        .map(([key, count]) => {
          const [h, a] = key.split('-').map(Number)
          return { predicted_home: h, predicted_away: a, count }
        })
        .sort((a, b) => b.count - a.count)

      groupedMatches[group] ??= []
      groupedMatches[group].push({
        id: m.id,
        match_number: m.match_number ?? 0,
        kickoff_at: m.kickoff_at,
        home_team: homeTeam.name,
        away_team: awayTeam.name,
        home_flag: homeTeam.flag_url,
        away_flag: awayTeam.flag_url,
        total_predictions: matchPreds.length,
        distribution,
      })
    }
  }

  // ── Top 10 algemeen klassement ───────────────────────────────────────────
  let topStandings: TopStandingEntry[] = []

  if (tournamentStarted) {
    // Find the general poule
    const { data: generalPoule } = await supabase
      .from('poules')
      .select('id')
      .eq('is_general', true)
      .maybeSingle()

    if (generalPoule) {
      const { data: scoreRows } = await supabase
        .from('poule_scores')
        .select('user_id, total_pts')
        .eq('poule_id', generalPoule.id)
        .order('total_pts', { ascending: false })
        .limit(10)

      if (scoreRows && scoreRows.length > 0) {
        const userIds = scoreRows.map((s) => s.user_id)
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds)

        const profileById: Record<string, { username: string; avatar_url: string | null }> = {}
        for (const p of profileRows ?? []) profileById[p.id] = p

        topStandings = scoreRows.map((s, i) => ({
          userId: s.user_id,
          username: profileById[s.user_id]?.username ?? s.user_id,
          avatarUrl: profileById[s.user_id]?.avatar_url ?? null,
          totalPts: s.total_pts,
          rank: i + 1,
        }))
      }
    }
  }

  // ── Joker hotspots ───────────────────────────────────────────────────────
  let jokerStats: JokerStat[] = []

  if (tournamentStarted) {
    const { data: allJokers } = await supabase
      .from('jokers')
      .select('match_id')

    if (allJokers && allJokers.length > 0) {
      // Count per match
      const jokerCountByMatch: Record<string, number> = {}
      for (const j of allJokers) {
        jokerCountByMatch[j.match_id] = (jokerCountByMatch[j.match_id] ?? 0) + 1
      }

      // Top 8 match IDs
      const topMatchIds = Object.entries(jokerCountByMatch)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([id]) => id)

      // Fetch match details (could be started or upcoming)
      const { data: jokerMatches } = await supabase
        .from('matches')
        .select(`
          id,
          home_team:teams!matches_home_team_id_fkey(name, group_name),
          away_team:teams!matches_away_team_id_fkey(name, group_name)
        `)
        .in('id', topMatchIds)

      type JokerTeamRef = { name: string; group_name: string }
      const matchInfoById: Record<string, { homeTeam: string; awayTeam: string; group: string }> = {}
      for (const m of jokerMatches ?? []) {
        const home = m.home_team as JokerTeamRef | null
        const away = m.away_team as JokerTeamRef | null
        if (home && away) {
          matchInfoById[m.id] = { homeTeam: home.name, awayTeam: away.name, group: home.group_name }
        }
      }

      jokerStats = topMatchIds
        .filter((id) => matchInfoById[id])
        .map((id) => ({
          matchId: id,
          homeTeam: matchInfoById[id].homeTeam,
          awayTeam: matchInfoById[id].awayTeam,
          group: matchInfoById[id].group,
          count: jokerCountByMatch[id],
        }))
    }
  }

  // ── Bonus-vraag statistieken ─────────────────────────────────────────────
  const { data: bonusQuestions } = await supabase
    .from('bonus_questions')
    .select('id, question, type, unlock_date, correct_answer_set, correct_answer')
    .order('type')
    .order('unlock_date')

  const { data: bonusAnswers } = await supabase
    .from('bonus_answers')
    .select('question_id, answer')

  const answersByQuestion: Record<string, string[]> = {}
  for (const a of bonusAnswers ?? []) {
    if (!a.answer) continue
    answersByQuestion[a.question_id] ??= []
    answersByQuestion[a.question_id].push(a.answer)
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
    const topAnswers = Object.entries(countMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([answer, count]) => ({
        answer,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        is_correct: correctLower !== null && answer.toLowerCase() === correctLower,
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

  return (
    <StatsClient
      tournamentStarted={tournamentStarted}
      kampioenStats={kampioenStats}
      groupedMatches={groupedMatches}
      totalDeelnemers={totalDeelnemers ?? 0}
      accuracyStats={accuracyStats}
      bonusQuestionStats={bonusQuestionStats}
      topStandings={topStandings}
      jokerStats={jokerStats}
    />
  )
}
