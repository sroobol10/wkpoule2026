import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PredictionsClient from './predictions-client'

export default async function VoorspellingenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Alle groepswedstrijden met team-info
  const { data: matches } = await supabase
    .from('matches')
    .select(`
      id, kickoff_at, stage, match_number,
      home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
      away_team:teams!matches_away_team_id_fkey(id, name, flag_url)
    `)
    .eq('stage', 'group')
    .order('kickoff_at')
    .order('match_number')

  // Eigen voorspellingen
  const { data: predictions } = await supabase
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points_awarded')
    .eq('user_id', user.id)

  // Doorstroom-selecties
  const { data: advancement } = await supabase
    .from('group_advancement')
    .select('team_id, predicted_position')
    .eq('user_id', user.id)

  // Alle teams voor de doorstroom-modal
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, flag_url, group_name')
    .order('group_name')
    .order('name')

  const predMap = Object.fromEntries(
    (predictions ?? []).map((p) => [p.match_id, p])
  )

  return (
    <PredictionsClient
      matches={matches ?? []}
      predMap={predMap}
      advancement={advancement ?? []}
      teams={teams ?? []}
    />
  )
}
