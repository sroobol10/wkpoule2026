import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import KnockoutClient from './knockout-client'

const LIVE_STAGES = ['r32', 'r16', 'qf', 'sf', 'final']

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
    .select('match_number, stage, kickoff_at, home_team_id, away_team_id, home_score, away_score, result_entered')
    .order('kickoff_at', { ascending: true })
    .in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])

  // slot → werkelijke winnaar (voor weergave in de bracket)
  const actualWinners: Record<number, string> = {}
  for (const m of koMatches ?? []) {
    if (m.match_number && m.result_entered && m.home_score !== null && m.away_score !== null && m.home_team_id && m.away_team_id) {
      actualWinners[m.match_number] = m.home_score > m.away_score ? m.home_team_id : m.away_team_id
    }
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
    sf:          [...(teamsInStage['final']       ?? []), ...(teamsInStage['third_place'] ?? [])],
    final:       finalWinner ? [finalWinner] : [],
    third_place: thirdWinner ? [thirdWinner] : [],
  }

  return (
    <KnockoutClient
      matches={matches ?? []}
      liveTeams={liveTeams ?? []}
      livePredictions={livePredictions ?? []}
      allTeams={allTeams ?? []}
      advancement={advancement ?? []}
      bracketPicks={bracketPicks ?? []}
      groupStageStartsAt={firstGroupMatch?.kickoff_at ?? null}
      anyMatchPlayed={anyGroupMatchPlayed}
      actualWinners={actualWinners}
      advancedFromStage={advancedFromStage}
    />
  )
}
