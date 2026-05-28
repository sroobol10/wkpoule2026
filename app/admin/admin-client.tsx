'use client'

import { useState, useTransition } from 'react'
import { setMatchResult, setBonusCorrectAnswer, setKnockoutResult, autoFillGroupResults, clearAllGroupResults, scoreGroupAdvancement } from '@/app/actions/admin'
import { formatInAmsterdam } from '@/lib/format'

type Team = { id: string; name: string; code: string; flag_url: string; group_name: string }
type Match = {
  id: string
  stage: string
  kickoff_at: string
  match_number: number | null
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  result_entered: boolean
}
type BonusQuestion = {
  id: string
  question: string
  type: string
  correct_answer: string | null
  correct_answer_set: boolean
}

type Props = {
  matches: Match[]
  teams: Team[]
  questions: BonusQuestion[]
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
const KNOCKOUT_STAGES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
const STAGE_LABELS: Record<string, string> = {
  round_of_32:   'Ronde van 32',
  round_of_16:   'Achtste finales',
  quarter_final: 'Kwartfinales',
  semi_final:    'Halve finales',
  third_place:   'Derde plaats',
  final:         'Finale',
}

type Tab = 'groepsfase' | 'bonusvragen' | 'knockout'

export default function AdminClient({ matches, teams, questions }: Props) {
  const [tab, setTab] = useState<Tab>('groepsfase')
  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))

  const groupMatches    = matches.filter((m) => m.stage === 'group')
  const knockoutMatches = matches.filter((m) => KNOCKOUT_STAGES.includes(m.stage))

  const groupDone    = groupMatches.filter((m) => m.result_entered).length
  const bonusDone    = questions.filter((q) => q.correct_answer_set).length
  const knockoutDone = knockoutMatches.filter((m) => m.result_entered).length

  const tabs: { id: Tab; label: string; badge: string }[] = [
    { id: 'groepsfase',  label: 'Groepsfase',  badge: `${groupDone}/${groupMatches.length}` },
    { id: 'bonusvragen', label: 'Bonusvragen', badge: `${bonusDone}/${questions.length}` },
    { id: 'knockout',    label: 'Knockout',    badge: knockoutMatches.length > 0 ? `${knockoutDone}/${knockoutMatches.length}` : '–' },
  ]

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs tracking-[0.14em] uppercase border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-wk-gold text-wk-gold'
                : 'border-transparent text-wk-muted hover:text-wk-soft'
            }`}
          >
            {t.label}
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full border ${
              tab === t.id
                ? 'bg-wk-gold/10 border-wk-gold/30 text-wk-gold'
                : 'bg-white/5 border-white/10 text-wk-muted'
            }`}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {tab === 'groepsfase' && (
        <GroupTab matches={groupMatches} teamMap={teamMap} />
      )}
      {tab === 'bonusvragen' && (
        <BonusTab questions={questions} />
      )}
      {tab === 'knockout' && (
        <KnockoutTab matches={knockoutMatches} teamMap={teamMap} />
      )}
    </div>
  )
}

// ─── Group stage tab ──────────────────────────────────────────────────────────

