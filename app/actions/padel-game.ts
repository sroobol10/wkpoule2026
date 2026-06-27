'use server'

import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'

// Sla een mini-game-score op (alleen voor padelclub-leden, alleen je eigen score).
export async function submitPadelScore(game: string, score: number): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) return { ok: false }

  const safe = Math.max(0, Math.min(99999, Math.round(Number(score) || 0)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('padel_game_scores')
    .insert({ user_id: user.id, game, score: safe })

  return { ok: !error }
}
