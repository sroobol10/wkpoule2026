import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BonusvragenClient from './bonusvragen-client'

export default async function BonusvragenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date().toISOString()

  const { data: questions } = await supabase
    .from('bonus_questions')
    .select('id, question, type, unlock_date, correct_answer_set')
    .order('type')
    .order('unlock_date')

  const { data: answers } = await supabase
    .from('bonus_answers')
    .select('question_id, answer, points_awarded')
    .eq('user_id', user.id)

  const answerMap = Object.fromEntries(
    (answers ?? []).map((a) => [a.question_id, a])
  )

  // Pre-tournament always visible; daily only when unlocked
  const visibleQuestions = (questions ?? []).filter((q) => {
    if (q.type === 'pre_tournament') return true
    return q.unlock_date !== null && q.unlock_date <= now
  })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, flag_url')
    .order('name')

  return (
    <BonusvragenClient
      questions={visibleQuestions}
      answerMap={answerMap}
      teams={teams ?? []}
    />
  )
}
