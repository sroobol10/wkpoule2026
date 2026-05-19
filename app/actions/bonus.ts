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

  // Check deadline: fetch question unlock_date — answers must be submitted before unlock_date
  const { data: question } = await supabase
    .from('bonus_questions')
    .select('unlock_date')
    .eq('id', questionId)
    .single()

  if (!question) return { ok: false, error: 'Vraag niet gevonden.' }
  if (question.unlock_date && new Date(question.unlock_date) <= new Date()) {
    return { ok: false, error: 'De deadline voor deze vraag is verstreken.' }
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
