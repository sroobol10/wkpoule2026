import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import StatsClient, { type KampioenverdeligEntry, type MatchStat, type ScoreDist } from './stats-client'

export default async function StatistiekenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Toernooi "gestart" zodra er minimaal één groepswedstrijd gespeeld is
  const { count: playedCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('stage', 'group')
    .eq('result_entered', true)
  const tournamentStarted = (playedCount ?? 0) > 0 || new Date() >= GROUP_STAGE_DEADLINE

  // ── Totaal deelnemers (op basis van algemene poule) ──────────────────────
  const { count: totalDeelnemers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  // ── WK-kampioen verdeling ────────────────────────────────────────────────
  let kampioenStats: KampioenverdeligEntry[] = []

  if (tournamentStarted) {
    // Zoek de kampioen-bonusvraag op tekst
    const { data: kampioenQuestion } = await supabase
      .from('bonus_questions')
      .select('id')
      .ilike('question', '%kampioen%')
      .eq('type', 'pre_tournament')
      .limit(1)
      .single()

    if (kampioenQuestion) {
      const { data: answers } = await supabase
        .from('bonus_answers')
        .select('answer')
        .eq('question_id', kampioenQuestion.id)

      if (answers) {
        // Groepeer antwoorden en tel
        const counts: Record<string, number> = {}
        for (const { answer } of answers) {
          const normalized = answer.trim()
          if (normalized) counts[normalized] = (counts[normalized] ?? 0) + 1
        }

        // Haal vlaggen op voor de landen
        const countryNames = Object.keys(counts)
        const { data: teams } = countryNames.length > 0
          ? await supabase
              .from('teams')
              .select('name, flag_url')
              .in('name', countryNames)
          : { data: [] }

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
  }

  // ── Uitslagverdeling per wedstrijd (alleen gestarte wedstrijden) ──────────
  const { data: startedMatches } = await supabase
    .from('matches')
    .select(`
      id, match_number, kickoff_at, stage,
      home_team:teams!matches_home_team_id_fkey(name, flag_url, group_name),
      away_team:teams!matches_away_team_id_fkey(name, flag_url, group_name)
    `)
    .eq('stage', 'group')
    .eq('result_entered', true)
    .order('kickoff_at')

  type TeamRef = { name: string; flag_url: string; group_name: string }

  const groupedMatches: Record<string, MatchStat[]> = {}

  if (startedMatches && startedMatches.length > 0) {
    const matchIds = startedMatches.map((m) => m.id)

    // Haal alle voorspellingen op voor gestarte wedstrijden (geaggregeerd)
    const { data: predictions } = await supabase
      .from('predictions')
      .select('match_id, predicted_home, predicted_away')
      .in('match_id', matchIds)

    // Groepeer per wedstrijd
    type PredEntry = { match_id: string; predicted_home: number; predicted_away: number }
    const predsByMatch: Record<string, PredEntry[]> = {}
    for (const p of predictions ?? []) {
      predsByMatch[p.match_id] ??= []
      predsByMatch[p.match_id].push(p)
    }

    for (const m of startedMatches) {
      const homeTeam = m.home_team as TeamRef | null
      const awayTeam = m.away_team as TeamRef | null
      if (!homeTeam || !awayTeam) continue

      const group = homeTeam.group_name
      const matchPreds = predsByMatch[m.id] ?? []

      // Groepeer voorspellingen per uitslag
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

      const stat: MatchStat = {
        id: m.id,
        match_number: m.match_number ?? 0,
        kickoff_at: m.kickoff_at,
        home_team: homeTeam.name,
        away_team: awayTeam.name,
        home_flag: homeTeam.flag_url,
        away_flag: awayTeam.flag_url,
        total_predictions: matchPreds.length,
        distribution,
      }

      groupedMatches[group] ??= []
      groupedMatches[group].push(stat)
    }
  }

  return (
    <StatsClient
      tournamentStarted={tournamentStarted}
      kampioenStats={kampioenStats}
      groupedMatches={groupedMatches}
      totalDeelnemers={totalDeelnemers ?? 0}
    />
  )
}
