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
  const [{ data: allTeams }, { data: advancement }, { data: firstGroupMatch }] =
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
    ])

  // Fetch bracket picks — handle gracefully if table doesn't exist yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracketPicks } = await (supabase as any)
    .from('bracket_predictions')
    .select('slot, predicted_team_id')
    .eq('user_id', user.id)

  return (
    <KnockoutClient
      matches={matches ?? []}
      liveTeams={liveTeams ?? []}
      livePredictions={livePredictions ?? []}
      allTeams={allTeams ?? []}
      advancement={advancement ?? []}
      bracketPicks={bracketPicks ?? []}
      groupStageStartsAt={firstGroupMatch?.kickoff_at ?? null}
    />
  )
}
