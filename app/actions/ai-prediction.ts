'use server'

import { createClient } from '@/lib/supabase/server'

export type AiPrediction = {
  homeScore: number
  awayScore: number
  analyse: string
  sleutelspelerThuis: string
  sleutelspelerUit: string
  kansThuis: number
  kansGelijkspel: number
  kansUit: number
}

export type AiPredictionResult =
  | { ok: true; prediction: AiPrediction }
  | { ok: false; error: string }

export async function getMatchPrediction(matchId: string): Promise<AiPredictionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('match_ai_predictions')
    .select('home_score, away_score, match_analyse, sleutelspeler_thuis, sleutelspeler_uit, kans_thuis, kans_gelijkspel, kans_uit')
    .eq('match_id', matchId)
    .single()

  if (error || !data) {
    return { ok: false, error: 'Geen analyse beschikbaar voor deze wedstrijd.' }
  }

  return {
    ok: true,
    prediction: {
      homeScore:          data.home_score,
      awayScore:          data.away_score,
      analyse:            data.match_analyse,
      sleutelspelerThuis: data.sleutelspeler_thuis,
      sleutelspelerUit:   data.sleutelspeler_uit,
      kansThuis:          data.kans_thuis,
      kansGelijkspel:     data.kans_gelijkspel,
      kansUit:            data.kans_uit,
    },
  }
}
