'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatInAmsterdam } from '@/lib/format'

type JokerResult = { ok: true } | { ok: false; error: string }

export async function toggleJoker(matchId: string): Promise<JokerResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const { data: match } = await supabase
    .from('matches')
    .select('kickoff_at')
    .eq('id', matchId)
    .single()

  if (!match) return { ok: false, error: 'Wedstrijd niet gevonden.' }
  if (new Date(match.kickoff_at) <= new Date()) {
    return { ok: false, error: 'Wedstrijd is al begonnen.' }
  }

  const jokerDate = formatInAmsterdam(match.kickoff_at, 'yyyy-MM-dd')

  if (jokerDate === '2026-06-11') {
    return { ok: false, error: 'Op 11 juni kan geen joker worden ingezet.' }
  }

  const { data: existing } = await supabase
    .from('jokers')
    .select('id, match_id')
    .eq('user_id', user.id)
    .eq('joker_date', jokerDate)
    .maybeSingle()

  if (existing?.match_id === matchId) {
    // Zelfde wedstrijd: joker uitzetten
    const { error } = await supabase.from('jokers').delete().eq('id', existing.id)
    if (error) return { ok: false, error: 'Joker verwijderen mislukt.' }
  } else if (existing) {
    // Andere wedstrijd die dag: joker verplaatsen
    const { error } = await supabase.from('jokers').update({ match_id: matchId }).eq('id', existing.id)
    if (error) return { ok: false, error: 'Joker verplaatsen mislukt.' }
  } else {
    // Nieuwe joker
    const { error } = await supabase
      .from('jokers')
      .insert({ user_id: user.id, match_id: matchId, joker_date: jokerDate })
    if (error) return { ok: false, error: 'Joker plaatsen mislukt.' }
  }

  revalidatePath('/voorspellingen')
  return { ok: true }
}
