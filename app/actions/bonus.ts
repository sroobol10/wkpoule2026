'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isTournamentLocked } from '@/lib/tournament-lock'
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

  // Pre-tournament vragen gaan op slot bij de aftrap van de eerste WK-wedstrijd
  if (question.type === 'pre_tournament' && (await isTournamentLocked(supabase))) {
    return { ok: false, error: 'De deadline voor pre-tournament vragen is verstreken.' }
  }

  if (question.unlock_date) {
    // Effectieve deadline = 1u voor de eerste wedstrijd van die dag (Amsterdam-datum)
    // Deadline = aftrap van de vroegste wedstrijd op die CEST-kalenderdag (00:00–23:59 CEST)
    // CEST = UTC+2: dag begint op (unlock_date - 1 dag)T22:00:00Z, eindigt op unlock_dateT22:00:00Z
    const cestDayStartUtc = question.unlock_date + 'T00:00:00Z' // vertrouwt op unlock_date als CEST-datum
    // Vroegste aftrap op deze CEST-dag: van 22:00 UTC vorige dag t/m 22:00 UTC die dag
    const prevDayT22 = new Date(new Date(cestDayStartUtc).getTime() - 2 * 60 * 60 * 1000).toISOString()
    const nextDayT22 = new Date(new Date(cestDayStartUtc).getTime() + 22 * 60 * 60 * 1000).toISOString()

    const { data: firstMatch } = await supabase
      .from('matches')
      .select('kickoff_at')
      .gte('kickoff_at', prevDayT22)
      .lt('kickoff_at', nextDayT22)
      .order('kickoff_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    // Deadline = aftrap zelf (geen buffer) — vraag sluit bij eerste wedstrijd van die dag
    const effectiveDeadline = firstMatch
      ? new Date(firstMatch.kickoff_at)
      : new Date(question.unlock_date + 'T00:00:00Z')  // rustdag: midnight UTC

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
