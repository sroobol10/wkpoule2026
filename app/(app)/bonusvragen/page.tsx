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
  // Alle wedstrijden (groepsfase + KO) voor deadline-berekening + wedstrijden-per-dag
  const { data: allGroupMatches } = await supabase
    .from('matches')
    .select(`id, kickoff_at, home_score, away_score, result_entered, home_team:teams!matches_home_team_id_fkey(name, flag_url), away_team:teams!matches_away_team_id_fkey(name, flag_url)`)
    .order('kickoff_at')

  // Landen die nog actief zijn in het toernooi = teams met een nog niet
  // gespeelde wedstrijd. Een uitgeschakeld land komt enkel nog voor in
  // gespeelde wedstrijden. (Gebruikt voor de landenbonusvragen.)
  const activeTeamNames = new Set<string>()
  for (const m of allGroupMatches ?? []) {
    if (m.result_entered) continue
    const h = m.home_team as { name: string } | null
    const a = m.away_team as { name: string } | null
    if (h?.name) activeTeamNames.add(h.name)
    if (a?.name) activeTeamNames.add(a.name)
  }

  // Eigen voorspellingen, voor het 🔮-symbool bij de dagwedstrijden
  const { data: myPreds } = await supabase
    .from('predictions')
    .select('match_id, predicted_home, predicted_away')
    .eq('user_id', user.id)
  const myPredByMatch: Record<string, string> = {}
  for (const p of myPreds ?? []) myPredByMatch[p.match_id] = `${p.predicted_home}–${p.predicted_away}`

  // Deadline = aftrap van de vroegste wedstrijd op die CEST-kalenderdag (geen tijdfilter)
  const firstKickoffByDay: Record<string, string> = {}  // CEST-datum → vroegste kickoff
  for (const m of allGroupMatches ?? []) {
    const cest = new Date(new Date(m.kickoff_at).getTime() + 2 * 60 * 60 * 1000)
    const day = cest.toISOString().slice(0, 10)  // CEST-datum
    if (!firstKickoffByDay[day]) firstKickoffByDay[day] = m.kickoff_at  // all matches, no filter
  }

  // unlock_date → effectieve deadline (= aftrap zelf, geen buffer)
  const deadlineByDate: Record<string, string> = {}
  for (const [day, kickoff] of Object.entries(firstKickoffByDay)) {
    deadlineByDate[day] = kickoff  // deadline = kickoff van vroegste wedstrijd die dag
  }

  // Wedstrijden per CEST-dag (voor de "welke wedstrijden"-dropdown per vraag)
  type TeamRef = { name: string; flag_url: string | null }
  type MatchForDay = {
    kickoff_at: string
    home: string
    away: string
    homeFlag: string | null
    awayFlag: string | null
    myPred: string | null
    result: string | null   // werkelijke uitslag zodra gespeeld
  }
  const matchesByDay: Record<string, MatchForDay[]> = {}
  for (const m of allGroupMatches ?? []) {
    const cest = new Date(new Date(m.kickoff_at).getTime() + 2 * 60 * 60 * 1000)
    const day = cest.toISOString().slice(0, 10)
    if (!matchesByDay[day]) matchesByDay[day] = []
    const home = m.home_team as TeamRef | null
    const away = m.away_team as TeamRef | null
    const played = m.result_entered && m.home_score != null && m.away_score != null
    matchesByDay[day].push({
      kickoff_at: m.kickoff_at,
      home: home?.name ?? '?',
      away: away?.name ?? '?',
      homeFlag: home?.flag_url ?? null,
      awayFlag: away?.flag_url ?? null,
      myPred: myPredByMatch[m.id] ?? null,
      result: played ? `${m.home_score}–${m.away_score}` : null,
    })
  }

  const { data: questions } = await supabase
    .from('bonus_questions')
    .select('id, question, description, type, unlock_date, correct_answer_set, answer_type, answer_options')
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
  // Daily: zichtbaar zodra de vraag in het dagoverzicht verschijnt, d.w.z. de
  // dag van vandaag of morgen (CEST-kalenderdag) — exact dezelfde grens als
  // DagOverzicht, zodat doorklikken vanuit het dagoverzicht altijd klopt.
  const cestMs = Date.now() + 2 * 60 * 60 * 1000
  const tomorrowCest = new Date(cestMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const visibleQuestions = (questions ?? []).filter((q) => {
    if (q.type === 'pre_tournament') return true
    if (!q.unlock_date) return false
    // ISO-datums zijn lexicografisch vergelijkbaar
    return q.unlock_date <= tomorrowCest
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
      matchesByDay={matchesByDay}
      activeTeamNames={[...activeTeamNames]}
    />
  )
}
