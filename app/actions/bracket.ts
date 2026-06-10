'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isTournamentLocked } from '@/lib/tournament-lock'

export type BracketResult = { ok: true } | { ok: false; error: string }

const LOCKED_ERROR = 'Het WK is begonnen — de bracket is vergrendeld.'

export async function saveBracketPick(slot: number, teamId: string): Promise<BracketResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  if (await isTournamentLocked(supabase)) return { ok: false, error: LOCKED_ERROR }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('bracket_predictions')
    .upsert(
      { user_id: user.id, slot, predicted_team_id: teamId },
      { onConflict: 'user_id,slot' }
    )

  if (error) return { ok: false, error: 'Opslaan mislukt.' }
  revalidatePath('/knockout')
  return { ok: true }
}

export async function clearBracketSlots(slots: number[]): Promise<BracketResult> {
  if (slots.length === 0) return { ok: true }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  if (await isTournamentLocked(supabase)) return { ok: false, error: LOCKED_ERROR }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('bracket_predictions')
    .delete()
    .eq('user_id', user.id)
    .in('slot', slots)

  revalidatePath('/knockout')
  return { ok: true }
}
