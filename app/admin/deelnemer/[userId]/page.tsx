import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { formatInAmsterdam } from '@/lib/format'
import { BRACKET } from '@/lib/bracket'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
const KO_STAGE_ORDER = ['r32','r16','qf','sf','third_place','final']
const KO_STAGE_LABELS: Record<string, string> = {
  r32: 'Ronde van 32', r16: 'Achtste finales', qf: 'Kwartfinales',
  sf: 'Halve finales', third_place: 'Troostfinale', final: 'Finale',
}
const slotStageMap = Object.fromEntries(BRACKET.map((m) => [m.slot, m.stage]))

type Team = { id: string; name: string; flag_url: string; group_name: string }

export default async function DeelnemerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('is_admin, username').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/voorspellingen')

  const { data: targetProfile } = await supabase.from('profiles').select('id, username').eq('id', userId).single()
  if (!targetProfile) notFound()

  // Service client voor alle queries — bypast RLS zodat admin andermans data kan zien
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = createServiceClient() as any

  const [
    { data: matches },
    { data: predictions },
    { data: jokers },
    { data: bonusQuestions },
    { data: bonusAnswers },
    { data: bracketRows },
    { data: allTeams },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select(`id, kickoff_at, match_number, home_score, away_score, result_entered,
        home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
        away_team:teams!matches_away_team_id_fkey(id, name, flag_url, group_name)`)
      .eq('stage', 'group')
      .order('kickoff_at'),
    sc.from('predictions').select('match_id, predicted_home, predicted_away, points_awarded').eq('user_id', userId),
    sc.from('jokers').select('match_id').eq('user_id', userId),
    supabase.from('bonus_questions').select('id, question, description, type').eq('type', 'pre_tournament').order('created_at'),
    sc.from('bonus_answers').select('question_id, answer, points_awarded').eq('user_id', userId),
    sc.from('bracket_predictions').select('slot, predicted_team_id, points_awarded').eq('user_id', userId).order('slot'),
    supabase.from('teams').select('id, name, flag_url, group_name'),
  ])

  const predMap = Object.fromEntries((predictions ?? []).map((p: { match_id: string; predicted_home: number; predicted_away: number; points_awarded: number | null }) => [p.match_id, p]))
  const jokerSet = new Set((jokers ?? []).map((j: { match_id: string }) => j.match_id))
  const bonusMap = Object.fromEntries((bonusAnswers ?? []).map((a: { question_id: string; answer: string; points_awarded: number | null }) => [a.question_id, a]))
  const teamMap = Object.fromEntries((allTeams ?? []).map((t: Team) => [t.id, t]))

  return (
    <div className="min-h-screen bg-wk-bg px-4 py-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin?tab=deelnemers" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-widest uppercase transition-colors">
          ← Terug naar deelnemers
        </Link>
        <h1 className="font-display text-2xl text-wk-text uppercase mt-3">{targetProfile.username}</h1>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
          {predictions?.length ?? 0}/72 wedstrijden · {jokers?.length ?? 0}/12 jokers · {bracketRows?.length ?? 0}/32 bracket · {bonusAnswers?.length ?? 0}/{bonusQuestions?.length ?? 0} bonusvragen
        </p>
      </div>

      {/* Bonusvragen */}
      <section>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">Bonusvragen</p>
        <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
          {(bonusQuestions ?? []).map((q: { id: string; question: string; description: string | null }) => {
            const ans = bonusMap[q.id]
            return (
              <div key={q.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-wk-text">{q.question}</p>
                  {q.description && <p className="font-mono text-[10px] text-wk-muted">{q.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-mono text-sm ${ans?.answer ? 'text-wk-gold' : 'text-wk-muted italic'}`}>
                    {ans?.answer ?? '—'}
                  </span>
                  {ans?.points_awarded != null && (
                    <span className="font-mono text-[10px] text-wk-green">{ans.points_awarded}pt</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* KO Bracket */}
      <section>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">
          Knockout bracket · {bracketRows?.length ?? 0}/32
        </p>
        {(bracketRows ?? []).length === 0 ? (
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Geen bracket picks.</p>
        ) : (
          <div className="space-y-3">
            {KO_STAGE_ORDER.map((stage) => {
              const stagePicks = (bracketRows ?? []).filter((p: { slot: number }) => slotStageMap[p.slot] === stage)
              if (stagePicks.length === 0) return null
              return (
                <div key={stage}>
                  <p className="font-mono text-[9px] text-wk-muted tracking-[0.14em] uppercase mb-1.5">
                    {stage === 'final' ? 'Winnaar' : stage === 'third_place' ? 'Winnaar Troostfinale' : `Winnaars van ${KO_STAGE_LABELS[stage]}`}
                  </p>
                  <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                    {stagePicks.map((pick: { slot: number; predicted_team_id: string; points_awarded: number | null }) => {
                      const team = teamMap[pick.predicted_team_id]
                      return (
                        <div key={pick.slot} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="font-mono text-[10px] text-wk-muted w-7 shrink-0">#{pick.slot}</span>
                          {team?.flag_url && <Image src={team.flag_url} alt={team.name} width={20} height={14} className="rounded-sm shrink-0" />}
                          <span className="flex-1 text-sm text-wk-text">{team?.name ?? '—'}</span>
                          {pick.points_awarded != null && (
                            <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-widest ${pick.points_awarded > 0 ? 'bg-wk-green/10 border-wk-green/30 text-wk-green' : 'bg-white/5 border-white/10 text-wk-muted'}`}>
                              {pick.points_awarded}pt
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Groepswedstrijden per groep */}
      {GROUPS.map((group) => {
        const gm = (matches ?? []).filter((m: { home_team: Team | null }) => (m.home_team as Team | null)?.group_name === group)
        if (gm.length === 0) return null
        const filled = gm.filter((m: { id: string }) => predMap[m.id]?.predicted_home !== undefined).length

        return (
          <section key={group}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Groep {group}</p>
              <span className="font-mono text-[10px] text-wk-muted">{filled}/{gm.length} ingevuld</span>
            </div>
            <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
              {gm.map((m: { id: string; kickoff_at: string; home_team: Team | null; away_team: Team | null; result_entered: boolean; home_score: number | null; away_score: number | null }) => {
                const home = m.home_team as Team | null
                const away = m.away_team as Team | null
                const pred = predMap[m.id]
                const hasJoker = jokerSet.has(m.id)

                return (
                  <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                    <span className="font-mono text-[10px] text-wk-muted w-24 shrink-0">
                      {formatInAmsterdam(m.kickoff_at, 'd MMM HH:mm')}
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      <span className="text-xs text-wk-text truncate max-w-20">{home?.name}</span>
                      {home?.flag_url && <Image src={home.flag_url} alt={home.name} width={20} height={14} className="rounded-sm shrink-0" />}
                    </div>
                    <div className="shrink-0 text-center w-16">
                      {pred ? (
                        <span className={`font-mono text-xs font-bold ${hasJoker ? 'text-wk-gold' : 'text-wk-soft'}`}>
                          {pred.predicted_home}–{pred.predicted_away}
                          {hasJoker && <span className="ml-1 text-[9px]">★</span>}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-wk-muted">—</span>
                      )}
                      {pred?.points_awarded != null && (
                        <p className="font-mono text-[9px] text-wk-green">{pred.points_awarded}pt</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-1">
                      {away?.flag_url && <Image src={away.flag_url} alt={away.name ?? ''} width={20} height={14} className="rounded-sm shrink-0" />}
                      <span className="text-xs text-wk-text truncate max-w-20">{away?.name}</span>
                    </div>
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
