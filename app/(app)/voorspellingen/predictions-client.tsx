'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { savePredictions, saveGroupAdvancement } from '@/app/actions/predictions'
import { toggleJoker } from '@/app/actions/jokers'
import GroupAdvancementModal from '@/components/predictions/group-advancement-modal'
import { getMatchPrediction } from '@/app/actions/ai-prediction'
import { formatInAmsterdam } from '@/lib/format'
import type { AiPrediction } from '@/app/actions/ai-prediction'

type Team = { id: string; name: string; flag_url: string; group_name: string }
type Match = {
  id: string
  kickoff_at: string
  match_number: number | null
  home_score: number | null
  away_score: number | null
  result_entered: boolean
  home_team: Team | null
  away_team: Team | null
}
type Prediction = { predicted_home: number; predicted_away: number; points_awarded: number | null }
type AdvancementEntry = { team_id: string; predicted_position: number }

type Props = Readonly<{
  matches: Match[]
  predMap: Record<string, Prediction>
  advancement: AdvancementEntry[]
  teams: Team[]
  jokerMatchIds: string[]
}>

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function ptsBadgeClass(pts: number) {
  if (pts >= 5) return 'bg-wk-green/10 border-wk-green/30 text-wk-green'  // exact (5pt) of joker exact (10pt)
  if (pts > 0)  return 'bg-wk-gold/10 border-wk-gold/30 text-wk-gold'
  return 'bg-white/5 border-white/10 text-wk-muted'
}

