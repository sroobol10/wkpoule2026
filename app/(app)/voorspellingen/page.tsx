import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PredictionsClient from './predictions-client'

export default async function VoorspellingenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: matches },
    { data: predictions },
    { data: advancement },
    { data: teams },
    { data: jokers },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select(`
        id, kickoff_at, stage, match_number, home_score, away_score, result_entered,
        home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
        away_team:teams!matches_away_team_id_fkey(id, name, flag_url, group_name)
      `)
      .eq('stage', 'group')
      .order('kickoff_at')
      .order('match_number'),
    supabase.from('predictions')
      .select('match_id, predicted_home, predicted_away, points_awarded')
      .eq('user_id', user.id),
    supabase.from('group_advancement')
      .select('team_id, predicted_position')
      .eq('user_id', user.id),
    supabase.from('teams')
      .select('id, name, flag_url, group_name')
      .order('group_name').order('name'),
    supabase.from('jokers')
      .select('match_id')
      .eq('user_id', user.id),
    supabase.from('poule_members')
      .select('poule_id, poules(id, name, is_general)')
      .eq('user_id', user.id),
  ])

  const predMap = Object.fromEntries(
    (predictions ?? []).map((p) => [p.match_id, p])
  )
  const jokerMatchIds = (jokers ?? []).map((j) => j.match_id)

  // ── Poule-standen voor de tussenstand onder de wedstrijden ────────────────
  type PouleRef = { id: string; name: string; is_general: boolean }
  const userPoules = (memberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter(Boolean) as PouleRef[]

  // Algemene poule eerst, dan de rest
  userPoules.sort((a, b) => {
    if (a.is_general && !b.is_general) return -1
    if (!a.is_general && b.is_general) return 1
    return a.name.localeCompare(b.name)
  })

  const pouleStandings = await Promise.all(
    userPoules.map(async (poule) => {
      const { data: scores } = await supabase
        .from('poule_scores')
        .select('user_id, total_pts, rank_change')
        .eq('poule_id', poule.id)
        .order('total_pts', { ascending: false })

      if (!scores?.length) return { pouleId: poule.id, pouleName: poule.name, isGeneral: poule.is_general, entries: [] }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', scores.map((s) => s.user_id))

      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.username]))
      return {
        pouleId: poule.id,
        pouleName: poule.name,
        isGeneral: poule.is_general,
        entries: scores.map((s) => ({
          userId: s.user_id,
          username: profileMap[s.user_id] ?? 'Onbekend',
          totalPts: s.total_pts,
          rankChange: s.rank_change,
        })),
      }
    })
  )

  return (
    <PredictionsClient
      matches={matches ?? []}
      predMap={predMap}
      advancement={advancement ?? []}
      teams={teams ?? []}
      jokerMatchIds={jokerMatchIds}
      pouleStandings={pouleStandings}
      currentUserId={user.id}
    />
  )
}
