'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type JokerResult = { ok: true } | { ok: false; error: string }

export async function toggleJoker(matchId: string): Promise<JokerResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const { data: match } = await supabase
    .from('matches')
    .select('kickoff_at, home_team:teams!matches_home_team_id_fkey(group_name)')
    .eq('id', matchId)
    .single()

  if (!match) return { ok: false, error: 'Wedstrijd niet gevonden.' }
  if (new Date(match.kickoff_at) <= new Date()) {
    return { ok: false, error: 'Wedstrijd is al begonnen.' }
  }

  const groupName = (match.home_team as { group_name: string } | null)?.group_name
  if (!groupName) return { ok: false, error: 'Groep niet gevonden.' }

  // Zodra er een wedstrijd in deze groep gespeeld is, mag de joker niet meer worden gewijzigd
  const { data: groupTeams } = await supabase
    .from('teams')
    .select('id')
    .eq('group_name', groupName)

  const teamIds = (groupTeams ?? []).map((t) => t.id)
  if (teamIds.length > 0) {
    const { data: playedMatch } = await supabase
      .from('matches')
      .select('id')
      .eq('stage', 'group')
      .eq('result_entered', true)
      .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
      .limit(1)
      .maybeSingle()

    if (playedMatch) {
      return { ok: false, error: `De joker voor groep ${groupName} kan niet meer worden gewijzigd — er is al een wedstrijd gespeeld.` }
    }
  }

  const { data: existing } = await supabase
    .from('jokers')
    .select('id, match_id')
    .eq('user_id', user.id)
    .eq('group_name', groupName)
    .maybeSingle()

  if (existing?.match_id === matchId) {
    // Zelfde wedstrijd: joker uitzetten
    const { error } = await supabase.from('jokers').delete().eq('id', existing.id)
    if (error) return { ok: false, error: 'Joker verwijderen mislukt.' }
  } else if (existing) {
    // Andere wedstrijd in dezelfde groep: joker verplaatsen
    const { error } = await supabase
      .from('jokers')
      .update({ match_id: matchId })
      .eq('id', existing.id)
    if (error) return { ok: false, error: 'Joker verplaatsen mislukt.' }
  } else {
    // Nieuwe joker voor deze groep
    const { error } = await supabase
      .from('jokers')
      .insert({ user_id: user.id, match_id: matchId, group_name: groupName })
    if (error) return { ok: false, error: 'Joker plaatsen mislukt.' }
  }

  revalidatePath('/voorspellingen')
  return { ok: true }
}
