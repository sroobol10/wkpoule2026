import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePlayerIds } from '@/lib/active-players'
import { sortGroupStandings, type TeamStat } from '@/lib/group-standings'
import PredictionsClient, { type MatchDist, type GroupPickDist } from './predictions-client'

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

  // Alleen deelnemers die alle groepswedstrijden hebben voorspeld doen mee
  const activeIds = await getActivePlayerIds(supabase)

  const pouleStandings = await Promise.all(
    userPoules.map(async (poule) => {
      const { data: allScores } = await supabase
        .from('poule_scores')
        .select('user_id, total_pts, rank_change')
        .eq('poule_id', poule.id)
        .order('total_pts', { ascending: false })
      const scores = (allScores ?? []).filter((s) => activeIds.has(s.user_id))

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

  // Haal álle groepsvoorspellingen op (gepagineerd: 62 deelnemers × 72
  // wedstrijden overschrijdt de standaard 1000-rijenlimiet van PostgREST)
  const allUserIds = new Set(pouleStandings.flatMap((p) => p.entries.map((e) => e.userId)))
  type PredRow = { user_id: string; match_id: string; predicted_home: number; predicted_away: number; points_awarded: number | null }
  const allPreds: PredRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from('predictions')
      .select('user_id, match_id, predicted_home, predicted_away, points_awarded')
      .range(from, from + PAGE - 1)
    allPreds.push(...((page ?? []) as PredRow[]))
    if (!page || page.length < PAGE) break
  }

  // Aggregeer: userId → group → pts (voor de mini-competitie)
  const userGroupPts: Record<string, Record<string, number>> = {}
  for (const p of allPreds) {
    if (p.points_awarded == null || !allUserIds.has(p.user_id)) continue
    const group = matchToGroup[p.match_id]
    if (!group) continue
    if (!userGroupPts[p.user_id]) userGroupPts[p.user_id] = {}
    userGroupPts[p.user_id][group] = (userGroupPts[p.user_id][group] ?? 0) + (p.points_awarded ?? 0)
  }

  // ── Uitslagverdeling per wedstrijd ────────────────────────────────────────
  // Geteld over de actieve leden van je eigen league(s); activeIds is eerder
  // in deze functie al opgehaald voor de mini-klassementen
  const privePouleIds = userPoules.filter((p) => !p.is_general).map((p) => p.id)
  let distMemberIds = activeIds
  if (privePouleIds.length > 0) {
    const { data: leagueMembers } = await supabase
      .from('poule_members')
      .select('user_id')
      .in('poule_id', privePouleIds)
    const leagueSet = new Set((leagueMembers ?? []).map((m) => m.user_id))
    distMemberIds = new Set([...activeIds].filter((uid) => leagueSet.has(uid)))
  }

  const distCounts: Record<string, Record<string, number>> = {}
  for (const p of allPreds) {
    if (!distMemberIds.has(p.user_id) || !matchToGroup[p.match_id]) continue
    const key = `${p.predicted_home}-${p.predicted_away}`
    ;(distCounts[p.match_id] ??= {})[key] = (distCounts[p.match_id][key] ?? 0) + 1
  }
  // ── Joker-verdeling per wedstrijd ─────────────────────────────────────────
  // Hoeveel (andere) leden van je league zetten op deze wedstrijd ook een joker?
  // Geteld over dezelfde actieve league-leden als de uitslagverdeling.
  type JokerRow = { user_id: string; match_id: string }
  const allJokers: JokerRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from('jokers')
      .select('user_id, match_id')
      .range(from, from + 999)
    allJokers.push(...((page ?? []) as JokerRow[]))
    if (!page || page.length < 1000) break
  }
  const jokerCountByMatch: Record<string, number> = {}
  for (const j of allJokers) {
    if (!distMemberIds.has(j.user_id)) continue
    jokerCountByMatch[j.match_id] = (jokerCountByMatch[j.match_id] ?? 0) + 1
  }

  const distByMatch: Record<string, MatchDist> = {}
  for (const [matchId, counts] of Object.entries(distCounts)) {
    const scores = Object.entries(counts)
      .map(([key, count]) => {
        const [h, a] = key.split('-').map(Number)
        return { h, a, count }
      })
      .sort((x, y) => y.count - x.count)
    distByMatch[matchId] = { total: scores.reduce((s, d) => s + d.count, 0), scores }
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

  // ── Verdeling voorspelde eindstand per groep ──────────────────────────────
  // Per groep, per positie (1-4): welke landen voorspelden de league-leden daar,
  // en hoe vaak. Gebruikt voor de "Wie koos wat"-tabel zodra een groep is
  // afgerond. Geteld over dezelfde actieve league-leden als de uitslagverdeling.
  const teamNameById: Record<string, string> = {}
  for (const t of teams ?? []) teamNameById[t.id] = t.name

  type GMatch = { home: string; away: string; group: string }
  const groupMatchById: Record<string, GMatch> = {}
  for (const m of matches ?? []) {
    const ht = m.home_team as { id: string; group_name: string } | null
    const at = m.away_team as { id: string; group_name: string } | null
    if (ht && at) groupMatchById[m.id] = { home: ht.id, away: at.id, group: ht.group_name }
  }

  // userId → group → voorspelde uitslagen van die groep
  type UserGroupPred = { home: string; away: string; ph: number; pa: number }
  const predsByUserGroup: Record<string, Record<string, UserGroupPred[]>> = {}
  for (const p of allPreds) {
    if (!distMemberIds.has(p.user_id)) continue
    const gm = groupMatchById[p.match_id]
    if (!gm) continue
    ;(((predsByUserGroup[p.user_id] ??= {})[gm.group] ??= [])).push({
      home: gm.home, away: gm.away, ph: p.predicted_home, pa: p.predicted_away,
    })
  }

  const groupPickDist: Record<string, GroupPickDist> = {}
  for (const group of GROUPS_LIST) {
    const dist: Record<string, number>[] = [{}, {}, {}, {}]
    let voters = 0
    for (const byGroup of Object.values(predsByUserGroup)) {
      const preds = byGroup[group]
      if (!preds || preds.length < 6) continue
      const st: Record<string, TeamStat> = {}
      const h2h: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }[] = []
      for (const pr of preds) {
        st[pr.home] ??= { points: 0, gd: 0, gf: 0 }
        st[pr.away] ??= { points: 0, gd: 0, gf: 0 }
        h2h.push({ homeTeamId: pr.home, awayTeamId: pr.away, homeGoals: pr.ph, awayGoals: pr.pa })
        st[pr.home].gf += pr.ph; st[pr.home].gd += pr.ph - pr.pa
        st[pr.away].gf += pr.pa; st[pr.away].gd += pr.pa - pr.ph
        if (pr.ph > pr.pa) st[pr.home].points += 3
        else if (pr.ph < pr.pa) st[pr.away].points += 3
        else { st[pr.home].points += 1; st[pr.away].points += 1 }
      }
      const sorted = sortGroupStandings(Object.entries(st) as [string, TeamStat][], h2h, teamNameById)
      if (sorted.length < 4) continue
      voters++
      sorted.slice(0, 4).forEach(([teamId], i) => { dist[i][teamId] = (dist[i][teamId] ?? 0) + 1 })
    }
    groupPickDist[group] = {
      totalVoters: voters,
      positions: dist.map((d) =>
        Object.entries(d).map(([teamId, count]) => ({ teamId, count })).sort((a, b) => b.count - a.count)
      ),
    }
  }

  return (
    <PredictionsClient
      matches={matches ?? []}
      predMap={predMap}
      advancement={advancement ?? []}
      teams={teams ?? []}
      jokerMatchIds={jokerMatchIds}
      pouleStandings={pouleStandings}
      pouleGroupStandings={pouleGroupStandings}
      distByMatch={distByMatch}
      jokerCountByMatch={jokerCountByMatch}
      groupPickDist={groupPickDist}
      currentUserId={user.id}
    />
  )
}
