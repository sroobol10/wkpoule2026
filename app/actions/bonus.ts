'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'

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

  // Pre-tournament vragen gaan op slot bij start toernooi
  if (question.type === 'pre_tournament' && new Date() >= GROUP_STAGE_DEADLINE) {
    return { ok: false, error: 'De deadline voor pre-tournament vragen is verstreken.' }
  }

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
