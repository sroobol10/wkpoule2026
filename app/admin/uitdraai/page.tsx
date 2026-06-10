import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { BRACKET } from '@/lib/bracket'
import PrintButton from './print-button'

const slotStageMap = Object.fromEntries(BRACKET.map((m) => [m.slot, m.stage]))
const KO_STAGE_ORDER = ['r32','r16','qf','sf','third_place','final']
const KO_STAGE_LABELS: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'KF', sf: 'HF', third_place: '3e', final: 'FIN',
}

export default async function UitdraaiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/voorspellingen')

  // Service client voor alle user-data queries (bypast RLS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = createServiceClient() as any

  // Alle deelnemers
  const { data: memberRows } = await sc.from('poule_members').select('user_id')
  const memberUserIds = [...new Set(((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id))]

  const { data: profileRows } = memberUserIds.length > 0
    ? await supabase.from('profiles').select('id, username').in('id', memberUserIds).order('username')
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

  // Teams voor KO
  const { data: allTeams } = await supabase.from('teams').select('id, name')
  const teamMap = Object.fromEntries((allTeams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  // Chunked queries — max 20 user-IDs per request om URL-lengte limiet te vermijden
  async function fetchAllChunked(table: string, select: string, rowLimitPerChunk = 2000) {
    if (userIds.length === 0) return []
    const CHUNK = 20
    const chunks: string[][] = []
    for (let i = 0; i < userIds.length; i += CHUNK) chunks.push(userIds.slice(i, i + CHUNK))
    const results = await Promise.all(
      chunks.map((chunk) => sc.from(table).select(select).in('user_id', chunk).limit(rowLimitPerChunk))
    )
    return results.flatMap(({ data }: { data: unknown[] | null }) => data ?? [])
  }

  const [predictions, jokers, bonusAnswersRaw, bracketRows] = await Promise.all([
    fetchAllChunked('predictions',         'user_id, match_id, predicted_home, predicted_away'),
    fetchAllChunked('jokers',              'user_id, match_id'),
    fetchAllChunked('bonus_answers',       'user_id, question_id, answer'),
    fetchAllChunked('bracket_predictions', 'user_id, slot, predicted_team_id'),
  ])

  // Bonusvragen — alleen voor het toernooi (dagelijks niet in uitdraai)
  const { data: bonusQuestions } = await supabase
    .from('bonus_questions')
    .select('id, question')
    .eq('type', 'pre_tournament')
    .order('created_at')

  // Data-structuren
  type Pred = { match_id: string; predicted_home: number; predicted_away: number }
  const predByUser: Record<string, Record<string, Pred>> = {}
  for (const p of (predictions ?? []) as (Pred & { user_id: string })[]) {
    if (!predByUser[p.user_id]) predByUser[p.user_id] = {}
    predByUser[p.user_id][p.match_id] = p
  }

  const jokerByUser: Record<string, Set<string>> = {}
  for (const j of (jokers ?? []) as { user_id: string; match_id: string }[]) {
    if (!jokerByUser[j.user_id]) jokerByUser[j.user_id] = new Set()
    jokerByUser[j.user_id].add(j.match_id)
  }

  const bonusByUser: Record<string, Record<string, string>> = {}
  for (const b of (bonusAnswersRaw ?? []) as { user_id: string; question_id: string; answer: string }[]) {
    if (!bonusByUser[b.user_id]) bonusByUser[b.user_id] = {}
    bonusByUser[b.user_id][b.question_id] = b.answer
  }

  // Bracket picks per user: slot → teamId
  const bracketByUser: Record<string, Record<number, string>> = {}
  for (const b of (bracketRows ?? []) as { user_id: string; slot: number; predicted_team_id: string }[]) {
    if (!bracketByUser[b.user_id]) bracketByUser[b.user_id] = {}
    bracketByUser[b.user_id][b.slot] = b.predicted_team_id
  }

  // KO slots gegroepeerd per stage
  const slotsByStage: Record<string, number[]> = {}
  for (const bm of BRACKET) {
    if (!slotsByStage[bm.stage]) slotsByStage[bm.stage] = []
    slotsByStage[bm.stage].push(bm.slot)
  }

  type TeamRef = { name: string; group_name?: string }
  const preBonusQuestions = bonusQuestions ?? []
  const CHUNK = 8
  const userList = Object.values(userMap)

  // Split deelnemers in chunks van CHUNK voor printbare tabellen
  function chunks<T>(arr: T[]): T[][] {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += CHUNK) result.push(arr.slice(i, i + CHUNK))
    return result
  }
  const userChunks = chunks(userList)

  return (
    <>
      {/* Print CSS: landscape, kleine marges */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { font-size: 7px; }
          .print-break { break-before: page; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #d1d5db; padding: 1.5px 3px; font-size: 7px; }
          thead { background: #f9fafb !important; -webkit-print-color-adjust: exact; }
          .bg-yellow-50 { background: #fefce8 !important; -webkit-print-color-adjust: exact; }
        }
      `}</style>

    <div className="bg-white text-gray-900 min-h-screen p-6">
      <div className="max-w-full mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold">WK Poule 2026 — Uitdraai voorspellingen</h1>
            <p className="text-sm text-gray-500 mt-1">Gegenereerd op {new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="text-xs text-gray-400 mt-1">{userList.length} deelnemers · {CHUNK} per tabel</p>
          </div>
          <PrintButton />
        </div>
        <div className="hidden print:block mb-4">
          <h1 className="text-base font-bold">WK Poule 2026 — Uitdraai</h1>
        </div>

        {/* Bonusvragen */}
        {preBonusQuestions.length > 0 && (
          <section>
            <h2 className="text-base font-bold mb-2 border-b border-gray-200 pb-1">Bonusvragen</h2>
            <div className="space-y-4">
              {userChunks.map((chunk, ci) => (
                <div key={ci} className={ci > 0 ? 'print-break' : ''}>
                  {userChunks.length > 1 && <p className="text-xs text-gray-400 mb-1 print:hidden">Deel {ci + 1}/{userChunks.length}</p>}
                  <table className="w-full text-xs border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-2 py-1.5 border border-gray-200 font-medium w-48">Vraag</th>
                        {chunk.map((u) => <th key={u.id} className="text-center px-2 py-1.5 border border-gray-200 font-medium">{u.username}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {preBonusQuestions.map((q: { id: string; question: string }, qi: number) => (
                        <tr key={q.id} className={qi % 2 === 1 ? 'bg-gray-50' : ''}>
                          <td className="px-2 py-1 border border-gray-200 font-medium">{q.question}</td>
                          {chunk.map((u) => (
                            <td key={u.id} className="px-2 py-1 border border-gray-200 text-center">
                              {bonusByUser[u.id]?.[q.id] ?? <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* KO-fase bracket */}
        <section className="print-break">
          <h2 className="text-base font-bold mb-2 border-b border-gray-200 pb-1">KO-fase bracket</h2>
          <div className="space-y-4">
            {userChunks.map((chunk, ci) => (
              <div key={ci} className={ci > 0 ? 'print-break' : ''}>
                {userChunks.length > 1 && <p className="text-xs text-gray-400 mb-1 print:hidden">Deel {ci + 1}/{userChunks.length}</p>}
                <table className="w-full text-xs border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-2 py-1.5 border border-gray-200 w-8">Ronde</th>
                      <th className="text-left px-2 py-1.5 border border-gray-200 w-8">Slot</th>
                      {chunk.map((u) => <th key={u.id} className="text-center px-2 py-1.5 border border-gray-200 font-medium">{u.username}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {KO_STAGE_ORDER.map((stage) =>
                      (slotsByStage[stage] ?? []).map((slot, i) => (
                        <tr key={slot} className={slot % 2 === 0 ? 'bg-gray-50' : ''}>
                          {i === 0 && (
                            <td className="px-2 py-1 border border-gray-200 font-bold text-center align-middle" rowSpan={(slotsByStage[stage] ?? []).length}>
                              {KO_STAGE_LABELS[stage]}
                            </td>
                          )}
                          <td className="px-2 py-1 border border-gray-200 text-gray-400 text-center">{slot}</td>
                          {chunk.map((u) => {
                            const teamName = bracketByUser[u.id]?.[slot] ? teamMap[bracketByUser[u.id][slot]] : null
                            return <td key={u.id} className="px-2 py-1 border border-gray-200 text-center">{teamName ?? <span className="text-gray-300">—</span>}</td>
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        {/* Groepsfase */}
        <section className="print-break">
          <h2 className="text-base font-bold mb-2 border-b border-gray-200 pb-1">Groepsfase voorspellingen</h2>
          <div className="space-y-4">
            {userChunks.map((chunk, ci) => (
              <div key={ci} className={ci > 0 ? 'print-break' : ''}>
                {userChunks.length > 1 && <p className="text-xs text-gray-400 mb-1 print:hidden">Deel {ci + 1}/{userChunks.length}</p>}
                <table className="w-full text-xs border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 border border-gray-200 w-6">#</th>
                      <th className="px-2 py-1.5 border border-gray-200 w-6">Gr</th>
                      <th className="text-left px-2 py-1.5 border border-gray-200">Wedstrijd</th>
                      {chunk.map((u) => <th key={u.id} className="text-center px-2 py-1.5 border border-gray-200 font-medium">{u.username}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(matches ?? []).map((m, mi: number) => {
                      const home = m.home_team as TeamRef | null
                      const away = m.away_team as TeamRef | null
                      return (
                        <tr key={m.id} className={mi % 2 === 1 ? 'bg-gray-50' : ''}>
                          <td className="px-2 py-1 border border-gray-200 text-gray-400 text-center">{m.match_number}</td>
                          <td className="px-2 py-1 border border-gray-200 font-medium text-center">{home?.group_name}</td>
                          <td className="px-2 py-1 border border-gray-200">{home?.name} – {away?.name}</td>
                          {chunk.map((u) => {
                            const pred = predByUser[u.id]?.[m.id]
                            const hasJoker = jokerByUser[u.id]?.has(m.id)
                            return (
                              <td key={u.id} className={`px-2 py-1 border border-gray-200 text-center ${hasJoker ? 'bg-yellow-50 font-bold' : ''}`}>
                                {pred ? `${pred.predicted_home}–${pred.predicted_away}${hasJoker ? '★' : ''}` : <span className="text-gray-300">—</span>}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
    </>
  )
}

