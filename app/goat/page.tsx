import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GoatClient, { type GoatSupporter } from './goat-client'

export const metadata = { title: 'Het GOAT-duel · WK Poule 2026' }

export default async function GoatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Doelpuntenstand wordt door de admin beheerd (app_settings)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (supabase as any)
    .from('app_settings')
    .select('key, value')
    .in('key', ['goat_messi_goals', 'goat_ronaldo_goals'])
  const settingsMap: Record<string, string> = {}
  for (const s of (settings ?? []) as { key: string; value: string }[]) settingsMap[s.key] = s.value
  const messiGoals = parseInt(settingsMap.goat_messi_goals ?? '0', 10) || 0
  const ronaldoGoals = parseInt(settingsMap.goat_ronaldo_goals ?? '0', 10) || 0

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
      messiGoals={messiGoals}
      ronaldoGoals={ronaldoGoals}
      messiSupporters={messiSupporters}
      ronaldoSupporters={ronaldoSupporters}
      currentUserId={user.id}
    />
  )
}
