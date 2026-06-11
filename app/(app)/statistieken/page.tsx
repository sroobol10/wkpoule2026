import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import { getActivePlayerIds } from '@/lib/active-players'
import StatsClient, { type KampioenverdeligEntry, type MatchStat, type ScoreDist, type AccuracyStats, type BonusQuestionStat, type JokerStat, type JokerRendement, type JokerBestEntry, type VerloopData, type DayPointsEntry } from './stats-client'

// '2026-06-12' → '12/6'
const dayLabel = (d: string) => `${parseInt(d.slice(8), 10)}/${parseInt(d.slice(5, 7), 10)}`

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
  // Alleen wie alle groepswedstrijden heeft voorspeld doet mee
  const totalDeelnemers = (await getActivePlayerIds(supabase)).size

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
  // Vanaf de aftrap is de verdeling zichtbaar; statistieken die de uitslag
  // nodig hebben (nauwkeurigheid, heatmap) filteren verderop op home_score.
  const { data: startedMatches } = await supabase
    .from('matches')
    .select(`
      id, match_number, kickoff_at, stage,
      home_score, away_score,
      home_team:teams!matches_home_team_id_fkey(name, flag_url, group_name),
      away_team:teams!matches_away_team_id_fkey(name, flag_url, group_name)
    `)
    .eq('stage', 'group')
    .lte('kickoff_at', new Date().toISOString())
    .order('kickoff_at')

  type TeamRef = { name: string; flag_url: string; group_name: string }

  const groupedMatches: Record<string, MatchStat[]> = {}
  let accuracyStats: AccuracyStats | null = null

  // Voor joker-rendement
  const predPtsByUserMatch: Record<string, number | null> = {}
  const matchInfoForJoker: Record<string, { label: string; group: string }> = {}

  // Voor de grafieken: klassementverloop, heatmap en punten per speeldag
  let verloopRaw: { userId: string; isCurrentUser: boolean; values: number[] }[] = []
  let verloopDays: string[] = []
  let verloopData: VerloopData | null = null
  let dayPointsData: DayPointsEntry[] = []

  if (startedMatches && startedMatches.length > 0) {
    const matchIds = startedMatches.map((m) => m.id)

    const { data: predictions } = await supabase
      .from('predictions')
      .select('user_id, match_id, predicted_home, predicted_away, points_awarded')
      .in('match_id', matchIds)

    type PredEntry = { user_id: string; match_id: string; predicted_home: number; predicted_away: number; points_awarded: number | null }
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

    // Punten per voorspelling (voor joker-rendement)
    for (const p of predictions ?? []) {
      predPtsByUserMatch[`${p.user_id}:${p.match_id}`] = p.points_awarded
    }

    // ── Grafiekdata: speeldag per wedstrijd (CEST) ───────────────────────────
    const dayByMatch: Record<string, string> = {}
    for (const m of startedMatches) {
      const cest = new Date(new Date(m.kickoff_at).getTime() + 2 * 60 * 60 * 1000)
      dayByMatch[m.id] = cest.toISOString().slice(0, 10)
    }
    verloopDays = [...new Set(Object.values(dayByMatch))].sort()

    // Punten per speeldag (poule-breed) + cumulatief verloop per deelnemer
    const ptsByDay: Record<string, number> = {}
    const ptsByUserDay: Record<string, Record<string, number>> = {}
    for (const p of predictions ?? []) {
      const day = dayByMatch[p.match_id]
      if (!day || p.points_awarded == null) continue
      ptsByDay[day] = (ptsByDay[day] ?? 0) + p.points_awarded
      ;(ptsByUserDay[p.user_id] ??= {})[day] = (ptsByUserDay[p.user_id][day] ?? 0) + p.points_awarded
    }
    dayPointsData = verloopDays.map((day) => ({ day: dayLabel(day), pts: ptsByDay[day] ?? 0 }))

    const totals = Object.entries(ptsByUserDay)
      .map(([uid, byDay]) => [uid, Object.values(byDay).reduce((a, b) => a + b, 0)] as const)
      .sort((a, b) => b[1] - a[1])
    const chartIds = totals.slice(0, 5).map(([uid]) => uid)
    if (ptsByUserDay[user.id] && !chartIds.includes(user.id)) chartIds.push(user.id)
    verloopRaw = chartIds.map((uid) => {
      let cum = 0
      return {
        userId: uid,
        isCurrentUser: uid === user.id,
        values: verloopDays.map((d) => (cum += ptsByUserDay[uid][d] ?? 0)),
      }
    })

    for (const m of startedMatches) {
      const homeTeam = m.home_team as TeamRef | null
      const awayTeam = m.away_team as TeamRef | null
      if (!homeTeam || !awayTeam) continue

      matchInfoForJoker[m.id] = { label: `${homeTeam.name} – ${awayTeam.name}`, group: homeTeam.group_name }

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

  // ── Joker hotspots + rendement ───────────────────────────────────────────
  let jokerStats: JokerStat[] = []
  let jokerRendement: JokerRendement | null = null
  let bestJokersRaw: { userId: string; matchId: string; pts: number }[] = []

  if (tournamentStarted) {
    const { data: allJokers } = await supabase
      .from('jokers')
      .select('match_id, user_id')

    if (allJokers && allJokers.length > 0) {
      // Rendement: alleen jokers op wedstrijden waarvan de punten al zijn toegekend
      const decided = allJokers
        .map((j) => ({ userId: j.user_id, matchId: j.match_id, pts: predPtsByUserMatch[`${j.user_id}:${j.match_id}`] }))
        .filter((d): d is { userId: string; matchId: string; pts: number } => d.pts != null)

      if (decided.length > 0) {
        const cashed = decided.filter((d) => d.pts > 0)
        // Joker verdubbelt de basispunten: de "winst" van de joker is de helft van het totaal
        const extraTotal = decided.reduce((s, d) => s + d.pts / 2, 0)
        bestJokersRaw = [...decided].sort((a, b) => b.pts - a.pts).filter((d) => d.pts > 0).slice(0, 5)

        jokerRendement = {
          total: decided.length,
          cashed: cashed.length,
          cashedPct: Math.round((cashed.length / decided.length) * 100),
          avgExtra: Math.round((extraTotal / decided.length) * 10) / 10,
          totalExtra: Math.round(extraTotal),
          best: [], // wordt hieronder gevuld zodra profielen bekend zijn
        }
      }
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

  // ── Joker-rendement + verloop: ranglijsten met profielen ─────────────────
  if (tournamentStarted && (bestJokersRaw.length > 0 || verloopRaw.length > 0)) {
    const userIds = [...new Set([
      ...bestJokersRaw.map((b) => b.userId),
      ...verloopRaw.map((s) => s.userId),
    ])]

    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds)

      const profileById: Record<string, { username: string; avatar_url: string | null }> = {}
      for (const p of profileRows ?? []) profileById[p.id] = p

      if (verloopRaw.length > 0 && verloopDays.length >= 2) {
        verloopData = {
          days: verloopDays.map(dayLabel),
          series: verloopRaw.map((s) => ({
            userId: s.userId,
            username: profileById[s.userId]?.username ?? '?',
            isCurrentUser: s.isCurrentUser,
            values: s.values,
          })),
        }
      }

      if (jokerRendement) {
        jokerRendement.best = bestJokersRaw
          .filter((b) => matchInfoForJoker[b.matchId])
          .map((b): JokerBestEntry => ({
            userId: b.userId,
            username: profileById[b.userId]?.username ?? '?',
            avatarUrl: profileById[b.userId]?.avatar_url ?? null,
            match: matchInfoForJoker[b.matchId].label,
            group: matchInfoForJoker[b.matchId].group,
            pts: b.pts,
          }))
      }
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
      jokerStats={jokerStats}
      jokerRendement={jokerRendement}
      verloop={verloopData}
      dayPoints={dayPointsData}
    />
  )
}
