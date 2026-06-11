'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setMatchResult, setBonusCorrectAnswer, updateBonusAnswerConfig, setKnockoutResult, autoFillGroupResults, autoFillGroupResultsUntil, clearAllGroupResults, scoreGroupAdvancement, scoreAllGroupAdvancement, assignNextKoRoundTeams, simulateFullKo, rescoreBracket, clearKoResults, createKoMatches, saveMatchCards, awardCountryBonus, setDeelnemerActive } from '@/app/actions/admin'
import { formatInAmsterdam } from '@/lib/format'
import { AvatarCircle } from '@/components/avatar-circle'

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
  description: string | null
  type: string
  unlock_date: string | null
  correct_answer: string | null
  correct_answer_set: boolean
  answer_type: string
  answer_options: string[] | null
}

type CardEntry = { match_id: string; team_id: string; yellow_cards: number; red_cards: number }

type Participant = {
  id: string
  username: string
  avatarUrl: string | null
  isActive: boolean
  email: string
  pouleIds: string[]
  predictions: number
  jokers: number
  bracketPicks: number
  bonusAnswers: number
}

type PouleRef = { id: string; name: string; isGeneral: boolean }

type Props = {
  matches: Match[]
  teams: Team[]
  questions: BonusQuestion[]
  cardsByMatch: Record<string, CardEntry[]>
  participants: Participant[]
  allPoules: PouleRef[]
  totalGroupMatches: number
  totalBonusQuestions: number
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
const KNOCKOUT_STAGES = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']
const STAGE_LABELS: Record<string, string> = {
  r32:         'Ronde van 32',
  r16:         'Achtste finales',
  qf:          'Kwartfinales',
  sf:          'Halve finales',
  third_place: 'Derde plaats',
  final:       'Finale',
}

type Tab = 'groepsfase' | 'bonusvragen' | 'knockout' | 'deelnemers'

export default function AdminClient({ matches, teams, questions, cardsByMatch, participants, allPoules, totalGroupMatches, totalBonusQuestions }: Props) {
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
    { id: 'deelnemers',  label: 'Deelnemers',  badge: `${participants.length}` },
  ]

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 overflow-x-auto scrollbar-none pb-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2.5 font-mono text-[10px] sm:text-xs tracking-[0.14em] uppercase border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-wk-gold text-wk-gold'
                : 'border-transparent text-wk-muted hover:text-wk-soft'
            }`}
          >
            {t.label}
            <span className={`font-mono text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full border ${
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
        <GroupTab matches={groupMatches} teamMap={teamMap} cardsByMatch={cardsByMatch} />
      )}
      {tab === 'bonusvragen' && (
        <BonusTab questions={questions} />
      )}
      {tab === 'knockout' && (
        <KnockoutTab matches={knockoutMatches} teamMap={teamMap} cardsByMatch={cardsByMatch} />
      )}
      {tab === 'deelnemers' && (
        <DeelnemersTab
          participants={participants}
          allPoules={allPoules}
          totalGroupMatches={totalGroupMatches}
          totalBonusQuestions={totalBonusQuestions}
        />
      )}
    </div>
  )
}

// ─── Group stage tab ──────────────────────────────────────────────────────────

