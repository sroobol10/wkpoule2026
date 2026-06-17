import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import { getActivePlayerIds } from '@/lib/active-players'
import StatsClient, { type KampioenverdeligEntry, type BonusQuestionStat, type JokerStat, type JokerWinstEntry } from './stats-client'

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

  // ── Gestarte groepswedstrijden (basis voor joker-winst) ──────────────────
  const { data: startedMatches } = await supabase
    .from('matches')
    .select('id')
    .eq('stage', 'group')
    .lte('kickoff_at', new Date().toISOString())

  // Punten per voorspelling (voor joker-winst)
  const predPtsByUserMatch: Record<string, number | null> = {}
  if (startedMatches && startedMatches.length > 0) {
    const matchIds = startedMatches.map((m) => m.id)
    const { data: allPredictions } = await supabase
      .from('predictions')
      .select('user_id, match_id, points_awarded')
      .in('match_id', matchIds)
    for (const p of allPredictions ?? []) {
      if (memberIds.has(p.user_id)) predPtsByUserMatch[`${p.user_id}:${p.match_id}`] = p.points_awarded
    }
  }

  // ── Joker hotspots + rendement ───────────────────────────────────────────
  let jokerStats: JokerStat[] = []
  let jokerWinstRaw: { userId: string; extra: number; played: number }[] = []

  if (tournamentStarted) {
    const { data: allJokersRaw } = await supabase
      .from('jokers')
      .select('match_id, user_id')
    const allJokers = (allJokersRaw ?? []).filter((j) => memberIds.has(j.user_id))

    if (allJokers && allJokers.length > 0) {
      // Joker-winst per deelnemer: alleen jokers op wedstrijden waarvan de
      // punten al zijn toegekend. Een joker verdubbelt de basispunten, dus de
      // winst is de helft van het behaalde totaal op die wedstrijd.
      const decided = allJokers
        .map((j) => ({ userId: j.user_id, matchId: j.match_id, pts: predPtsByUserMatch[`${j.user_id}:${j.match_id}`] }))
        .filter((d): d is { userId: string; matchId: string; pts: number } => d.pts != null)

      const winstByUser: Record<string, { extra: number; played: number }> = {}
      for (const d of decided) {
        const u = (winstByUser[d.userId] ??= { extra: 0, played: 0 })
        u.extra += d.pts / 2
        u.played++
      }
      jokerWinstRaw = Object.entries(winstByUser)
        .map(([userId, v]) => ({ userId, extra: Math.round(v.extra), played: v.played }))
        .sort((a, b) => b.extra - a.extra || b.played - a.played)

      // Count per match
      const jokerCountByMatch: Record<string, number> = {}
      for (const j of allJokers) {
        jokerCountByMatch[j.match_id] = (jokerCountByMatch[j.match_id] ?? 0) + 1
      }

      // Top 8 match IDs
      const topMatchIds = Object.entries(jokerCountByMatch)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([id]) => id)

      // Wedstrijden waarop de huidige deelnemer zelf een joker heeft ingezet
      const myJokerMatchIds = new Set(
        allJokers.filter((j) => j.user_id === user.id).map((j) => j.match_id)
      )

      // Fetch match details (could be started or upcoming)
      const { data: jokerMatches } = await supabase
        .from('matches')
        .select(`
          id, kickoff_at, result_entered,
          home_team:teams!matches_home_team_id_fkey(name, group_name, flag_url),
          away_team:teams!matches_away_team_id_fkey(name, group_name, flag_url)
        `)
        .in('id', topMatchIds)

      type JokerTeamRef = { name: string; group_name: string; flag_url: string | null }
      const matchInfoById: Record<string, { homeTeam: string; awayTeam: string; homeFlag: string | null; awayFlag: string | null; group: string; played: boolean }> = {}
      for (const m of jokerMatches ?? []) {
        const home = m.home_team as JokerTeamRef | null
        const away = m.away_team as JokerTeamRef | null
        if (home && away) {
          matchInfoById[m.id] = {
            homeTeam: home.name,
            awayTeam: away.name,
            homeFlag: home.flag_url,
            awayFlag: away.flag_url,
            group: home.group_name,
            played: m.result_entered || new Date(m.kickoff_at) <= new Date(),
          }
        }
      }

      jokerStats = topMatchIds
        .filter((id) => matchInfoById[id])
        .map((id) => ({
          matchId: id,
          homeTeam: matchInfoById[id].homeTeam,
          awayTeam: matchInfoById[id].awayTeam,
          homeFlag: matchInfoById[id].homeFlag,
          awayFlag: matchInfoById[id].awayFlag,
          group: matchInfoById[id].group,
          played: matchInfoById[id].played,
          count: jokerCountByMatch[id],
          mine: myJokerMatchIds.has(id),
        }))
    }
  }

  // ── Joker-winst: ranglijst met profielen ─────────────────────────────────
  let jokerWinst: JokerWinstEntry[] = []
  if (tournamentStarted && jokerWinstRaw.length > 0) {
    const userIds = [...new Set(jokerWinstRaw.map((b) => b.userId))]
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds)
    const profileById: Record<string, { username: string; avatar_url: string | null }> = {}
    for (const p of profileRows ?? []) profileById[p.id] = p

    // Top-5, plus je eigen rij (met echte positie) als je daarbuiten valt
    const winstEntry = (b: typeof jokerWinstRaw[number], i: number): JokerWinstEntry => ({
      userId: b.userId,
      username: profileById[b.userId]?.username ?? '?',
      avatarUrl: profileById[b.userId]?.avatar_url ?? null,
      extra: b.extra,
      played: b.played,
      rank: i + 1,
    })
    jokerWinst = jokerWinstRaw.slice(0, 5).map(winstEntry)
    const ownIdx = jokerWinstRaw.findIndex((b) => b.userId === user.id)
    if (ownIdx >= 5) jokerWinst.push(winstEntry(jokerWinstRaw[ownIdx], ownIdx))
  }

  // ── Bonus-vraag statistieken ─────────────────────────────────────────────
  const { data: bonusQuestions } = await supabase
    .from('bonus_questions')
    .select('id, question, type, unlock_date, correct_answer_set, correct_answer')
    .order('type')
    .order('unlock_date')

  const { data: allBonusAnswers } = await supabase
    .from('bonus_answers')
    .select('user_id, question_id, answer')
  const bonusAnswers = (allBonusAnswers ?? []).filter((a) => memberIds.has(a.user_id))

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
    // Alle antwoorden, oplopend gesorteerd (numeriek waar mogelijk)
    const topAnswers = Object.entries(countMap)
      .sort(([a], [b]) => {
        const na = parseFloat(a)
        const nb = parseFloat(b)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        return a.localeCompare(b, 'nl', { sensitivity: 'base' })
      })
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

  // Vlaggen-map (landnaam → vlag) voor de antwoordverdeling
  const { data: allTeamsForFlags } = await supabase.from('teams').select('name, flag_url')
  const teamFlags: Record<string, string> = {}
  for (const t of allTeamsForFlags ?? []) if (t.flag_url) teamFlags[t.name] = t.flag_url

  return (
    <StatsClient
      tournamentStarted={tournamentStarted}
      currentUserId={user.id}
      leagues={privePoules.length > 1 ? privePoules.map(({ id, name }) => ({ id, name })) : []}
      selectedLeague={selectedLeague}
      kampioenStats={kampioenStats}
      totalDeelnemers={totalDeelnemers ?? 0}
      bonusQuestionStats={bonusQuestionStats}
      jokerStats={jokerStats}
      jokerWinst={jokerWinst}
      teamFlags={teamFlags}
    />
  )
}
