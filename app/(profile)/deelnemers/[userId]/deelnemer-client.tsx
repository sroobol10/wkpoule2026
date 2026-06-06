'use client'

import { useState } from 'react'
import Image from 'next/image'
import { formatInAmsterdam } from '@/lib/format'
import { BRACKET } from '@/lib/bracket'

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

const KO_STAGE_LABELS: Record<string, string> = {
  r32:         'Ronde van 32',
  r16:         'Achtste finales',
  qf:          'Kwartfinales',
  sf:          'Halve finales',
  third_place: 'Troostfinale',
  final:       'Finale',
}
const KO_STAGE_ORDER = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']

type Team = { id: string; name: string; flag_url: string; group_name: string }
type Match = {
  id: string; kickoff_at: string; match_number: number | null
  home_score: number | null; away_score: number | null; result_entered: boolean
  home_team: Team | null; away_team: Team | null
}

type Props = {
  matches: Match[]
  predRows: { match_id: string; predicted_home: number; predicted_away: number; points_awarded: number | null }[]
  jokerRows: { match_id: string }[]
  advancementRows: { team_id: string; predicted_position: number }[]
  bracketRows: { slot: number; predicted_team_id: string; points_awarded: number | null }[]
  allTeams: Team[]
  bonusQuestions: { id: string; question: string; type: string; unlock_date: string | null; correct_answer: string | null; correct_answer_set: boolean }[]
  bonusAnswerRows: { question_id: string; answer: string; points_awarded: number | null }[]
  canSeeData: boolean
}

type Tab = 'groepsfase' | 'eindstand' | 'knockout' | 'bonus'