export default function PredictionsClient({ matches, predMap, advancement, teams, jokerMatchIds }: Props) {
  const [activeGroup, setActiveGroup] = useState('A')
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>(() => {
    const init: Record<string, { home: string; away: string }> = {}
    for (const [matchId, pred] of Object.entries(predMap)) {
      init[matchId] = {
        home: String(pred.predicted_home),
        away: String(pred.predicted_away),
      }
    }
    return init
  })
  const [showModal, setShowModal] = useState(false)
  const [showScoring, setShowScoring] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [jokerSet, setJokerSet] = useState<Set<string>>(() => new Set(jokerMatchIds))
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  async function handleJokerToggle(matchId: string) {
    const result = await toggleJoker(matchId)
    if (!result.ok) return

    const targetDate = (() => {
      const m = matches.find((x) => x.id === matchId)
      return m ? formatInAmsterdam(m.kickoff_at, 'yyyy-MM-dd') : null
    })()

    setJokerSet((prev) => {
      const next = new Set(prev)
      if (next.has(matchId)) {
        next.delete(matchId)
      } else {
        // Verwijder ook eventuele joker op een andere wedstrijd dezelfde dag
        if (targetDate) {
          for (const m of matches) {
            if (m.id !== matchId && formatInAmsterdam(m.kickoff_at, 'yyyy-MM-dd') === targetDate) {
              next.delete(m.id)
            }
          }
        }
        next.add(matchId)
      }
      return next
    })
  }

  const now = new Date()

  const groupMatches = matches.filter(
    (m) => m.home_team?.group_name === activeGroup
  )

  const filledCount = matches.filter((m) => {
    const s = scores[m.id]
    return s?.home !== '' && s?.away !== '' && s?.home !== undefined
  }).length

  function setScore(matchId: string, side: 'home' | 'away', val: string) {
    const num = val.replace(/\D/g, '').slice(0, 2)
    const current = scores[matchId] ?? { home: '', away: '' }
    const newScore = { ...current, [side]: num }
    setScores((prev) => ({ ...prev, [matchId]: newScore }))
    if (newScore.home !== '' && newScore.away !== '') {
      clearTimeout(autoSaveTimers.current[matchId])
      setSaveStatus('idle')
      autoSaveTimers.current[matchId] = setTimeout(async () => {
        setSaveStatus('saving')
        const result = await savePredictions([{ matchId, home: Number(newScore.home), away: Number(newScore.away) }])
        setSaveStatus(result.ok ? 'saved' : 'error')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }, 1500)
    }
  }

  function computeAutoFillPicks(): Record<string, [string | null, string | null, string | null]> {
    const result: Record<string, [string | null, string | null, string | null]> = {}
    const thirds: Array<{ group: string; teamId: string; points: number; gd: number; gf: number }> = []

    for (const group of GROUPS) {
      const gm = matches.filter((m) => m.home_team?.group_name === group)
      const st: Record<string, { points: number; gd: number; gf: number }> = {}

      for (const m of gm) {
        if (m.home_team) st[m.home_team.id] = st[m.home_team.id] ?? { points: 0, gd: 0, gf: 0 }
        if (m.away_team) st[m.away_team.id] = st[m.away_team.id] ?? { points: 0, gd: 0, gf: 0 }
      }

      for (const m of gm) {
        const s = scores[m.id]
        if (!s || s.home === '' || s.away === '' || !m.home_team || !m.away_team) continue
        const h = Number(s.home), aw = Number(s.away)
        st[m.home_team.id].gf += h; st[m.home_team.id].gd += h - aw
        st[m.away_team.id].gf += aw; st[m.away_team.id].gd += aw - h
        if (h > aw) st[m.home_team.id].points += 3
        else if (h < aw) st[m.away_team.id].points += 3
        else { st[m.home_team.id].points += 1; st[m.away_team.id].points += 1 }
      }

      const sorted = Object.entries(st)
        .sort(([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf)
      result[group] = [sorted[0]?.[0] ?? null, sorted[1]?.[0] ?? null, sorted[2]?.[0] ?? null]
      if (sorted[2]) thirds.push({ group, teamId: sorted[2][0], ...sorted[2][1] })
    }

    const best8 = new Set(
      [...thirds]
        .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf)
        .slice(0, 8)
        .map((t) => t.group)
    )
    for (const group of GROUPS) {
      if (!best8.has(group)) result[group] = [result[group][0], result[group][1], null]
    }

    return result
  }

  const advancementCount = advancement.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Fase 01 · Vooraf invullen</p>
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Groepsfase</h1>
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {filledCount} / {matches.length} wedstrijden ingevuld
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded border border-white/20 bg-wk-surface px-4 py-2 font-mono font-medium text-wk-soft hover:border-wk-gold/50 hover:text-wk-gold transition-colors tracking-[0.12em] uppercase text-xs"
        >
          <span>⚽</span>
          Wie gaan door? ({advancementCount}/32)
          {advancementCount < 32 && (
            <span className="ml-1 inline-flex items-center rounded-full bg-wk-gold/10 border border-wk-gold/30 px-2 py-0.5 text-[10px] font-mono text-wk-gold tracking-widest uppercase">
              Onvolledig
            </span>
          )}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-wk-green rounded-full transition-all"
          style={{ width: `${(filledCount / matches.length) * 100}%` }}
        />
      </div>

      {/* Scoring info */}
      <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
        <button
          onClick={() => setShowScoring((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">Puntentelling</span>
          <svg className={`w-3.5 h-3.5 text-wk-muted transition-transform ${showScoring ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showScoring && (
          <div className="border-t border-white/5 px-5 py-4 space-y-2.5">
            {[
              { label: 'Exacte uitslag',                        pts: '5 pt' },
              { label: 'Correct resultaat (W/G/V)',             pts: '2 pt' },
              { label: 'Correct resultaat + één doelpunttotaal', pts: '3 pt' },
              { label: 'Fout resultaat + één doelpunttotaal',   pts: '1 pt' },
              { label: 'Correcte eindpositie in de groep',      pts: '3 pt' },
              { label: 'Bonusvraag (voor toernooi)',            pts: '5 pt' },
              { label: 'Bonusvraag (dagelijks)',                pts: '2 pt' },
            ].map(({ label, pts }) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className="font-mono text-[10px] text-wk-soft tracking-widest">{label}</span>
                <span className="font-mono text-xs font-bold text-wk-gold shrink-0">{pts}</span>
              </div>
            ))}
            <p className="font-mono text-[9px] text-wk-muted tracking-widest pt-2 border-t border-white/5">
              Exacte uitslag = 5 pt · joker verdubbelt de punten van die wedstrijd
            </p>
          </div>
        )}
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const gMatches = matches.filter((m) => m.home_team?.group_name === g)
          const filled = gMatches.filter((m) => scores[m.id]?.home !== undefined && scores[m.id]?.home !== '').length
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
              {filled === gMatches.length && gMatches.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-wk-green text-white text-[7px] font-mono">✓</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Matches for active group */}
      <div className="bg-wk-surface rounded-xl border border-white/10 overflow-hidden">
        {/* Group header */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm text-wk-text uppercase tracking-wide">Groep {activeGroup}</span>
          </div>
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
            {groupMatches.filter((m) => scores[m.id]?.home !== undefined && scores[m.id]?.home !== '').length}/{groupMatches.length} ingevuld
          </span>
        </div>

        <div className="divide-y divide-white/5">
          {groupMatches.map((match) => {
            const locked = new Date(match.kickoff_at) <= now
            const score = scores[match.id]
            const pts = predMap[match.id]?.points_awarded

            return (
              <MatchRow
                key={match.id}
                match={match}
                score={score}
                pts={pts}
                locked={locked}
                hasJoker={jokerSet.has(match.id)}
                onScoreChange={setScore}
                onJokerToggle={handleJokerToggle}
              />
            )
          })}
        </div>

        {/* Auto-save status */}
        <div className="px-5 py-3 border-t border-white/10 flex justify-end items-center min-h-11">
          {saveStatus === 'saving' && (
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase animate-pulse">Opslaan…</span>
          )}
          {saveStatus === 'saved' && (
            <span className="font-mono text-[10px] text-wk-green tracking-[0.14em] uppercase">✓ Automatisch opgeslagen</span>
          )}
          {saveStatus === 'error' && (
            <span className="font-mono text-[10px] text-wk-red tracking-[0.14em] uppercase">Fout bij opslaan</span>
          )}
        </div>
      </div>

      {/* Inline group standings */}
      <GroupStandingsInline
        group={activeGroup}
        groupMatches={groupMatches}
        scores={scores}
        teams={teams}
        advancementPicks={computeAutoFillPicks()[activeGroup] ?? [null, null, null]}
      />

      {/* Advancement modal */}
      {showModal && (
        <GroupAdvancementModal
          teams={teams}
          initialAdvancement={advancement}
          autoFillPicks={computeAutoFillPicks()}
          onClose={() => setShowModal(false)}
          onSave={async (selections) => {
            const result = await saveGroupAdvancement(selections)
            if (result.ok) setShowModal(false)
            return result
          }}
        />
      )}
    </div>
  )
}

// ─── Match row with AI prediction ─────────────────────────────────────────────

type MatchRowProps = {
  match: Match
  score: { home: string; away: string } | undefined
  pts: number | null | undefined
  locked: boolean
  hasJoker: boolean
  onScoreChange: (matchId: string, side: 'home' | 'away', val: string) => void
  onJokerToggle: (matchId: string) => void
}

function MatchRow({ match, score, pts, locked, hasJoker, onScoreChange, onJokerToggle }: MatchRowProps) {
  const [showAi, setShowAi] = useState(false)
  const [aiState, setAiState] = useState<AiPrediction | 'loading' | 'error' | null>(null)

  const isExcludedDay = formatInAmsterdam(match.kickoff_at, 'yyyy-MM-dd') === '2026-06-11'
  const jokerable = !locked && !isExcludedDay

  async function handleAiToggle() {
    if (showAi) { setShowAi(false); return }
    setShowAi(true)
    if (aiState !== null) return
    setAiState('loading')
    const result = await getMatchPrediction(match.id)
    setAiState(result.ok ? result.prediction : 'error')
  }

  return (
    <div>
      {/* Date row */}
      <div className="px-5 pt-4 pb-0">
        <div className="flex items-center justify-center gap-2 mb-3">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">
            {formatInAmsterdam(match.kickoff_at, 'EEEE d MMMM · HH:mm')}
          </p>
          {locked && (
            <span className="font-mono text-[10px] text-wk-gold tracking-[0.12em] uppercase border border-wk-gold/30 rounded-full px-2 py-0.5">
              🔒 Gesloten
            </span>
          )}
          {jokerable && (
            <button
              onClick={() => onJokerToggle(match.id)}
              title={hasJoker ? 'Joker uitzetten' : 'Joker inzetten (verdubbelt punten)'}
              className={`font-mono text-[11px] transition-all rounded-full px-2 py-0.5 border ${
                hasJoker
                  ? 'text-wk-gold border-wk-gold/50 bg-wk-gold/10'
                  : 'text-wk-muted border-white/10 hover:text-wk-gold hover:border-wk-gold/30'
              }`}
            >
              ★
            </button>
          )}
          {hasJoker && locked && (
            <span className="font-mono text-[10px] text-wk-gold tracking-widest">★ Joker</span>
          )}
        </div>

        {/* Match row: teams en score in één flex-rij zodat items-center werkt */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 w-full">
            {/* Home team */}
            <div className="flex-1 flex items-center gap-2 justify-end">
              <span className="text-sm font-semibold text-wk-text text-right leading-tight">
                {match.home_team?.name}
              </span>
              {match.home_team?.flag_url && (
                <Image
                  src={match.home_team.flag_url}
                  alt={match.home_team.name}
                  width={28}
                  height={20}
                  className="rounded-sm object-cover shrink-0 w-7 h-5"
                />
              )}
            </div>

            {/* Midden: einduitslag of invoervelden */}
            <div className="shrink-0">
              {match.result_entered ? (
                <div className="flex items-center gap-1">
                  <span className="w-10 text-center font-display text-2xl text-wk-text">{match.home_score}</span>
                  <span className="font-mono text-base text-wk-muted">–</span>
                  <span className="w-10 text-center font-display text-2xl text-wk-text">{match.away_score}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={locked}
                    value={score?.home ?? ''}
                    onChange={(e) => onScoreChange(match.id, 'home', e.target.value)}
                    className="w-12 text-center rounded bg-wk-bg2 border border-white/10 py-1.5 text-sm font-display text-wk-gold disabled:text-wk-muted disabled:opacity-60 focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                    placeholder="–"
                  />
                  <span className="text-wk-muted font-mono text-sm">:</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={locked}
                    value={score?.away ?? ''}
                    onChange={(e) => onScoreChange(match.id, 'away', e.target.value)}
                    className="w-12 text-center rounded bg-wk-bg2 border border-white/10 py-1.5 text-sm font-display text-wk-gold disabled:text-wk-muted disabled:opacity-60 focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                    placeholder="–"
                  />
                </div>
              )}
            </div>

            {/* Away team */}
            <div className="flex-1 flex items-center gap-2">
              {match.away_team?.flag_url && (
                <Image
                  src={match.away_team.flag_url}
                  alt={match.away_team.name ?? ''}
                  width={28}
                  height={20}
                  className="rounded-sm object-cover shrink-0 w-7 h-5"
                />
              )}
              <span className="text-sm font-semibold text-wk-text leading-tight">
                {match.away_team?.name}
              </span>
            </div>
          </div>

          {/* Punten badge + eigen voorspelling (onder de rij) */}
          {(pts !== null && pts !== undefined) || (match.result_entered && score) ? (
            <div className="flex items-center gap-2">
              {pts !== null && pts !== undefined && (
                <span className={`font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full border tracking-[0.12em] uppercase ${ptsBadgeClass(pts)}`}>
                  {pts} pt
                </span>
              )}
              {match.result_entered && score && (
                <span className="font-mono text-[9px] text-wk-muted tracking-widest">
                  jouw: {score.home} – {score.away}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* AI toggle button */}
      <div className="px-5 pt-4 pb-4">
        <button
          onClick={handleAiToggle}
          className={`flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors w-full ${
            showAi ? 'text-wk-blue' : 'text-wk-muted hover:text-wk-soft'
          }`}
        >
          <span className="text-[11px]">⚡</span>
          AI voorspelling
          <svg
            className={`w-3 h-3 transition-transform ${showAi ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAi && (
          <AiPredictionPanel
            state={aiState}
            homeName={match.home_team?.name ?? ''}
            awayName={match.away_team?.name ?? ''}
          />
        )}
      </div>
    </div>
  )
}

// ─── AI prediction panel ──────────────────────────────────────────────────────

function AiPredictionPanel({
  state,
  homeName,
  awayName,
}: {
  state: AiPrediction | 'loading' | 'error' | null
  homeName: string
  awayName: string
}) {
  if (state === 'loading' || state === null) {
    return (
      <div className="mt-3 rounded-lg bg-wk-bg2 border border-white/10 px-4 py-4">
        <div className="flex items-center gap-2 text-wk-muted">
          <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="font-mono text-[10px] tracking-[0.12em]">Analyse wordt gegenereerd…</span>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="mt-3 rounded-lg bg-wk-red/5 border border-wk-red/20 px-4 py-3">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.12em]">Analyse kon niet worden geladen.</p>
      </div>
    )
  }

  const total = state.kansThuis + state.kansGelijkspel + state.kansUit
  const pThuis = total > 0 ? Math.round((state.kansThuis / total) * 100) : 0
  const pGelijk = total > 0 ? Math.round((state.kansGelijkspel / total) * 100) : 0
  const pUit    = 100 - pThuis - pGelijk

  return (
    <div className="mt-3 rounded-lg bg-wk-bg2 border border-wk-blue/20 overflow-hidden md:max-w-lg md:mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-wk-blue/5">
        <span className="text-[11px]">⚡</span>
        <span className="font-mono text-[10px] text-wk-blue tracking-[0.14em] uppercase font-bold">AI Voorspelling</span>
        <span className="ml-auto font-mono text-[9px] text-wk-muted tracking-widest uppercase">Op basis van FIFA-ranking & statistieken</span>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Predicted score */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase text-right">{homeName}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-display text-xl text-wk-gold">{state.homeScore}</span>
              <span className="font-mono text-sm text-wk-muted">–</span>
              <span className="font-display text-xl text-wk-gold">{state.awayScore}</span>
            </div>
            <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase">{awayName}</span>
          </div>
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.18em] uppercase">Voorspeld resultaat</p>
        </div>

        {/* Win probability bar */}
        <div>
          <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
            <div className="bg-wk-blue rounded-l-full transition-all" style={{ width: `${pThuis}%` }} />
            <div className="bg-white/20 transition-all" style={{ width: `${pGelijk}%` }} />
            <div className="bg-wk-gold/70 rounded-r-full transition-all" style={{ width: `${pUit}%` }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="font-mono text-[9px] text-wk-blue tracking-widest">{pThuis}% winst</span>
            <span className="font-mono text-[9px] text-wk-muted tracking-widest">{pGelijk}% gelijk</span>
            <span className="font-mono text-[9px] text-wk-gold tracking-widest">{pUit}% winst</span>
          </div>
        </div>

        {/* Analysis */}
        <p className="text-xs text-wk-soft leading-relaxed">{state.analyse}</p>

        {/* Key players */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-wk-surface border border-white/5 px-3 py-2">
            <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase mb-1">Sleutelspeler</p>
            <p className="text-xs text-wk-text leading-snug">{state.sleutelspelerThuis}</p>
          </div>
          <div className="rounded bg-wk-surface border border-white/5 px-3 py-2">
            <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase mb-1">Sleutelspeler</p>
            <p className="text-xs text-wk-text leading-snug">{state.sleutelspelerUit}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Inline group standings ───────────────────────────────────────────────────

function GroupStandingsInline({
  group,
  groupMatches,
  scores,
  teams,
  advancementPicks,
}: {
  group: string
  groupMatches: Match[]
  scores: Record<string, { home: string; away: string }>
  teams: Team[]
  advancementPicks: [string | null, string | null, string | null]
}) {
  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))

  const st: Record<string, { points: number; gd: number; gf: number }> = {}
  for (const m of groupMatches) {
    if (m.home_team) st[m.home_team.id] ??= { points: 0, gd: 0, gf: 0 }
    if (m.away_team) st[m.away_team.id] ??= { points: 0, gd: 0, gf: 0 }
  }

  let hasAnyScore = false
  for (const m of groupMatches) {
    const s = scores[m.id]
    if (!s || s.home === '' || s.away === '' || !m.home_team || !m.away_team) continue
    hasAnyScore = true
    const h = Number(s.home), a = Number(s.away)
    st[m.home_team.id].gf += h; st[m.home_team.id].gd += h - a
    st[m.away_team.id].gf += a; st[m.away_team.id].gd += a - h
    if (h > a) st[m.home_team.id].points += 3
    else if (h < a) st[m.away_team.id].points += 3
    else { st[m.home_team.id].points += 1; st[m.away_team.id].points += 1 }
  }

  const sorted = Object.entries(st)
    .sort(([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf)

  const advancingIds = new Set(advancementPicks.filter(Boolean) as string[])

  return (
    <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
          Voorspelde stand groep {group}
        </span>
        {!hasAnyScore && (
          <span className="font-mono text-[9px] text-wk-muted/60 tracking-widest uppercase italic">
            Vul wedstrijden in
          </span>
        )}
      </div>
      <div className="divide-y divide-white/5">
        {sorted.map(([teamId, stat], i) => {
          const team = teamMap[teamId]
          if (!team) return null
          const advances = advancingIds.has(teamId)
          const pos = i + 1
          return (
            <div key={teamId} className="flex items-center gap-3 px-5 py-2.5">
              <span className={`font-mono text-xs w-4 shrink-0 text-center ${pos <= 2 ? 'text-wk-green font-bold' : 'text-wk-muted'}`}>
                {pos}
              </span>
              {team.flag_url && (
                <Image src={team.flag_url} alt={team.name} width={22} height={15}
                  className="rounded-sm object-cover shrink-0" />
              )}
              <span className="flex-1 text-xs font-semibold text-wk-text truncate">{team.name}</span>
              {hasAnyScore && (
                <>
                  <span className="font-mono text-[10px] text-wk-muted w-6 text-center">{stat.points}pt</span>
                  <span className="font-mono text-[10px] text-wk-muted w-8 text-right">
                    {stat.gd > 0 ? `+${stat.gd}` : stat.gd}
                  </span>
                  <span className={`font-mono text-[9px] tracking-widest uppercase shrink-0 w-20 text-right ${
                    advances ? 'text-wk-green' : pos === 3 ? 'text-wk-gold' : 'text-wk-muted'
                  }`}>
                    {advances ? '→ Door' : pos === 3 ? 'Eventueel' : '✗ Uit'}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
