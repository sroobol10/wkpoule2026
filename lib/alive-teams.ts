// Bepaalt welke teams nog actief (niet uitgeschakeld) zijn in het toernooi.
//
// De naïeve aanname "team is actief zolang het nog een niet-gespeelde wedstrijd
// heeft" klopt niet tussen de groepsfase en de knockout: zodra alle
// groepswedstrijden van een team zijn ingevoerd maar de KO-wedstrijden nog geen
// teams toegewezen hebben gekregen, heeft een doorgegaan team géén openstaande
// wedstrijd en werd het ten onrechte als uitgeschakeld getoond.
//
// Echte uitschakeling:
//  - Groepsfase compleet → teams die niet doorgaan (geen top-2, geen beste 8
//    nummer-3) zijn uitgeschakeld.
//  - Knockout → de verliezer (laagste score) van een gespeelde KO-wedstrijd is
//    uitgeschakeld.

import { sortGroupStandings, type TeamStat } from '@/lib/group-standings'
import { compareThirds, type ThirdEntry } from '@/lib/third-place'

export type AliveGroupMatch = {
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  result_entered: boolean
  home_team: { id: string; name: string; group_name: string } | null
  away_team: { id: string; name: string; group_name: string } | null
}

export type AliveKoMatch = {
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  result_entered: boolean
}

// Doorgegane teams uit een afgeronde groepsfase: 2 per groep + de 8 beste nummers 3.
function computeAdvancingTeamIds(groupMatches: AliveGroupMatch[]): Set<string> {
  const byGroup: Record<string, {
    st: Record<string, TeamStat>
    names: Record<string, string>
    h2h: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }[]
  }> = {}

  for (const m of groupMatches) {
    const ht = m.home_team, at = m.away_team
    if (!ht || !at || m.home_score == null || m.away_score == null) continue
    const group = ht.group_name
    const g = (byGroup[group] ??= { st: {}, names: {}, h2h: [] })
    g.names[ht.id] = ht.name; g.names[at.id] = at.name
    g.st[ht.id] ??= { points: 0, gd: 0, gf: 0 }
    g.st[at.id] ??= { points: 0, gd: 0, gf: 0 }
    const h = m.home_score, a = m.away_score
    g.h2h.push({ homeTeamId: ht.id, awayTeamId: at.id, homeGoals: h, awayGoals: a })
    g.st[ht.id].gf += h; g.st[ht.id].gd += h - a
    g.st[at.id].gf += a; g.st[at.id].gd += a - h
    if (h > a) g.st[ht.id].points += 3
    else if (h < a) g.st[at.id].points += 3
    else { g.st[ht.id].points += 1; g.st[at.id].points += 1 }
  }

  const advancing = new Set<string>()
  const thirds: ThirdEntry[] = []

  for (const [group, g] of Object.entries(byGroup)) {
    const sorted = sortGroupStandings(Object.entries(g.st) as [string, TeamStat][], g.h2h, g.names)
    // Top 2 gaan altijd door
    sorted.slice(0, 2).forEach(([id]) => advancing.add(id))
    // Nummer 3 dingt mee naar de beste-8-ranglijst
    const third = sorted[2]
    if (third) {
      const [id, st] = third
      thirds.push({ group, teamId: id, name: g.names[id], points: st.points, gd: st.gd, gf: st.gf })
    }
  }

  thirds.sort(compareThirds).slice(0, 8).forEach((t) => advancing.add(t.teamId))
  return advancing
}

export function computeAliveTeamIds(
  groupMatches: AliveGroupMatch[],
  koMatches: AliveKoMatch[],
): Set<string> {
  const allTeamIds = new Set<string>()
  for (const m of groupMatches) {
    if (m.home_team_id) allTeamIds.add(m.home_team_id)
    if (m.away_team_id) allTeamIds.add(m.away_team_id)
  }
  for (const m of koMatches) {
    if (m.home_team_id) allTeamIds.add(m.home_team_id)
    if (m.away_team_id) allTeamIds.add(m.away_team_id)
  }

  const eliminated = new Set<string>()

  // Verliezers van gespeelde KO-wedstrijden (winnaar = hoogste score)
  for (const m of koMatches) {
    if (!m.result_entered || m.home_score == null || m.away_score == null) continue
    if (!m.home_team_id || !m.away_team_id) continue
    if (m.home_score > m.away_score) eliminated.add(m.away_team_id)
    else if (m.away_score > m.home_score) eliminated.add(m.home_team_id)
  }

  // Pas zodra de hele groepsfase is gespeeld kunnen niet-doorgegane teams afvallen.
  const groupComplete = groupMatches.length > 0 && groupMatches.every((m) => m.result_entered)
  if (groupComplete) {
    const advancing = computeAdvancingTeamIds(groupMatches)
    for (const m of groupMatches) {
      for (const id of [m.home_team_id, m.away_team_id]) {
        if (id && !advancing.has(id)) eliminated.add(id)
      }
    }
  }

  const alive = new Set<string>()
  for (const id of allTeamIds) if (!eliminated.has(id)) alive.add(id)
  return alive
}
