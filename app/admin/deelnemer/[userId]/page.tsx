import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { formatInAmsterdam } from '@/lib/format'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

export default async function DeelnemerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('is_admin, username').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/voorspellingen')

  const { data: targetProfile } = await supabase.from('profiles').select('id, username').eq('id', userId).single()
  if (!targetProfile) notFound()

  // Alle groepswedstrijden met teams
  const { data: matches } = await supabase
    .from('matches')
    .select(`id, kickoff_at, match_number, home_score, away_score, result_entered,
      home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
      away_team:teams!matches_away_team_id_fkey(id, name, flag_url, group_name)`)
    .eq('stage', 'group')
    .order('kickoff_at')

  // Voorspellingen van deze deelnemer
  const { data: predictions } = await supabase
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points_awarded')
    .eq('user_id', userId)

  const predMap = Object.fromEntries((predictions ?? []).map((p) => [p.match_id, p]))

  // Jokers
  const { data: jokers } = await supabase.from('jokers').select('match_id').eq('user_id', userId)
  const jokerSet = new Set((jokers ?? []).map((j) => j.match_id))

  // Bonus antwoorden
  const { data: bonusQuestions } = await supabase
    .from('bonus_questions')
    .select('id, question, description, type')
    .eq('type', 'pre_tournament')
    .order('created_at')

  const { data: bonusAnswers } = await supabase
    .from('bonus_answers')
    .select('question_id, answer, points_awarded')
    .eq('user_id', userId)

  const bonusMap = Object.fromEntries((bonusAnswers ?? []).map((a) => [a.question_id, a]))

  type Team = { id: string; name: string; flag_url: string; group_name: string }

  return (
    <div className="min-h-screen bg-wk-bg px-4 py-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin?tab=deelnemers" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-widest uppercase transition-colors">
          ← Terug naar deelnemers
        </Link>
        <h1 className="font-display text-2xl text-wk-text uppercase mt-3">{targetProfile.username}</h1>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
          {predictions?.length ?? 0}/72 wedstrijden · {jokers?.length ?? 0}/12 jokers · {bonusAnswers?.length ?? 0}/{bonusQuestions?.length ?? 0} bonusvragen
        </p>
      </div>

      {/* Bonusvragen */}
      <section>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">Bonusvragen</p>
        <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
          {(bonusQuestions ?? []).map((q) => {
            const ans = bonusMap[q.id]
            return (
              <div key={q.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-wk-text">{q.question}</p>
                  {q.description && <p className="font-mono text-[10px] text-wk-muted">{q.description}</p>}
                </div>
                <span className={`font-mono text-sm shrink-0 ${ans?.answer ? 'text-wk-gold' : 'text-wk-muted italic'}`}>
                  {ans?.answer ?? '—'}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Groepswedstrijden per groep */}
      {GROUPS.map((group) => {
        const gm = (matches ?? []).filter((m) => (m.home_team as Team | null)?.group_name === group)
        if (gm.length === 0) return null
        const filled = gm.filter((m) => predMap[m.id]?.predicted_home !== undefined).length

        return (
          <section key={group}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Groep {group}</p>
              <span className="font-mono text-[10px] text-wk-muted">{filled}/{gm.length} ingevuld</span>
            </div>
            <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
              {gm.map((m) => {
                const home = m.home_team as Team | null
                const away = m.away_team as Team | null
                const pred = predMap[m.id]
                const hasJoker = jokerSet.has(m.id)

                return (
                  <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                    {/* Datum */}
                    <span className="font-mono text-[10px] text-wk-muted w-24 shrink-0">
                      {formatInAmsterdam(m.kickoff_at, 'd MMM HH:mm')}
                    </span>

                    {/* Thuis */}
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      <span className="text-xs text-wk-text truncate max-w-20">{home?.name}</span>
                      {home?.flag_url && <Image src={home.flag_url} alt={home.name} width={20} height={14} className="rounded-sm shrink-0" />}
                    </div>

                    {/* Score/voorspelling */}
                    <div className="shrink-0 text-center w-16">
                      {pred ? (
                        <span className={`font-mono text-xs font-bold ${hasJoker ? 'text-wk-gold' : 'text-wk-soft'}`}>
                          {pred.predicted_home}–{pred.predicted_away}
                          {hasJoker && <span className="ml-1 text-[9px]">★</span>}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-wk-muted">—</span>
                      )}
                      {pred?.points_awarded !== null && pred?.points_awarded !== undefined && (
                        <p className="font-mono text-[9px] text-wk-green">{pred.points_awarded}pt</p>
                      )}
                    </div>

                    {/* Uit */}
                    <div className="flex items-center gap-1.5 flex-1">
                      {away?.flag_url && <Image src={away.flag_url} alt={away.name ?? ''} width={20} height={14} className="rounded-sm shrink-0" />}
                      <span className="text-xs text-wk-text truncate max-w-20">{away?.name}</span>
                    </div>

                    {/* Uitslag */}
                    {m.result_entered && (
                      <span className="font-mono text-[10px] text-wk-muted shrink-0 w-10 text-right">
                        {m.home_score}–{m.away_score}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
