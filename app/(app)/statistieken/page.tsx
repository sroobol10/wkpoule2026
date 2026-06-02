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
  // Gebaseerd op bracket-picks: slot 104 = Finale → dat is de voorspelde kampioen
  let kampioenStats: KampioenverdeligEntry[] = []

  if (tournamentStarted) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: finalePicks } = await (supabase as any)
      .from('bracket_predictions')
      .select('predicted_team_id')
      .eq('slot', 104)  // slot 104 = Finale

    if (finalePicks && finalePicks.length > 0) {
      const teamIds = (finalePicks as { predicted_team_id: string }[]).map((p) => p.predicted_team_id)

      // Haal teamnamen en vlaggen op
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name, flag_url')
        .in('id', teamIds)

      const teamById: Record<string, { name: string; flag_url: string }> = {}
      for (const t of teams ?? []) teamById[t.id] = t

      // Tel per team
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
