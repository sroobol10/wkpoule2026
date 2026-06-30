// Winnaar/verliezer van een KO-wedstrijd. Bij gelijke stand beslist
// shootout_winner_id (strafschoppen); anders het hoogste aantal doelpunten.
export type KoScoreFields = {
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  shootout_winner_id?: string | null
}

export function koWinnerId(m: KoScoreFields): string | null {
  if (m.home_score == null || m.away_score == null) return null
  if (m.home_score > m.away_score) return m.home_team_id
  if (m.away_score > m.home_score) return m.away_team_id
  return m.shootout_winner_id ?? null // gelijkspel → strafschoppen-winnaar
}

export function koLoserId(m: KoScoreFields): string | null {
  const w = koWinnerId(m)
  if (!w) return null
  return w === m.home_team_id ? m.away_team_id : m.home_team_id
}
