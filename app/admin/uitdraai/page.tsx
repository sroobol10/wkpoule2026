import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintButton from './print-button'

export default async function UitdraaiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/voorspellingen')

  // Alle deelnemers
  const { data: memberRows } = await supabase
    .from('poule_members')
    .select('user_id')

  const memberUserIds = [...new Set((memberRows ?? []).map((m) => m.user_id))]

  const { data: profileRows } = memberUserIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, username')
        .in('id', memberUserIds)
        .order('username')
    : { data: [] }

  type ProfileRef = { id: string; username: string }
  const userMap: Record<string, ProfileRef> = {}
  for (const p of profileRows ?? []) userMap[p.id] = p
  const userIds = Object.keys(userMap)

  // Alle groepswedstrijden
  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_number, kickoff_at, home_team:teams!matches_home_team_id_fkey(name, group_name), away_team:teams!matches_away_team_id_fkey(name)')
    .eq('stage', 'group')
    .order('match_number')

  // Alle voorspellingen
  const { data: predictions } = userIds.length > 0
    ? await supabase
        .from('predictions')
        .select('user_id, match_id, predicted_home, predicted_away')
        .in('user_id', userIds)
    : { data: [] }

  // Alle jokers
  const { data: jokers } = userIds.length > 0
    ? await supabase.from('jokers').select('user_id, match_id').in('user_id', userIds)
    : { data: [] }

  // Alle bonusvragen
  const { data: bonusQuestions } = await supabase
    .from('bonus_questions')
    .select('id, question')
    .eq('type', 'pre_tournament')
    .order('created_at')

  const { data: bonusAnswers } = userIds.length > 0
    ? await supabase.from('bonus_answers').select('user_id, question_id, answer').in('user_id', userIds)
    : { data: [] }

  // Bouw data-structuren
  type Pred = { match_id: string; predicted_home: number; predicted_away: number }
  const predByUser: Record<string, Record<string, Pred>> = {}
  for (const p of predictions ?? []) {
    if (!predByUser[p.user_id]) predByUser[p.user_id] = {}
    predByUser[p.user_id][p.match_id] = p
  }

  const jokerByUser: Record<string, Set<string>> = {}
  for (const j of jokers ?? []) {
    if (!jokerByUser[j.user_id]) jokerByUser[j.user_id] = new Set()
    jokerByUser[j.user_id].add(j.match_id)
  }

  const bonusByUser: Record<string, Record<string, string>> = {}
  for (const b of bonusAnswers ?? []) {
    if (!bonusByUser[b.user_id]) bonusByUser[b.user_id] = {}
    bonusByUser[b.user_id][b.question_id] = b.answer
  }

  type TeamRef = { name: string; group_name?: string }

  return (
    <div className="bg-white text-gray-900 min-h-screen p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">WK Poule 2026 — Uitdraai voorspellingen</h1>
            <p className="text-sm text-gray-500 mt-1">Gegenereerd op {new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <PrintButton />
        </div>

        {/* Bonusvragen */}
        {(bonusQuestions ?? []).length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-2">Bonusvragen</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 border border-gray-200 font-medium">Vraag</th>
                    {Object.values(userMap).map((u) => (
                      <th key={u.id} className="text-left px-3 py-2 border border-gray-200 font-medium min-w-24">{u.username}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(bonusQuestions ?? []).map((q) => (
                    <tr key={q.id} className="even:bg-gray-50">
                      <td className="px-3 py-1.5 border border-gray-200 font-medium">{q.question}</td>
                      {Object.keys(userMap).map((uid) => (
                        <td key={uid} className="px-3 py-1.5 border border-gray-200">
                          {bonusByUser[uid]?.[q.id] ?? <span className="text-gray-400">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Wedstrijdvoorspellingen */}
        <section>
          <h2 className="text-lg font-bold mb-3 border-b border-gray-200 pb-2">Wedstrijdvoorspellingen</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-2 border border-gray-200">#</th>
                  <th className="text-left px-2 py-2 border border-gray-200">Groep</th>
                  <th className="text-left px-2 py-2 border border-gray-200">Wedstrijd</th>
                  {Object.values(userMap).map((u) => (
                    <th key={u.id} className="text-center px-2 py-2 border border-gray-200 min-w-20">{u.username}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(matches ?? []).map((m) => {
                  const home = m.home_team as TeamRef | null
                  const away = m.away_team as TeamRef | null
                  return (
                    <tr key={m.id} className="even:bg-gray-50">
                      <td className="px-2 py-1 border border-gray-200 text-gray-400">{m.match_number}</td>
                      <td className="px-2 py-1 border border-gray-200 font-medium">{home?.group_name}</td>
                      <td className="px-2 py-1 border border-gray-200">{home?.name} – {away?.name}</td>
                      {Object.keys(userMap).map((uid) => {
                        const pred = predByUser[uid]?.[m.id]
                        const hasJoker = jokerByUser[uid]?.has(m.id)
                        return (
                          <td key={uid} className={`px-2 py-1 border border-gray-200 text-center ${hasJoker ? 'bg-yellow-50 font-bold' : ''}`}>
                            {pred ? `${pred.predicted_home}–${pred.predicted_away}${hasJoker ? ' ★' : ''}` : <span className="text-gray-300">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