export default function DeelnemerClient({
  matches, predRows, jokerRows, bracketRows, allTeams,
  bonusQuestions, bonusAnswerRows, advancementRows, canSeeData,
}: Props) {
  // Slot → stage mapping uit de statische bracket definitie (geen DB nodig)
  const slotStageMap = Object.fromEntries(BRACKET.map((m) => [m.slot, m.stage]))
  const [tab, setTab] = useState<Tab>('groepsfase')

  const predMap = Object.fromEntries(predRows.map((p) => [p.match_id, p]))
  const jokerSet = new Set(jokerRows.map((j) => j.match_id))
  const teamMap = Object.fromEntries(allTeams.map((t) => [t.id, t]))
  const bonusMap = Object.fromEntries(bonusAnswerRows.map((a) => [a.question_id, a]))

  const bonusPts = bonusAnswerRows.reduce((s, a) => s + (a.points_awarded ?? 0), 0)
  const groepsPts = predRows.reduce((s, p) => s + (p.points_awarded ?? 0), 0)
  const koPts = bracketRows.reduce((s, p) => s + (p.points_awarded ?? 0), 0)

  // ─── Statistieken ──────────────────────────────────────────────────────────
  const playedPreds   = predRows.filter((p) => p.points_awarded !== null)
  const correctPreds  = playedPreds.filter((p) => (p.points_awarded ?? 0) > 0)
  const exactPreds    = playedPreds.filter((p) => {
    // Exact = 10pt (geen joker) of 20pt (joker). Joker verdubbelt 10 → 20.
    const pts = p.points_awarded ?? 0
    const hasJoker = jokerSet.has(p.match_id)
    return hasJoker ? pts === 20 : pts === 10
  })
  const correctPredPct = playedPreds.length > 0
    ? Math.round((correctPreds.length / playedPreds.length) * 100) : null
  const exactPredPct = playedPreds.length > 0
    ? Math.round((exactPreds.length / playedPreds.length) * 100) : null

  const decidedKO   = bracketRows.filter((p) => p.points_awarded !== null)
  const correctKO   = decidedKO.filter((p) => (p.points_awarded ?? 0) > 0)
  const koPct = decidedKO.length > 0
    ? Math.round((correctKO.length / decidedKO.length) * 100) : null

  const decidedBonus  = bonusAnswerRows.filter((a) => a.points_awarded !== null)
  const correctBonus  = decidedBonus.filter((a) => (a.points_awarded ?? 0) > 0)

  const showStats = playedPreds.length > 0 || decidedKO.length > 0 || decidedBonus.length > 0

  const tabs: { id: Tab; label: string; pts: number | null; locked: boolean }[] = [
    { id: 'groepsfase', label: 'Wedstrijden',  pts: groepsPts || null, locked: !canSeeData },
    { id: 'eindstand',  label: 'Wie door',     pts: null,              locked: !canSeeData },
    { id: 'knockout',   label: 'Knockout',     pts: koPts || null,     locked: !canSeeData },
    { id: 'bonus',      label: 'Bonusvragen',  pts: bonusPts || null,  locked: !canSeeData },
  ]

  return (
    <div className="space-y-5">
      {/* Statistieken — altijd tonen, ook bij 0 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Correct resultaat"
          value={correctPredPct !== null ? `${correctPredPct}%` : '—'}
          sub={playedPreds.length > 0 ? `${correctPreds.length}/${playedPreds.length} wed.` : 'geen data'}
        />
        <StatCard
          label="Exacte score"
          value={exactPredPct !== null ? `${exactPredPct}%` : '—'}
          sub={playedPreds.length > 0 ? `${exactPreds.length}/${playedPreds.length} wed.` : 'geen data'}
        />
        <StatCard
          label="Correcte KO-keuze"
          value={koPct !== null ? `${koPct}%` : '—'}
          sub={decidedKO.length > 0 ? `${correctKO.length}/${decidedKO.length} picks` : 'geen data'}
        />
        <StatCard
          label="Bonus correct"
          value={decidedBonus.length > 0 ? `${correctBonus.length}/${decidedBonus.length}` : '—'}
          sub={decidedBonus.length > 0 ? 'vragen' : 'geen data'}
        />
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-none border-b border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2.5 font-mono text-[10px] tracking-[0.14em] uppercase border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-wk-gold text-wk-gold'
                : 'border-transparent text-wk-muted hover:text-wk-soft'
            }`}
          >
            {t.label}
            {t.locked
              ? <span className="text-[10px] opacity-50">🔒</span>
              : t.pts != null && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                  tab === t.id
                    ? 'bg-wk-gold/10 border-wk-gold/30 text-wk-gold'
                    : 'bg-white/5 border-white/10 text-wk-muted'
                }`}>
                  {t.pts}pt
                </span>
              )
            }
          </button>
        ))}
      </div>

      {/* Vergrendeld */}
      {tabs.find((t) => t.id === tab)?.locked && (
        <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center space-y-2">
          <p className="font-display text-base text-wk-text uppercase">Verborgen tot WK-start</p>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
            Zichtbaar vanaf 11 juni 2026
          </p>
        </div>
      )}

      {/* Bonusvragen */}
      {tab === 'bonus' && !tabs.find((t) => t.id === tab)?.locked && (
        <div className="space-y-5">
          {bonusQuestions.length === 0 ? (
            <EmptyState>Geen bonusvragen</EmptyState>
          ) : (
            <>
              {/* Pre-tournament */}
              {(() => {
                const pre = bonusQuestions.filter((q) => q.type === 'pre_tournament')
                if (pre.length === 0) return null
                return (
                  <div>
                    <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mb-2">Voor het WK</p>
                    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                      {pre.map((q) => <BonusRow key={q.id} q={q} ans={bonusMap[q.id]} />)}
                    </div>
                  </div>
                )
              })()}

              {/* Dagelijks */}
              {(() => {
                const daily = bonusQuestions.filter((q) => q.type !== 'pre_tournament')
                if (daily.length === 0) return null
                return (
                  <div>
                    <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mb-2">Dagelijks</p>
                    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                      {daily.map((q) => <BonusRow key={q.id} q={q} ans={bonusMap[q.id]} />)}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* Groepsfase */}
      {tab === 'groepsfase' && !tabs.find((t) => t.id === tab)?.locked && (
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const gm = matches.filter((m) => m.home_team?.group_name === group)
            if (gm.length === 0) return null
            const pts = gm.reduce((s, m) => s + (predMap[m.id]?.points_awarded ?? 0), 0)
            const filled = gm.filter((m) => predMap[m.id]).length

            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Groep {group}</p>
                  <div className="flex items-center gap-3">
                    {pts > 0 && <span className="font-mono text-[10px] text-wk-gold">{pts}pt</span>}
                    <span className="font-mono text-[10px] text-wk-muted">{filled}/{gm.length}</span>
                  </div>
                </div>
                <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                  {gm.map((m) => {
                    const pred = predMap[m.id]
                    const hasJoker = jokerSet.has(m.id)
                    const pts = pred?.points_awarded

                    return (
                      <div key={m.id} className="px-4 py-3">
                        <p className="font-mono text-[9px] text-wk-muted tracking-widest mb-1.5">
                          {formatInAmsterdam(m.kickoff_at, 'EEE d MMM · HH:mm')}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                            <span className="text-xs text-wk-text truncate">{m.home_team?.name}</span>
                            {m.home_team?.flag_url && (
                              <Image src={m.home_team.flag_url} alt={m.home_team.name} width={20} height={14} className="rounded-sm shrink-0" />
                            )}
                          </div>

                          <div className="shrink-0 text-center w-20">
                            {pred ? (
                              <div>
                                <p className={`font-mono text-sm font-bold ${hasJoker ? 'text-wk-gold' : 'text-wk-soft'}`}>
                                  {pred.predicted_home}–{pred.predicted_away}
                                  {hasJoker && <span className="ml-1 text-xs">★</span>}
                                </p>
                                {pts != null && (
                                  <p className={`font-mono text-[9px] ${pts > 0 ? 'text-wk-green' : 'text-wk-muted'}`}>{pts}pt</p>
                                )}
                              </div>
                            ) : (
                              <span className="font-mono text-[10px] text-wk-muted">—</span>
                            )}
                            {m.result_entered && (
                              <p className="font-mono text-[9px] text-wk-muted/50">{m.home_score}–{m.away_score}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {m.away_team?.flag_url && (
                              <Image src={m.away_team.flag_url} alt={m.away_team.name ?? ''} width={20} height={14} className="rounded-sm shrink-0" />
                            )}
                            <span className="text-xs text-wk-text truncate">{m.away_team?.name}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Doorstroom per groep */}
      {tab === 'eindstand' && !tabs.find((t) => t.id === tab)?.locked && (
        <div className="space-y-4">
          {advancementRows.length === 0
            ? <EmptyState>Geen doorstroomvoorspellingen</EmptyState>
            : (
              <>
                {/* Nummers 1 en 2 per groep */}
                <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/5">
                    <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase">Groepswinnaars & nummers 2</p>
                  </div>
                  <div className="divide-y divide-white/5">
                    {GROUPS.map((group) => {
                      const pos1 = advancementRows.find((r) => r.predicted_position === 1 && allTeams.find((t) => t.id === r.team_id)?.group_name === group)
                      const pos2 = advancementRows.find((r) => r.predicted_position === 2 && allTeams.find((t) => t.id === r.team_id)?.group_name === group)
                      const t1 = pos1 ? allTeams.find((t) => t.id === pos1.team_id) : null
                      const t2 = pos2 ? allTeams.find((t) => t.id === pos2.team_id) : null
                      if (!t1 && !t2) return null
                      return (
                        <div key={group} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="font-mono text-[10px] text-wk-muted w-5 shrink-0">{group}</span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            {t1?.flag_url && <Image src={t1.flag_url} alt={t1.name} width={18} height={13} className="rounded-sm shrink-0" />}
                            <span className="text-sm text-wk-text truncate">{t1?.name ?? '—'}</span>
                          </div>
                          <span className="font-mono text-[9px] text-wk-muted tracking-widest">·</span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            {t2?.flag_url && <Image src={t2.flag_url} alt={t2.name} width={18} height={13} className="rounded-sm shrink-0" />}
                            <span className="text-sm text-wk-text truncate">{t2?.name ?? '—'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Beste 8 nummers 3 */}
                {(() => {
                  const thirds = advancementRows
                    .filter((r) => r.predicted_position === 3)
                    .map((r) => allTeams.find((t) => t.id === r.team_id))
                    .filter(Boolean) as Team[]
                  if (thirds.length === 0) return null
                  return (
                    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-white/5">
                        <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase">Beste nummers 3 ({thirds.length}/8)</p>
                      </div>
                      <div className="divide-y divide-white/5">
                        {thirds.map((team) => (
                          <div key={team.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="font-mono text-[10px] text-wk-muted w-5 shrink-0">{team.group_name}</span>
                            {team.flag_url && <Image src={team.flag_url} alt={team.name} width={18} height={13} className="rounded-sm shrink-0" />}
                            <span className="flex-1 text-sm text-wk-text">{team.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )
          }
        </div>
      )}

      {/* Knockout */}
      {tab === 'knockout' && !tabs.find((t) => t.id === tab)?.locked && (
        <div className="space-y-5">
          {bracketRows.length === 0 ? (
            <EmptyState>Nog geen bracket picks</EmptyState>
          ) : (
            KO_STAGE_ORDER.map((stage) => {
              const stagePicks = bracketRows.filter((p) => slotStageMap[p.slot] === stage)
              if (stagePicks.length === 0) return null

              return (
                <div key={stage}>
                  <p className="font-mono text-[9px] text-wk-muted tracking-[0.14em] uppercase mb-1.5">
                    {stage === 'final' ? 'Winnaar' : stage === 'third_place' ? 'Winnaar Troostfinale' : `Winnaars van ${KO_STAGE_LABELS[stage]}`}
                  </p>
                  <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
                    {stagePicks.map((pick) => {
                      const team = teamMap[pick.predicted_team_id]
                      const pts = pick.points_awarded
                      return (
                        <div key={pick.slot} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="font-mono text-[10px] text-wk-muted w-7 shrink-0">#{pick.slot}</span>
                          {team?.flag_url && (
                            <Image src={team.flag_url} alt={team.name} width={20} height={14} className="rounded-sm shrink-0" />
                          )}
                          <span className="flex-1 text-sm text-wk-text">{team?.name ?? '—'}</span>
                          {pts != null && <PtsBadge pts={pts} />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3 text-center">
      <p className="font-display text-2xl text-wk-gold leading-none">{value}</p>
      <p className="font-mono text-[9px] text-wk-soft tracking-widest uppercase mt-1">{label}</p>
      <p className="font-mono text-[9px] text-wk-muted tracking-widest mt-0.5">{sub}</p>
    </div>
  )
}

function BonusRow({
  q,
  ans,
}: {
  q: { id: string; question: string; unlock_date: string | null }
  ans: { answer: string; points_awarded: number | null } | undefined
}) {
  return (
    <div className="px-5 py-3.5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-wk-text leading-snug">{q.question}</p>
        {q.unlock_date && (
          <p className="font-mono text-[9px] text-wk-muted tracking-widest mt-0.5">{q.unlock_date}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`font-mono text-sm ${ans?.answer ? 'text-wk-gold font-bold' : 'text-wk-muted italic'}`}>
          {ans?.answer ?? '—'}
        </span>
        {ans?.points_awarded != null && <PtsBadge pts={ans.points_awarded} />}
      </div>
    </div>
  )
}

function PtsBadge({ pts }: { pts: number }) {
  return (
    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-widest shrink-0 ${
      pts > 0
        ? 'bg-wk-green/10 border-wk-green/30 text-wk-green'
        : 'bg-white/5 border-white/10 text-wk-muted'
    }`}>
      {pts}pt
    </span>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center">
      <p className="font-mono text-[10px] text-wk-muted tracking-widest">{children}</p>
    </div>
  )
}