function GroupTab({ matches, teamMap, cardsByMatch }: { matches: Match[]; teamMap: Record<string, Team>; cardsByMatch: Record<string, CardEntry[]> }) {
  const router = useRouter()
  const [activeGroup, setActiveGroup] = useState('A')
  const [isPending, startTransition] = useTransition()
  const [demoToast, setDemoToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [advToast, setAdvToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [fillDate, setFillDate] = useState('2026-06-18')

  function showDemoToast(msg: string, ok: boolean) {
    setDemoToast({ msg, ok })
    setTimeout(() => setDemoToast(null), 4000)
  }

  function handleAutoFill() {
    startTransition(async () => {
      const result = await autoFillGroupResults()
      showDemoToast(result.ok ? 'Auto-fill klaar!' : result.error, result.ok)
      if (result.ok) router.refresh()
    })
  }

  function handleAutoFillUntil() {
    startTransition(async () => {
      const iso = new Date(fillDate + 'T23:59:59Z').toISOString()
      const result = await autoFillGroupResultsUntil(iso)
      showDemoToast(result.ok ? `Auto-fill tot ${fillDate} klaar!` : result.error, result.ok)
      if (result.ok) router.refresh()
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
      if (result.ok) router.refresh()
    })
  }

  function handleScoreAdvancement() {
    startTransition(async () => {
      const result = await scoreGroupAdvancement(activeGroup)
      setAdvToast({ msg: result.ok ? `Eindposities groep ${activeGroup} gescoord!` : result.error, ok: result.ok })
      setTimeout(() => setAdvToast(null), 4000)
    })
  }

  function handleScoreAllAdvancement() {
    startTransition(async () => {
      const result = await scoreAllGroupAdvancement()
      setAdvToast({ msg: result.ok ? 'Alle eindposities gescoord!' : result.error, ok: result.ok })
      setTimeout(() => setAdvToast(null), 4000)
      if (result.ok) router.refresh()
    })
  }

  const allGroupsDone = matches.every((m) => m.result_entered)

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
      {/* Simulatie-toolbar */}
      <div className="space-y-2">
        <div className="flex items-center flex-wrap gap-2">
          {demoToast && (
            <span className={`font-mono text-[10px] tracking-[0.12em] flex-1 ${demoToast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
              {demoToast.msg}
            </span>
          )}
          <button
            onClick={handleAutoFill}
            disabled={isPending}
            className="rounded bg-wk-green px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? '…' : 'Auto-fill alles'}
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

        {/* Auto-fill tot datum */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase shrink-0">Tot datum:</span>
          <input
            type="date"
            value={fillDate}
            onChange={(e) => setFillDate(e.target.value)}
            min="2026-06-11"
            max="2026-06-29"
            className="rounded bg-wk-bg2 border border-white/10 px-2 py-1 text-[10px] font-mono text-wk-text focus:border-wk-gold focus:outline-none"
          />
          <button
            onClick={handleAutoFillUntil}
            disabled={isPending || !fillDate}
            className="rounded bg-wk-blue/80 px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? '…' : 'Auto-fill tot datum'}
          </button>
          {allGroupsDone && (
            <button
              onClick={handleScoreAllAdvancement}
              disabled={isPending}
              className="rounded bg-wk-gold/10 border border-wk-gold/30 px-3 py-1.5 text-[10px] font-mono font-semibold text-wk-gold tracking-[0.12em] uppercase hover:bg-wk-gold/20 disabled:opacity-50 transition-colors"
            >
              {isPending ? '…' : 'Score alle eindposities'}
            </button>
          )}
        </div>
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
            <MatchResultRow key={match.id} match={match} teamMap={teamMap} knockout={false} existingCards={cardsByMatch[match.id] ?? []} />
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
  existingCards = [],
}: {
  match: Match
  teamMap: Record<string, Team>
  knockout: boolean
  existingCards?: CardEntry[]
}) {
  const homeTeam = match.home_team_id ? teamMap[match.home_team_id] : null
  const awayTeam = match.away_team_id ? teamMap[match.away_team_id] : null

  const [editing, setEditing] = useState(false)
  const [home, setHome] = useState(String(match.home_score ?? ''))
  const [away, setAway] = useState(String(match.away_score ?? ''))
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Kaarten
  const homeCards = existingCards.find((c) => c.team_id === match.home_team_id)
  const awayCards = existingCards.find((c) => c.team_id === match.away_team_id)
  const [showCards, setShowCards] = useState(false)
  const [homeYellow, setHomeYellow] = useState(String(homeCards?.yellow_cards ?? 0))
  const [homeRed,    setHomeRed]    = useState(String(homeCards?.red_cards    ?? 0))
  const [awayYellow, setAwayYellow] = useState(String(awayCards?.yellow_cards ?? 0))
  const [awayRed,    setAwayRed]    = useState(String(awayCards?.red_cards    ?? 0))
  const [cardToast, setCardToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function saveScore() {
    const h = parseInt(home)
    const a = parseInt(away)
    if (isNaN(h) || isNaN(a)) return showToast('Voer geldige scores in.', false)

    startTransition(async () => {
      let result
      if (knockout) {
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

  function saveCards() {
    if (!match.home_team_id || !match.away_team_id) return
    startTransition(async () => {
      const result = await saveMatchCards(
        match.id,
        match.home_team_id!,
        match.away_team_id!,
        parseInt(homeYellow) || 0,
        parseInt(homeRed)    || 0,
        parseInt(awayYellow) || 0,
        parseInt(awayRed)    || 0,
      )
      setCardToast({ msg: result.ok ? 'Kaarten opgeslagen!' : result.error, ok: result.ok })
      setTimeout(() => setCardToast(null), 3000)
    })
  }

  const homeName = homeTeam?.name ?? 'TBD'
  const awayName = awayTeam?.name ?? 'TBD'

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        {/* Match number */}
        <div className="shrink-0 w-8 text-center">
          <span className="font-mono text-[10px] text-wk-muted">#{match.match_number}</span>
        </div>

        {/* Teams + score */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-wk-muted tracking-widest mb-1">
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
              <button onClick={saveScore} disabled={isPending}
                className="rounded bg-wk-green px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {isPending ? '…' : 'OK'}
              </button>
              <button onClick={() => { setEditing(false); setHome(String(match.home_score ?? '')); setAway(String(match.away_score ?? '')) }}
                className="rounded border border-white/10 px-3 py-1 text-xs font-mono text-wk-muted hover:text-wk-soft transition-colors">
                ✕
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              className="rounded border border-white/10 px-3 py-1 text-xs font-mono text-wk-muted hover:border-white/20 hover:text-wk-soft transition-colors">
              {match.result_entered ? 'Wijzig' : 'Invoeren'}
            </button>
          )}
          {/* Kaarten-toggle (alleen zichtbaar als uitslag bekend) */}
          {match.result_entered && homeTeam && awayTeam && (
            <button
              onClick={() => setShowCards((v) => !v)}
              title="Kaarten invoeren"
              className={`rounded border px-2 py-1 text-[10px] font-mono transition-colors ${
                showCards
                  ? 'border-wk-gold/40 bg-wk-gold/10 text-wk-gold'
                  : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
              }`}
            >
              🟨
            </button>
          )}
        </div>
      </div>

      {toast && (
        <p className={`mt-1 font-mono text-[10px] tracking-[0.12em] ${toast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
          {toast.msg}
        </p>
      )}

      {/* Kaartinvoer */}
      {showCards && homeTeam && awayTeam && (
        <div className="mt-2 ml-11 rounded-lg bg-wk-bg2 border border-white/10 px-4 py-3 space-y-2">
          {[
            { label: homeName, yellow: homeYellow, red: homeRed, setYellow: setHomeYellow, setRed: setHomeRed },
            { label: awayName, yellow: awayYellow, red: awayRed, setYellow: setAwayYellow, setRed: setAwayRed },
          ].map(({ label, yellow, red, setYellow, setRed }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-wk-muted w-28 truncate shrink-0">{label}</span>
              <label className="flex items-center gap-1">
                <span className="text-xs">🟨</span>
                <input
                  type="number" min={0} max={20} value={yellow}
                  onChange={(e) => setYellow(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-10 text-center rounded bg-wk-surface border border-white/10 py-0.5 text-xs font-mono text-wk-gold focus:border-wk-gold focus:outline-none transition"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-xs">🟥</span>
                <input
                  type="number" min={0} max={5} value={red}
                  onChange={(e) => setRed(e.target.value.replace(/\D/g, '').slice(0, 1))}
                  className="w-10 text-center rounded bg-wk-surface border border-white/10 py-0.5 text-xs font-mono text-wk-gold focus:border-wk-gold focus:outline-none transition"
                />
              </label>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveCards} disabled={isPending}
              className="rounded bg-wk-gold/10 border border-wk-gold/30 px-3 py-1 text-[10px] font-mono font-semibold text-wk-gold tracking-[0.12em] uppercase hover:bg-wk-gold/20 disabled:opacity-50 transition-colors">
              {isPending ? '…' : 'Kaarten opslaan'}
            </button>
            {cardToast && (
              <span className={`font-mono text-[10px] tracking-[0.12em] ${cardToast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
                {cardToast.msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Deelnemers tab ───────────────────────────────────────────────────────────

function DeelnemersTab({
  participants,
  allPoules,
  totalGroupMatches,
  totalBonusQuestions,
}: {
  participants: Participant[]
  allPoules: PouleRef[]
  totalGroupMatches: number
  totalBonusQuestions: number
}) {
  const [filterPoule, setFilterPoule] = useState<string | null>(null)

  const privatePouleIds = new Set(allPoules.map((p) => p.id))

  const allComplete = (p: Participant) =>
    p.predictions === totalGroupMatches &&
    p.jokers === 12 &&
    p.bracketPicks === 32 &&
    p.bonusAnswers >= totalBonusQuestions

  const visible = filterPoule === '__geen_prive__'
    ? participants.filter((p) => !p.pouleIds.some((id) => privatePouleIds.has(id)))
    : filterPoule
    ? participants.filter((p) => p.pouleIds.includes(filterPoule))
    : participants

  return (
    <div className="space-y-4">
      {/* Poule-filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterPoule(null)}
          className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
            filterPoule === null
              ? 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
              : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
          }`}
        >
          Alle ({participants.length})
        </button>
        <button
          onClick={() => setFilterPoule('__geen_prive__')}
          className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
            filterPoule === '__geen_prive__'
              ? 'bg-wk-red/10 border-wk-red/40 text-wk-red'
              : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
          }`}
        >
          Geen privé-poule ({participants.filter((p) => !p.pouleIds.some((id) => privatePouleIds.has(id))).length})
        </button>
        {allPoules.map((poule) => {
          const count = participants.filter((p) => p.pouleIds.includes(poule.id)).length
          return (
            <button
              key={poule.id}
              onClick={() => setFilterPoule(poule.id)}
              className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
                filterPoule === poule.id
                  ? 'bg-wk-green/10 border-wk-green/40 text-wk-green'
                  : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
              }`}
            >
              {poule.name} ({count})
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="font-mono text-[10px] text-wk-muted tracking-widest uppercase">
          {visible.length} deelnemers · {visible.filter(allComplete).length} volledig ingevuld
        </p>
        <a
          href="/admin/uitdraai"
          target="_blank"
          className="rounded border border-white/10 px-3 py-1.5 text-[10px] font-mono text-wk-muted hover:border-white/20 hover:text-wk-soft transition-colors tracking-[0.12em] uppercase"
        >
          📄 Uitdraai openen
        </a>
      </div>

      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase">Deelnemer</th>
                <th className="px-3 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-right">Wedstrijden</th>
                <th className="px-3 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-right">Jokers</th>
                <th className="px-3 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-right">Bracket</th>
                <th className="px-3 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-right">Bonus</th>
                <th className="px-3 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center">Status</th>
                <th className="px-3 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center">Actief</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((p) => {
                const complete = allComplete(p)
                const wedstrOk = p.predictions === totalGroupMatches
                const jokersOk = p.jokers === 12
                const bracketOk = p.bracketPicks === 32
                const bonusOk   = p.bonusAnswers >= totalBonusQuestions

                return (
                  <tr key={p.id} className={`${complete ? 'bg-wk-green/5' : ''} ${!p.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AvatarCircle username={p.username} avatarUrl={p.avatarUrl} size={36} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-wk-text whitespace-nowrap">{p.username}</p>
                          {p.email && (
                            <p className="font-mono text-[10px] text-wk-muted tracking-wide truncate">{p.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-xs ${wedstrOk ? 'text-wk-green font-bold' : 'text-wk-muted'}`}>
                        {p.predictions}/{totalGroupMatches}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-xs ${jokersOk ? 'text-wk-green font-bold' : p.jokers > 0 ? 'text-wk-gold' : 'text-wk-muted'}`}>
                        {p.jokers}/12
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-xs ${bracketOk ? 'text-wk-green font-bold' : p.bracketPicks > 0 ? 'text-wk-gold' : 'text-wk-muted'}`}>
                        {p.bracketPicks}/32
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-xs ${bonusOk ? 'text-wk-green font-bold' : p.bonusAnswers > 0 ? 'text-wk-gold' : 'text-wk-muted'}`}>
                        {p.bonusAnswers}/{totalBonusQuestions}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {complete
                        ? <span className="font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest">✓ Klaar</span>
                        : <span className="font-mono text-[9px] text-wk-gold border border-wk-gold/30 rounded-full px-2 py-0.5 tracking-widest">Onvolledig</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-center">
                      <ActiveToggle userId={p.id} isActive={p.isActive} />
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={`/admin/deelnemer/${p.id}`}
                        target="_blank"
                        className="font-mono text-[9px] text-wk-muted hover:text-wk-gold tracking-widest uppercase transition-colors"
                      >
                        Bekijk →
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Aan/uit-knop: inactieve deelnemers tellen nergens mee in de klassementen
function ActiveToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await setDeelnemerActive(userId, !isActive)
          router.refresh()
        })
      }
      title={isActive ? 'Zet op inactief — telt dan niet mee in de klassementen' : 'Zet op actief'}
      className={`font-mono text-[9px] tracking-widest uppercase rounded-full px-2.5 py-0.5 border transition-colors disabled:opacity-50 ${
        isActive
          ? 'text-wk-green border-wk-green/30 hover:border-wk-green'
          : 'text-wk-red border-wk-red/30 hover:border-wk-red'
      }`}
    >
      {isPending ? '…' : isActive ? '✓ Actief' : '✗ Inactief'}
    </button>
  )
}

// ─── Bonus questions tab ──────────────────────────────────────────────────────

function BonusTab({ questions }: { questions: BonusQuestion[] }) {
  const pre   = questions.filter((q) => q.type === 'pre_tournament')
  const daily = questions.filter((q) => q.type === 'daily')
    .sort((a, b) => (a.unlock_date ?? '').localeCompare(b.unlock_date ?? ''))

  return (
    <div className="space-y-6">
      {pre.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Vóór het toernooi <span className="text-wk-muted/50">· {pre.length} vragen</span>
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
            {pre.map((q) => <BonusRow key={q.id} question={q} />)}
          </div>
        </section>
      )}
      {daily.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Dagelijkse vragen <span className="text-wk-muted/50">· {daily.length} vragen</span>
          </p>
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

function isCountryBased(question: string) {
  const q = question.toLowerCase()
  return q.includes('kaartenkoning') || q.includes('desastreuze') || q.includes('goalgettergigant')
}

const ANSWER_TYPE_LABELS: Record<string, string> = {
  free: 'Vrij tekst',
  options: 'Keuze',
  yesno: 'Ja / Nee',
}

function BonusRow({ question }: { question: BonusQuestion }) {
  const [editingAnswer, setEditingAnswer]   = useState(false)
  const [editingConfig, setEditingConfig]   = useState(false)
  const [answer, setAnswer]                 = useState(question.correct_answer ?? '')
  const [answerType, setAnswerType]         = useState<'free' | 'options' | 'yesno'>(
    (question.answer_type as 'free' | 'options' | 'yesno') ?? 'free'
  )
  const [optionsText, setOptionsText]       = useState((question.answer_options ?? []).join('\n'))
  const [isPending, startTransition]        = useTransition()
  const [toast, setToast]                   = useState<{ msg: string; ok: boolean } | null>(null)

  const countryBased = isCountryBased(question.question)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function saveAnswer() {
    if (!answer.trim()) return
    startTransition(async () => {
      const result = await setBonusCorrectAnswer(question.id, answer.trim())
      if (result.ok) { setEditingAnswer(false); showToast('Opgeslagen!', true) }
      else showToast(result.error, false)
    })
  }

  function award() {
    startTransition(async () => {
      const result = await awardCountryBonus(question.id)
      showToast(result.ok ? 'Punten uitgekeerd!' : result.error, result.ok)
    })
  }

  function saveConfig() {
    const opts = answerType === 'options'
      ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
      : null
    startTransition(async () => {
      const result = await updateBonusAnswerConfig(question.id, answerType, opts)
      if (result.ok) { setEditingConfig(false); showToast('Configuratie opgeslagen!', true) }
      else showToast(result.error, false)
    })
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Vraag + meta */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-wk-text leading-snug">{question.question}</p>
          {question.description && (
            <p className="font-mono text-[10px] text-wk-muted tracking-widest mt-0.5 leading-relaxed">{question.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {question.unlock_date && (
            <span className="font-mono text-[9px] text-wk-muted border border-white/10 rounded-full px-2 py-0.5 tracking-widest">
              {question.unlock_date}
            </span>
          )}
          <span className={`font-mono text-[9px] border rounded-full px-2 py-0.5 tracking-widest ${
            question.answer_type === 'options' ? 'text-wk-blue border-wk-blue/30' :
            question.answer_type === 'yesno'   ? 'text-wk-gold border-wk-gold/30' :
            'text-wk-muted border-white/10'
          }`}>
            {ANSWER_TYPE_LABELS[question.answer_type] ?? 'Vrij tekst'}
          </span>
        </div>
      </div>

      {/* Antwoordtype configuratie */}
      {editingConfig ? (
        <div className="rounded-lg border border-white/10 bg-wk-bg2 p-3 space-y-3">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">Antwoordtype</p>
          <div className="flex gap-2">
            {(['free', 'options', 'yesno'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAnswerType(t)}
                className={`flex-1 rounded border px-2 py-1.5 font-mono text-[10px] tracking-widest transition-colors ${
                  answerType === t
                    ? 'border-wk-gold/50 bg-wk-gold/10 text-wk-gold'
                    : 'border-white/10 text-wk-muted hover:border-white/20'
                }`}
              >
                {ANSWER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {answerType === 'options' && (
            <div>
              <p className="font-mono text-[10px] text-wk-muted tracking-widest mb-1">Opties — één per regel</p>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={5}
                placeholder="Optie 1&#10;Optie 2&#10;Optie 3"
                className="w-full rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition resize-none font-mono"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={saveConfig}
              disabled={isPending}
              className="rounded bg-wk-green px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? '…' : 'Opslaan'}
            </button>
            <button
              onClick={() => { setEditingConfig(false); setAnswerType((question.answer_type as 'free' | 'options' | 'yesno') ?? 'free'); setOptionsText((question.answer_options ?? []).join('\n')) }}
              className="rounded border border-white/10 px-3 py-1.5 text-xs font-mono text-wk-muted hover:text-wk-soft transition-colors"
            >
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingConfig(true)}
          className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-widest underline underline-offset-2 transition-colors"
        >
          Antwoordtype configureren
        </button>
      )}

      {/* Correct antwoord instellen */}
      {countryBased ? (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="font-mono text-[10px] text-wk-muted tracking-widest italic flex-1">
            Punten worden automatisch berekend uit wedstrijdstatistieken
          </p>
          <button
            onClick={award}
            disabled={isPending}
            className="shrink-0 rounded bg-wk-gold/10 border border-wk-gold/30 px-3 py-1.5 text-[10px] font-mono font-semibold text-wk-gold tracking-[0.12em] uppercase hover:bg-wk-gold/20 disabled:opacity-50 transition-colors"
          >
            {isPending ? '…' : 'Bereken en keer uit'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {editingAnswer ? (
            <>
              {/* KEUZE/JA-NEE: kies uit de vaste opties zodat het antwoord altijd
                  exact matcht met wat deelnemers konden invullen */}
              {question.answer_type === 'options' && question.answer_options?.length ? (
                <select
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-1.5 text-sm text-wk-text focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                >
                  <option value="" disabled>Kies het juiste antwoord…</option>
                  {question.answer_options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : question.answer_type === 'yesno' ? (
                <select
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-1.5 text-sm text-wk-text focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                >
                  <option value="" disabled>Kies het juiste antwoord…</option>
                  <option value="Ja">Ja</option>
                  <option value="Nee">Nee</option>
                </select>
              ) : (
                <input
                  type="text" value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveAnswer()}
                  placeholder="Correct antwoord…"
                  className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-1.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                />
              )}
              <button onClick={saveAnswer} disabled={isPending || !answer.trim()}
                className="rounded bg-wk-green px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {isPending ? '…' : 'Opslaan'}
              </button>
              <button onClick={() => { setEditingAnswer(false); setAnswer(question.correct_answer ?? '') }}
                className="rounded border border-white/10 px-3 py-1.5 text-xs font-mono text-wk-muted hover:text-wk-soft transition-colors">
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
                <span className="font-mono text-xs text-wk-muted tracking-[0.12em] italic flex-1">Correct antwoord nog niet ingesteld</span>
              )}
              <button onClick={() => setEditingAnswer(true)}
                className="shrink-0 rounded border border-white/10 px-3 py-1.5 text-xs font-mono text-wk-muted hover:border-white/20 hover:text-wk-soft transition-colors">
                {question.correct_answer_set ? 'Wijzig' : 'Instellen'}
              </button>
            </>
          )}
        </div>
      )}

      {toast && (
        <p className={`font-mono text-[10px] tracking-[0.12em] ${toast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
          {toast.msg}
        </p>
      )}
    </div>
  )
}

// ─── Knockout tab ─────────────────────────────────────────────────────────────

function KnockoutTab({ matches, teamMap, cardsByMatch }: { matches: Match[]; teamMap: Record<string, Team>; cardsByMatch: Record<string, CardEntry[]> }) {
  const router = useRouter()
  const availableStages = KNOCKOUT_STAGES.filter((s) => matches.some((m) => m.stage === s))
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function handleAssignNextRound() {
    startTransition(async () => {
      const result = await assignNextKoRoundTeams()
      setToast({ msg: result.ok ? 'Volgende ronde ingevuld!' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 4000)
      if (result.ok) router.refresh()
    })
  }

  function handleSimulateFullKo() {
    startTransition(async () => {
      const result = await simulateFullKo()
      setToast({ msg: result.ok ? 'KO-fase volledig gesimuleerd!' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 5000)
      if (result.ok) router.refresh()
    })
  }

  function handleRescoreBracket() {
    startTransition(async () => {
      const result = await rescoreBracket()
      setToast({ msg: result.ok ? 'Bracket herscoord!' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 4000)
      if (result.ok) router.refresh()
    })
  }

  function handleCreateKoMatches() {
    startTransition(async () => {
      const result = await createKoMatches()
      setToast({ msg: result.ok ? 'KO-wedstrijden aangemaakt!' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 5000)
      if (result.ok) router.refresh()
    })
  }

  function handleClearKo() {
    startTransition(async () => {
      const result = await clearKoResults()
      setToast({ msg: result.ok ? 'KO-fase verwijderd. Klik "Maak KO-wedstrijden aan" voor een nieuwe simulatie.' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 6000)
      if (result.ok) router.refresh()
    })
  }

  if (availableStages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center flex-wrap gap-2">
          {toast && (
            <span className={`font-mono text-[10px] tracking-[0.12em] flex-1 ${toast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
              {toast.msg}
            </span>
          )}
          <button
            onClick={handleAssignNextRound}
            disabled={isPending}
            className="rounded bg-wk-blue/80 px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? '…' : 'Vul volgende ronde in'}
          </button>
          <button
            onClick={handleSimulateFullKo}
            disabled={isPending}
            className="rounded bg-wk-green px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? '…' : 'Simuleer volledige KO'}
          </button>
        </div>
        <div className="bg-wk-surface border border-white/10 rounded-xl p-6 text-center space-y-4">
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">
            Geen KO-wedstrijden aangemaakt.
          </p>
          <button
            onClick={handleCreateKoMatches}
            disabled={isPending}
            className="rounded bg-wk-green px-4 py-2 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? '…' : 'Maak KO-wedstrijden aan'}
          </button>
          <p className="font-mono text-[9px] text-wk-muted/50 tracking-widest">
            Vereist dat alle groepsuitslagen zijn ingevoerd
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center flex-wrap gap-2">
        {toast && (
          <span className={`font-mono text-[10px] tracking-[0.12em] flex-1 ${toast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
            {toast.msg}
          </span>
        )}
        <button
          onClick={handleAssignNextRound}
          disabled={isPending}
          className="rounded bg-wk-blue/80 px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? '…' : 'Vul volgende ronde in'}
        </button>
        <button
          onClick={handleSimulateFullKo}
          disabled={isPending}
          className="rounded bg-wk-green px-3 py-1.5 text-[10px] font-mono font-semibold text-white tracking-[0.12em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? '…' : 'Simuleer volledige KO'}
        </button>
        <button
          onClick={handleRescoreBracket}
          disabled={isPending}
          className="rounded bg-wk-gold/10 border border-wk-gold/30 px-3 py-1.5 text-[10px] font-mono font-semibold text-wk-gold tracking-[0.12em] uppercase hover:bg-wk-gold/20 disabled:opacity-50 transition-colors"
        >
          {isPending ? '…' : 'Herscore bracket'}
        </button>
        <button
          onClick={handleClearKo}
          disabled={isPending}
          className="rounded border border-wk-red/30 px-3 py-1.5 text-[10px] font-mono text-wk-red tracking-[0.12em] uppercase hover:bg-wk-red/10 disabled:opacity-50 transition-colors"
        >
          {isPending ? '…' : 'KO leegmaken'}
        </button>
      </div>
      {availableStages.map((stage) => {
        const stageMatches = matches.filter((m) => m.stage === stage)
        return (
          <section key={stage}>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">{STAGE_LABELS[stage]}</p>
            <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
              {stageMatches.map((match) => (
                <MatchResultRow key={match.id} match={match} teamMap={teamMap} knockout={true} existingCards={cardsByMatch[match.id] ?? []} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
