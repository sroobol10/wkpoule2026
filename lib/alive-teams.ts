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
//
// Uitzonderingen aan het einde van het toernooi:
//  - Halve finale (sf): de verliezer valt NIET af, want hij speelt nog de
//    troostfinale (wedstrijd om plek 3). Beide halvefinalisten blijven actief
//    tot de troostfinale gespeeld is.
//  - Troostfinale (third_place): zodra gespeeld zijn BEIDE ploegen klaar — de
//    nummer 3 én de nummer 4. Daarna blijven alleen de twee finalisten actief.
//  - Finale (final): beide finalisten (WK-winnaar én verliezend finalist) blijven
//    actief, ook nadat de finale gespeeld is. Overige landen zijn dan uitgegrijsd.

import { sortGroupStandings, type TeamStat } from '@/lib/group-standings'
import { compareThirds, type ThirdEntry } from '@/lib/third-place'
import { koLoserId } from '@/lib/ko-winner'

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
  stage?: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  result_entered: boolean
  shootout_winner_id?: string | null
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

// Alle team-id's die in de groeps- of KO-wedstrijden voorkomen.
function collectTeamIds(groupMatches: AliveGroupMatch[], koMatches: AliveKoMatch[]): Set<string> {
  const ids = new Set<string>()
  for (const m of groupMatches) {
    if (m.home_team_id) ids.add(m.home_team_id)
    if (m.away_team_id) ids.add(m.away_team_id)
  }
  for (const m of koMatches) {
    if (m.home_team_id) ids.add(m.home_team_id)
    if (m.away_team_id) ids.add(m.away_team_id)
  }
  return ids
}

// Teams die in een afgeronde groepsfase niet doorgingen (leeg zolang de groepsfase loopt).
function computeGroupEliminatedIds(groupMatches: AliveGroupMatch[]): Set<string> {
  const eliminated = new Set<string>()
  const groupComplete = groupMatches.length > 0 && groupMatches.every((m) => m.result_entered)
  if (!groupComplete) return eliminated
  const advancing = computeAdvancingTeamIds(groupMatches)
  for (const m of groupMatches) {
    for (const id of [m.home_team_id, m.away_team_id]) {
      if (id && !advancing.has(id)) eliminated.add(id)
    }
  }
  return eliminated
}

// De twee landen die (voorlopig) in de finale staan — ongeacht of die al gespeeld is.
function finalistIds(koMatches: AliveKoMatch[]): Set<string> {
  const ids = new Set<string>()
  for (const m of koMatches) {
    if (m.stage !== 'final') continue
    if (m.home_team_id) ids.add(m.home_team_id)
    if (m.away_team_id) ids.add(m.away_team_id)
  }
  return ids
}

export function computeAliveTeamIds(
  groupMatches: AliveGroupMatch[],
  koMatches: AliveKoMatch[],
): Set<string> {
  const allTeamIds = collectTeamIds(groupMatches, koMatches)
  const eliminated = new Set<string>()

  // Verliezers van gespeelde KO-wedstrijden (gelijkspel → strafschoppen-winnaar)
  for (const m of koMatches) {
    if (!m.result_entered || m.home_score == null || m.away_score == null) continue
    if (!m.home_team_id || !m.away_team_id) continue

    // Finale: beide finalisten blijven actief, ook na afloop. Nooit uitschakelen.
    if (m.stage === 'final') continue

    // Halve finale: de verliezer valt NIET af — hij speelt nog de troostfinale.
    if (m.stage === 'sf') continue

    // Troostfinale (plek 3/4): zodra gespeeld zijn BEIDE ploegen uitgeschakeld,
    // de winnaar (nr. 3) net zo goed als de verliezer (nr. 4). Daarna blijven
    // enkel de finalisten over.
    if (m.stage === 'third_place') {
      eliminated.add(m.home_team_id)
      eliminated.add(m.away_team_id)
      continue
    }

    const loser = koLoserId(m)
    if (loser) eliminated.add(loser)
  }

  // Pas zodra de hele groepsfase is gespeeld kunnen niet-doorgegane teams afvallen.
  for (const id of computeGroupEliminatedIds(groupMatches)) eliminated.add(id)

  const alive = new Set<string>()
  for (const id of allTeamIds) if (!eliminated.has(id)) alive.add(id)
  return alive
}

// Landen die nog wereldkampioen kunnen worden — óf het al zijn. In tegenstelling tot
// `computeAliveTeamIds` valt hier de verliezer van ELK gespeeld KO-duel af, inclusief de
// halve finale: wie de halve finale verliest speelt nog wel om plek 3, maar kan geen
// wereldkampioen meer worden. De twee finalisten blijven altijd kandidaat — ook de
// verliezend finalist na afloop — zodat op de kampioen-muur enkel de finaleteams
// (en anders alle nog levende kandidaten) kleur houden.
export function computeChampionContenderIds(
  groupMatches: AliveGroupMatch[],
  koMatches: AliveKoMatch[],
): Set<string> {
  const allTeamIds = collectTeamIds(groupMatches, koMatches)
  const eliminated = new Set<string>()

  // Verliezer van elk gespeeld KO-duel is geen kampioenskandidaat meer.
  for (const m of koMatches) {
    if (!m.result_entered || m.home_score == null || m.away_score == null) continue
    if (!m.home_team_id || !m.away_team_id) continue
    const loser = koLoserId(m)
    if (loser) eliminated.add(loser)
  }

  for (const id of computeGroupEliminatedIds(groupMatches)) eliminated.add(id)

  // Finalisten blijven altijd kandidaat (ook de verliezend finalist).
  for (const id of finalistIds(koMatches)) eliminated.delete(id)

  const contenders = new Set<string>()
  for (const id of allTeamIds) if (!eliminated.has(id)) contenders.add(id)
  return contenders
}
