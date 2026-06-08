// FIFA WK 2026 tiebreaker volgorde voor groepsstand:
// 1. Punten
// 2. Onderling resultaat (H2H punten)
// 3. H2H doelsaldo
// 4. H2H doelpunten voor
// 5. Overall doelsaldo
// 6. Overall doelpunten voor
// 7. FIFA-ranking
//
// Voor ranking van nummers-3 (cross-groep): doelsaldo eerst, geen H2H mogelijk.

import { FIFA_RANKING } from '@/lib/third-place'

export type TeamStat = { points: number; gd: number; gf: number }
type Entry = [teamId: string, stat: TeamStat]

type GroupMatch = {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
}

function computeH2H(
  tiedIds: string[],
  groupMatches: GroupMatch[],
): Record<string, TeamStat> {
  const h2h: Record<string, TeamStat> = {}
  for (const id of tiedIds) h2h[id] = { points: 0, gd: 0, gf: 0 }

  const tiedSet = new Set(tiedIds)
  for (const m of groupMatches) {
    if (!tiedSet.has(m.homeTeamId) || !tiedSet.has(m.awayTeamId)) continue
    const { homeGoals: h, awayGoals: a } = m
    h2h[m.homeTeamId].gf += h; h2h[m.homeTeamId].gd += h - a
    h2h[m.awayTeamId].gf += a; h2h[m.awayTeamId].gd += a - h
    if (h > a)      { h2h[m.homeTeamId].points += 3 }
    else if (h < a) { h2h[m.awayTeamId].points += 3 }
    else            { h2h[m.homeTeamId].points += 1; h2h[m.awayTeamId].points += 1 }
  }
  return h2h
}

export function sortGroupStandings(
  entries: Entry[],
  groupMatches: GroupMatch[],
  teamNames: Record<string, string>, // teamId → Dutch name
): Entry[] {
  // Groepeer teams op punten
  const byPoints = new Map<number, Entry[]>()
  for (const e of entries) {
    const pts = e[1].points
    if (!byPoints.has(pts)) byPoints.set(pts, [])
    byPoints.get(pts)!.push(e)
  }

  const result: Entry[] = []
  // Sorteer puntengroepen van hoog naar laag
  const pointGroups = [...byPoints.entries()].sort(([a], [b]) => b - a)

  for (const [, tied] of pointGroups) {
    if (tied.length === 1) {
      result.push(tied[0])
      continue
    }

    // Bereken H2H stats alleen tussen de gelijk-op-punten teams
    const tiedIds = tied.map(([id]) => id)
    const h2h = computeH2H(tiedIds, groupMatches)

    tied.sort(([idA, statA], [idB, statB]) => {
      const ha = h2h[idA], hb = h2h[idB]
      return (
        hb.points - ha.points ||          // H2H punten
        hb.gd     - ha.gd     ||          // H2H doelsaldo
        hb.gf     - ha.gf     ||          // H2H doelpunten voor
        statB.gd  - statA.gd  ||          // Overall doelsaldo
        statB.gf  - statA.gf  ||          // Overall doelpunten voor
        (FIFA_RANKING[teamNames[idA]] ?? 999) - (FIFA_RANKING[teamNames[idB]] ?? 999)
      )
    })

    result.push(...tied)
  }

  return result
}
