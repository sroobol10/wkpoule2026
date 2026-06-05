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
        .select('id, username, avatar_url')
        .in('id', scores.map((s) => s.user_id))

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, { username: p.username, avatar_url: p.avatar_url }])
      )
      return {
        pouleId: poule.id,
        pouleName: poule.name,
        isGeneral: poule.is_general,
        entries: scores.map((s) => ({
          userId: s.user_id,
          username: profileMap[s.user_id]?.username ?? 'Onbekend',
          avatarUrl: profileMap[s.user_id]?.avatar_url ?? null,
          totalPts: s.total_pts,
          rankChange: s.rank_change,
        })),
      }
    })
  )

  // ── Per-groep mini-competitie ─────────────────────────────────────────────
  // Haal alle groepswedstrijden op met groepsnaam
  const { data: allGroupMatches } = await supabase
    .from('matches')
    .select('id, home_team:teams!matches_home_team_id_fkey(group_name)')
    .eq('stage', 'group')

  const matchToGroup: Record<string, string> = {}
  for (const m of allGroupMatches ?? []) {
    const g = (m.home_team as { group_name: string } | null)?.group_name
    if (g) matchToGroup[m.id] = g
  }

  // Haal alle voorspellingen op voor alle deelnemers in de poules
  const allUserIds = [...new Set(pouleStandings.flatMap((p) => p.entries.map((e) => e.userId)))]
  const groupMatchIds = Object.keys(matchToGroup)

  const { data: allPreds } = allUserIds.length > 0 && groupMatchIds.length > 0
    ? await supabase
        .from('predictions')
        .select('user_id, match_id, points_awarded')
        .in('user_id', allUserIds)
        .in('match_id', groupMatchIds)
        .not('points_awarded', 'is', null)
    : { data: [] }

  // Aggregeer: userId → group → pts
  const userGroupPts: Record<string, Record<string, number>> = {}
  for (const p of allPreds ?? []) {
    const group = matchToGroup[p.match_id]
    if (!group) continue
    if (!userGroupPts[p.user_id]) userGroupPts[p.user_id] = {}
    userGroupPts[p.user_id][group] = (userGroupPts[p.user_id][group] ?? 0) + (p.points_awarded ?? 0)
  }

  // Bouw per-poule, per-groep ranglijst
  type GroupEntry = { userId: string; username: string; avatarUrl: string | null; pts: number }
  const GROUPS_LIST = ['A','B','C','D','E','F','G','H','I','J','K','L']

  const pouleGroupStandings = pouleStandings.map((poule) => {
    const byGroup: Record<string, GroupEntry[]> = {}
    for (const group of GROUPS_LIST) {
      byGroup[group] = poule.entries
        .map((e) => ({ userId: e.userId, username: e.username, avatarUrl: e.avatarUrl, pts: userGroupPts[e.userId]?.[group] ?? 0 }))
        .sort((a, b) => b.pts - a.pts)
    }
    return { pouleId: poule.pouleId, byGroup }
  })

  return (
    <PredictionsClient
      matches={matches ?? []}
      predMap={predMap}
      advancement={advancement ?? []}
      teams={teams ?? []}
      jokerMatchIds={jokerMatchIds}
      pouleStandings={pouleStandings}
      pouleGroupStandings={pouleGroupStandings}
      currentUserId={user.id}
    />
  )
}
