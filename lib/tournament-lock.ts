import type { SupabaseClient } from '@supabase/supabase-js'
import { GROUP_STAGE_DEADLINE } from './constants'

// Vanaf de aftrap van de allereerste WK-wedstrijd gaat alles op slot:
// wedstrijdvoorspellingen, eindstanden, de bracket en pre-tournament
// bonusvragen. Jokers, dagelijkse bonusvragen en KO-winnaars hebben hun
// eigen deadline-logica en blijven open.
// De constante is leidend; de wedstrijdtabel dient als vangnet voor het
// geval kickoff-tijden ooit naar voren schuiven.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isTournamentLocked(supabase: SupabaseClient<any, any, any>): Promise<boolean> {
  if (new Date() >= GROUP_STAGE_DEADLINE) return true
  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .lte('kickoff_at', new Date().toISOString())
  return (count ?? 0) > 0
}
