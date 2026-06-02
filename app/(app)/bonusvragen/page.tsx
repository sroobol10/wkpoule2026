import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BonusvragenClient from './bonusvragen-client'

export default async function BonusvragenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date().toISOString()

  // Toernooi gestart zodra er minimaal één groepswedstrijd gespeeld is
  const { count: playedCount } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('stage', 'group')
    .eq('result_entered', true)
  const anyMatchPlayed = (playedCount ?? 0) > 0

  // Bereken effectieve deadline per dag: eerste wedstrijd van die dag - 1 uur
  // "Dag" = Amsterdam-datum (CEST = UTC+2 in zomer)
  const { data: allGroupMatches } = await supabase
    .from('matches')
    .select('kickoff_at')
    .eq('stage', 'group')
    .order('kickoff_at')

  // Alleen wedstrijden vanaf 13:00 CEST (11:00 UTC) — nachtelijke matches vallen af
  const firstKickoffByDay: Record<string, string> = {}  // CEST-datum → ISO kickoff
  for (const m of allGroupMatches ?? []) {
    const cest = new Date(new Date(m.kickoff_at).getTime() + 2 * 60 * 60 * 1000)
    const day = cest.toISOString().slice(0, 10)
    const hourCEST = cest.getUTCHours()  // na +2u shift = CEST uur
    if (hourCEST < 13) continue           // voor 13:00 CEST overslaan
    if (!firstKickoffByDay[day]) firstKickoffByDay[day] = m.kickoff_at
  }

  // unlock_date (dag van de vraag) → effectieve deadline (= kickoff - 1u)
  const deadlineByDate: Record<string, string> = {}
  for (const [day, kickoff] of Object.entries(firstKickoffByDay)) {
    deadlineByDate[day] = new Date(new Date(kickoff).getTime() - 60 * 60 * 1000).toISOString()
  }

  const { data: questions } = await supabase
    .from('bonus_questions')
    .select('id, question, description, type, unlock_date, correct_answer_set')
    .order('type')
    .order('unlock_date')

  const { data: answers } = await supabase
    .from('bonus_answers')
    .select('question_id, answer, points_awarded')
    .eq('user_id', user.id)

  const answerMap = Object.fromEntries(
    (answers ?? []).map((a) => [a.question_id, a])
  )

  // Pre-tournament: altijd zichtbaar (tot toernooi start)
  // Daily: zichtbaar vanaf 24u VÓÓR de unlock_date zodat deelnemers de vraag
  // kunnen invullen vóór de wedstrijd die avond/nacht begint.
  // De vraag gaat op slot OP de unlock_date (midnight UTC).
  const nowMs = Date.now()
  const oneDayMs = 24 * 60 * 60 * 1000
  const visibleQuestions = (questions ?? []).filter((q) => {
    if (q.type === 'pre_tournament') return true
    if (!q.unlock_date) return false
    const unlockMs = new Date(q.unlock_date + 'T00:00:00Z').getTime()
    // Toon als we binnen 24u vóór de deadline zitten, of als de deadline al voorbij is
    return nowMs >= unlockMs - oneDayMs
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
      anyMatchPlayed={anyMatchPlayed}
      deadlineByDate={deadlineByDate}
    />
  )
}
