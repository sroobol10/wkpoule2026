'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveBonusAnswer(
  questionId: string,
  answer: string
): Promise<SaveResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const { data: question } = await supabase
    .from('bonus_questions')
    .select('unlock_date, type')
    .eq('id', questionId)
    .single()

  if (!question) return { ok: false, error: 'Vraag niet gevonden.' }

  // Pre-tournament vragen gaan op slot zodra de eerste wedstrijd gespeeld is
  if (question.type === 'pre_tournament') {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('stage', 'group')
      .eq('result_entered', true)
    if ((count ?? 0) > 0) {
      return { ok: false, error: 'De deadline voor pre-tournament vragen is verstreken.' }
    }
  }

  if (question.unlock_date) {
    // Effectieve deadline = 1u voor de eerste wedstrijd van die dag (Amsterdam-datum)
    // Alleen wedstrijden na 13:00 CEST (= 11:00 UTC) op die dag
    // Nachtelijke wedstrijden (bijv. 03:00 CEST) tellen niet mee als "eerste wedstrijd"
    const { data: firstMatch } = await supabase
      .from('matches')
      .select('kickoff_at')
      .eq('stage', 'group')
      .gte('kickoff_at', question.unlock_date + 'T11:00:00Z')  // 13:00 CEST = 11:00 UTC
      .lt('kickoff_at', question.unlock_date + 'T22:00:00Z')   // t/m 00:00 CEST volgende dag
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const effectiveDeadline = firstMatch
      ? new Date(new Date(firstMatch.kickoff_at).getTime() - 60 * 60 * 1000)
      : new Date(question.unlock_date + 'T00:00:00Z')

    if (effectiveDeadline <= new Date()) {
      return { ok: false, error: 'De deadline voor deze vraag is verstreken.' }
    }
  }

  const { error } = await supabase
    .from('bonus_answers')
    .upsert(
      { user_id: user.id, question_id: questionId, answer: answer.trim() },
      { onConflict: 'user_id,question_id' }
    )

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/bonusvragen')
  return { ok: true }
}