function GroupTab({ matches, teamMap }: { matches: Match[]; teamMap: Record<string, Team> }) {
  const [activeGroup, setActiveGroup] = useState('A')
  const [isPending, startTransition] = useTransition()
  const [demoToast, setDemoToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [advToast, setAdvToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showDemoToast(msg: string, ok: boolean) {
    setDemoToast({ msg, ok })
    setTimeout(() => setDemoToast(null), 3000)
  }

  function handleAutoFill() {
    startTransition(async () => {
      const result = await autoFillGroupResults()
      showDemoToast(result.ok ? 'Auto-fill klaar!' : result.error, result.ok)
    })
  }

  function handleClearAll() {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    startTransition(async () => {
      const result = await clearAllGroupResults()
      showDemoToast(result.ok ? 'Alles geleegd.' : result.error, result.ok)
    })
  }

  function handleScoreAdvancement() {
    startTransition(async () => {
      const result = await scoreGroupAdvancement(activeGroup)
      setAdvToast({ msg: result.ok ? `Eindposities groep ${activeGroup} gescoord!` : result.error, ok: result.ok })
      setTimeout(() => setAdvToast(null), 4000)
    })
  }

  const groupMatches = matches.filter((m) => {
    const home = m.home_team_id ? teamMap[m.home_team_id] : null
    return home?.group_name === activeGroup
  })

  const groupComplete = groupMatches.length > 0 && groupMatches.every((m) => m.result_entered)

  const doneByGroup = (g: string) => {
    const gm = matches.filter((m) => {
      const h = m.home_team_id ? teamMap[m.home_team_id] : null
      return h?.group_name === g
    })
    return { done: gm.filter((m) => m.result_entered).length, total: gm.length }
  }

  return (
    <div className="space-y-4">
      {/* Demo toolbar */}
      <div className="flex items-center justify-end gap-2">
        {demoToast && (
          <span className={`font-mono text-[10px] tracking-[0.12em] ${demoToast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
            {demoToast.msg}
          </span>
        )}
        <button
          onClick={handleAutoFill}
          disabled={isPending}
          className="rounded bg-wk-green px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? '…' : 'Auto-fill'}
        </button>
        <button
          onClick={handleClearAll}
          disabled={isPending}
          className={`rounded border px-3 py-1.5 text-[10px] font-mono tracking-[0.12em] uppercase disabled:opacity-50 transition-colors ${
            confirmClear
              ? 'border-wk-red/50 bg-wk-red/10 text-wk-red hover:bg-wk-red/20'
              : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
          }`}
        >
          {confirmClear ? 'Zeker weten?' : 'Leegmaken'}
        </button>
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const { done, total } = doneByGroup(g)
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`relative rounded px-3 py-1.5 text-xs font-mono font-bold tracking-[0.14em] uppercase transition-colors ${
                activeGroup === g
                  ? 'bg-wk-surface border border-wk-gold/50 text-wk-gold'
                  : 'bg-wk-bg2 border border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
              }`}
            >
              {g}
              {done === total && total > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-wk-green text-white text-[7px]">✓</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="font-display text-sm text-wk-text uppercase tracking-wide">Groep {activeGroup}</span>
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
            {groupMatches.filter((m) => m.result_entered).length}/{groupMatches.length} ingevoerd
          </span>
        </div>
        <div className="divide-y divide-white/5">
          {groupMatches.map((match) => (
            <MatchResultRow key={match.id} match={match} teamMap={teamMap} knockout={false} />
          ))}
        </div>

        {/* Score eindposities — alleen zichtbaar als alle 6 wedstrijden zijn ingevoerd */}
        {groupComplete && (
          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">Eindposities scoren</p>
              <p className="font-mono text-[9px] text-wk-muted/60 tracking-widest mt-0.5">
                Kent 3 pt toe per correct voorspelde eindpositie in groep {activeGroup}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {advToast && (
                <span className={`font-mono text-[10px] tracking-[0.12em] ${advToast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
                  {advToast.msg}
                </span>
              )}
              <button
                onClick={handleScoreAdvancement}
                disabled={isPending}
                className="rounded bg-wk-gold/10 border border-wk-gold/30 px-4 py-2 text-[10px] font-mono font-semibold text-wk-gold tracking-[0.12em] uppercase hover:bg-wk-gold/20 disabled:opacity-50 transition-colors"
              >
                {isPending ? '…' : 'Score eindposities'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Match result row ─────────────────────────────────────────────────────────

function MatchResultRow({
  match,
  teamMap,
  knockout,
}: {
  match: Match
  teamMap: Record<string, Team>
  knockout: boolean
}) {
  const homeTeam = match.home_team_id ? teamMap[match.home_team_id] : null
  const awayTeam = match.away_team_id ? teamMap[match.away_team_id] : null

  const [editing, setEditing] = useState(false)
  const [home, setHome] = useState(String(match.home_score ?? ''))
  const [away, setAway] = useState(String(match.away_score ?? ''))
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function save() {
    const h = parseInt(home)
    const a = parseInt(away)
    if (isNaN(h) || isNaN(a)) return showToast('Voer geldige scores in.', false)

    startTransition(async () => {
      let result
      if (knockout) {
        // Determine winner from score (assumes no draws in knockout — or admin picks)
        const winnerId = h > a ? match.home_team_id! : match.away_team_id!
        result = await setKnockoutResult(match.id, h, a, winnerId)
      } else {
        result = await setMatchResult(match.id, h, a)
      }
      if (result.ok) {
        setEditing(false)
        showToast('Opgeslagen!', true)
      } else {
        showToast(result.error, false)
      }
    })
  }

  const homeName = homeTeam?.name ?? 'TBD'
  const awayName = awayTeam?.name ?? 'TBD'

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        {/* Match number + date */}
        <div className="shrink-0 w-8 text-center">
          <span className="font-mono text-[10px] text-wk-muted">#{match.match_number}</span>
        </div>

        {/* Teams + score */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.10em] mb-1">
            {formatInAmsterdam(match.kickoff_at, 'd MMM · HH:mm')}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-wk-text truncate flex-1 text-right">{homeName}</span>
            {match.result_entered && !editing ? (
              <span className="font-display text-base text-wk-gold shrink-0 tabular-nums">
                {match.home_score}–{match.away_score}
              </span>
            ) : editing ? (
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number" min={0} max={99} value={home}
                  onChange={(e) => setHome(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-10 text-center rounded bg-wk-bg2 border border-white/10 py-1 text-sm font-display text-wk-gold focus:border-wk-gold focus:outline-none transition"
                />
                <span className="text-wk-muted font-mono text-xs">:</span>
                <input
                  type="number" min={0} max={99} value={away}
                  onChange={(e) => setAway(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-10 text-center rounded bg-wk-bg2 border border-white/10 py-1 text-sm font-display text-wk-gold focus:border-wk-gold focus:outline-none transition"
                />
              </div>
            ) : (
              <span className="font-mono text-[10px] text-wk-muted shrink-0">–:–</span>
            )}
            <span className="text-sm text-wk-text truncate flex-1">{awayName}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2">
          {match.result_entered && !editing && (
            <span className="font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest uppercase">✓</span>
          )}
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={isPending}
                className="rounded bg-wk-green px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? '…' : 'OK'}
              </button>
              <button
                onClick={() => { setEditing(false); setHome(String(match.home_score ?? '')); setAway(String(match.away_score ?? '')) }}
                className="rounded border border-white/10 px-3 py-1 text-xs font-mono text-wk-muted hover:text-wk-soft transition-colors"
              >
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded border border-white/10 px-3 py-1 text-xs font-mono text-wk-muted hover:border-white/20 hover:text-wk-soft transition-colors"
            >
              {match.result_entered ? 'Wijzig' : 'Invoeren'}
            </button>
          )}
        </div>
      </div>

      {toast && (
        <p className={`mt-2 font-mono text-[10px] tracking-[0.12em] ${toast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
          {toast.msg}
        </p>
      )}
    </div>
  )
}

// ─── Bonus questions tab ──────────────────────────────────────────────────────

function BonusTab({ questions }: { questions: BonusQuestion[] }) {
  const pre   = questions.filter((q) => q.type === 'pre_tournament')
  const daily = questions.filter((q) => q.type === 'daily')

  return (
    <div className="space-y-6">
      {pre.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">Vóór het toernooi</p>
          <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
            {pre.map((q) => <BonusRow key={q.id} question={q} />)}
          </div>
        </section>
      )}
      {daily.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">Dagelijkse vragen</p>
          <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
            {daily.map((q) => <BonusRow key={q.id} question={q} />)}
          </div>
        </section>
      )}
      {questions.length === 0 && (
        <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Geen bonusvragen gevonden.</p>
      )}
    </div>
  )
}

function BonusRow({ question }: { question: BonusQuestion }) {
  const [editing, setEditing]   = useState(false)
  const [answer, setAnswer]     = useState(question.correct_answer ?? '')
  const [isPending, startTransition] = useTransition()
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null)

  function save() {
    if (!answer.trim()) return
    startTransition(async () => {
      const result = await setBonusCorrectAnswer(question.id, answer.trim())
      if (result.ok) {
        setEditing(false)
        setToast({ msg: 'Opgeslagen!', ok: true })
      } else {
        setToast({ msg: result.error, ok: false })
      }
      setTimeout(() => setToast(null), 3000)
    })
  }

  return (
    <div className="px-5 py-4">
      <p className="text-sm text-wk-text leading-snug mb-3">{question.question}</p>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Correct antwoord…"
              className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-1.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
            />
            <button
              onClick={save}
              disabled={isPending || !answer.trim()}
              className="rounded bg-wk-green px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? '…' : 'Opslaan'}
            </button>
            <button
              onClick={() => { setEditing(false); setAnswer(question.correct_answer ?? '') }}
              className="rounded border border-white/10 px-3 py-1.5 text-xs font-mono text-wk-muted hover:text-wk-soft transition-colors"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            {question.correct_answer_set ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest uppercase shrink-0">✓</span>
                <span className="text-sm text-wk-gold truncate">{question.correct_answer}</span>
              </div>
            ) : (
              <span className="font-mono text-xs text-wk-muted tracking-[0.12em] italic flex-1">Nog niet ingesteld</span>
            )}
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 rounded border border-white/10 px-3 py-1.5 text-xs font-mono text-wk-muted hover:border-white/20 hover:text-wk-soft transition-colors"
            >
              {question.correct_answer_set ? 'Wijzig' : 'Instellen'}
            </button>
          </>
        )}
      </div>
      {toast && (
        <p className={`mt-2 font-mono text-[10px] tracking-[0.12em] ${toast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
          {toast.msg}
        </p>
      )}
    </div>
  )
}

// ─── Knockout tab ─────────────────────────────────────────────────────────────

function KnockoutTab({ matches, teamMap }: { matches: Match[]; teamMap: Record<string, Team> }) {
  const availableStages = KNOCKOUT_STAGES.filter((s) => matches.some((m) => m.stage === s))

  if (availableStages.length === 0) {
    return (
      <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center">
        <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">
          Nog geen knockoutwedstrijden aangemaakt.
        </p>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] mt-2 opacity-60">
          Voeg wedstrijden toe aan de database na de groepsfase.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {availableStages.map((stage) => {
        const stageMatches = matches.filter((m) => m.stage === stage)
        return (
          <section key={stage}>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">{STAGE_LABELS[stage]}</p>
            <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
              {stageMatches.map((match) => (
                <MatchResultRow key={match.id} match={match} teamMap={teamMap} knockout={true} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
