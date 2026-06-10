import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GoatClient, { type GoatSupporter } from './goat-client'

// Doelpuntenstand WK 2026 — handmatig bijwerken na elke goal van een van de twee.
const MESSI_GOALS = 0
const RONALDO_GOALS = 0

export const metadata = { title: 'Het GOAT-duel · WK Poule 2026' }

export default async function GoatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // De GOAT-bonusvraag (zelfde herkenning als op de bonusvragenpagina)
  const { data: questions } = await supabase
    .from('bonus_questions')
    .select('id, question')
    .eq('type', 'pre_tournament')
  const goatQuestion = (questions ?? []).find((q) => {
    const lower = q.question.toLowerCase()
    return lower.includes('goat') || lower.includes('ronaldo') || lower.includes('messi')
  })

  const messiSupporters: GoatSupporter[] = []
  const ronaldoSupporters: GoatSupporter[] = []

  if (goatQuestion) {
    const { data: answers } = await supabase
      .from('bonus_answers')
      .select('user_id, answer, profiles(id, username, avatar_url)')
      .eq('question_id', goatQuestion.id)

    type Profile = { id: string; username: string; avatar_url: string | null }
    for (const a of answers ?? []) {
      const p = a.profiles as Profile | null
      if (!p) continue
      const supporter: GoatSupporter = { id: p.id, username: p.username, avatarUrl: p.avatar_url }
      const answer = (a.answer ?? '').toLowerCase()
      if (answer.includes('messi')) messiSupporters.push(supporter)
      else if (answer.includes('ronaldo')) ronaldoSupporters.push(supporter)
    }
    messiSupporters.sort((a, b) => a.username.localeCompare(b.username))
    ronaldoSupporters.sort((a, b) => a.username.localeCompare(b.username))
  }

  return (
    <GoatClient
      messiGoals={MESSI_GOALS}
      ronaldoGoals={RONALDO_GOALS}
      messiSupporters={messiSupporters}
      ronaldoSupporters={ronaldoSupporters}
      currentUserId={user.id}
    />
  )
}
