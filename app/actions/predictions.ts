'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function savePredictions(
  predictions: { matchId: string; home: number; away: number }[]
): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  // Filter op wedstrijden die nog niet begonnen zijn
  const matchIds = predictions.map((p) => p.matchId)
  const { data: matches } = await supabase
    .from('matches')
    .select('id, kickoff_at')
    .in('id', matchIds)

  const now = new Date().toISOString()
  const openIds = new Set(
    (matches ?? []).filter((m) => m.kickoff_at > now).map((m) => m.id)
  )

  const rows = predictions
    .filter((p) => openIds.has(p.matchId))
    .map((p) => ({
      user_id:        user.id,
      match_id:       p.matchId,
      predicted_home: p.home,
      predicted_away: p.away,
    }))

  if (rows.length === 0) return { ok: false, error: 'Alle wedstrijden zijn al begonnen.' }

  const { error } = await supabase
    .from('predictions')
    .upsert(rows, { onConflict: 'user_id,match_id' })

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/voorspellingen')
  return { ok: true }
}

export async function saveGroupAdvancement(
  selections: { teamId: string; position: number }[]
): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  // Verwijder altijd alle bestaande pos-3 entries — de "beste 8 nummers 3"
  // wordt bij elke save volledig herberekend, en stale entries veroorzaken
  // pos3Count > 8 waardoor de bracket-check faalt.
  const hasThirds = selections.some((s) => s.position === 3)
  if (hasThirds) {
    await supabase
      .from('group_advancement')
      .delete()
      .eq('user_id', user.id)
      .eq('predicted_position', 3)
  }

  // Verwijder pos-1/pos-2 picks voor de teams die nu worden aangeboden
  const nonThirds = selections.filter((s) => s.position !== 3)
  if (nonThirds.length > 0) {
    await supabase
      .from('group_advancement')
      .delete()
      .eq('user_id', user.id)
      .in('team_id', nonThirds.map((s) => s.teamId))
  }

  if (selections.length === 0) return { ok: true }

  const { error } = await supabase.from('group_advancement').insert(
    selections.map((s) => ({
      user_id:             user.id,
      team_id:             s.teamId,
      predicted_position:  s.position,
    }))
  )

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/voorspellingen')
  return { ok: true }
}
