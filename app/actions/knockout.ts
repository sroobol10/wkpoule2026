'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isTournamentLocked } from '@/lib/tournament-lock'

export type KnockoutSaveResult = { ok: true } | { ok: false; error: string }

export async function saveKnockoutPrediction(
  matchId: string,
  predictedWinnerId: string
): Promise<KnockoutSaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  // KO-voorspellingen (wie gaat door t/m de finale) horen bij de
  // pre-tournament invul-ronde en gaan dicht bij de eerste aftrap
  if (await isTournamentLocked(supabase)) {
    return { ok: false, error: 'Het WK is begonnen — voorspellingen zijn vergrendeld.' }
  }

  // Controleer of wedstrijd nog niet begonnen is
  const { data: match } = await supabase
    .from('matches')
    .select('kickoff_at')
    .eq('id', matchId)
    .single()

  if (!match) return { ok: false, error: 'Wedstrijd niet gevonden.' }
  if (match.kickoff_at <= new Date().toISOString()) {
    return { ok: false, error: 'Wedstrijd is al begonnen.' }
  }

  const { error } = await supabase
    .from('knockout_predictions')
    .upsert(
      { user_id: user.id, match_id: matchId, predicted_winner_id: predictedWinnerId },
      { onConflict: 'user_id,match_id' }
    )

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/knockout')
  return { ok: true }
}
