'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { savePredictions, saveGroupAdvancement } from '@/app/actions/predictions'
import GroupAdvancementModal from '@/components/predictions/group-advancement-modal'
import { getMatchPrediction } from '@/app/actions/ai-prediction'
import type { AiPrediction } from '@/app/actions/ai-prediction'

type Team = { id: string; name: string; flag_url: string; group_name: string }
type Match = {
  id: string
  kickoff_at: string
  match_number: number | null
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
}>

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function ptsBadgeClass(pts: number) {
  if (pts === 5) return 'bg-wk-green/10 border-wk-green/30 text-wk-green'
  if (pts > 0)   return 'bg-wk-gold/10 border-wk-gold/30 text-wk-gold'
  return 'bg-white/5 border-white/10 text-wk-muted'
}

export default function PredictionsClient({ matches, predMap, advancement, teams }: Props) {
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
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isPending, startTransition] = useTransition()

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
    setScores((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [side]: num },
    }))
  }

  function saveGroup() {
    const toSave = groupMatches
      .filter((m) => {
        const s = scores[m.id]
        return s?.home !== '' && s?.away !== '' && s !== undefined
      })
      .map((m) => ({
        matchId: m.id,
        home: Number(scores[m.id].home),
        away: Number(scores[m.id].away),
      }))

    startTransition(async () => {
      const result = await savePredictions(toSave)
      setToast({ msg: result.ok ? 'Opgeslagen!' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 3000)
    })
  }

  const advancementCount = advancement.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Fase 01 · Vooraf invullen</p>
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Voorspellingen</h1>
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {filledCount} / {matches.length} wedstrijden ingevuld
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded border border-white/20 bg-wk-surface px-4 py-2 text-sm font-mono font-medium text-wk-soft hover:border-wk-gold/50 hover:text-wk-gold transition-colors tracking-[0.12em] uppercase text-xs"
        >
          <span>⚽</span>
          Knockoutfase ({advancementCount}/32)
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
                onScoreChange={setScore}
              />
            )
          })}
        </div>

        {/* Save button */}
        <div className="px-5 py-4 border-t border-white/10 flex justify-end">
          <button
            onClick={saveGroup}
            disabled={isPending}
            className="rounded bg-wk-green px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? 'Opslaan…' : 'Groep opslaan'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-sm font-mono font-semibold shadow-lg text-white tracking-[0.12em] uppercase transition-all ${
          toast.ok ? 'bg-wk-green' : 'bg-wk-red'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Advancement modal */}
      {showModal && (
        <GroupAdvancementModal
          teams={teams}
          initialAdvancement={advancement}
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
  onScoreChange: (matchId: string, side: 'home' | 'away', val: string) => void
}

function MatchRow({ match, score, pts, locked, onScoreChange }: MatchRowProps) {
  const [showAi, setShowAi] = useState(false)
  const [aiState, setAiState] = useState<AiPrediction | 'loading' | 'error' | null>(null)

  async function handleAiToggle() {
    if (showAi) { setShowAi(false); return }
    setShowAi(true)
    if (aiState !== null) return  // already loaded or loading
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
            {format(new Date(match.kickoff_at), 'EEEE d MMMM · HH:mm', { locale: nl })}
          </p>
          {locked && (
            <span className="font-mono text-[10px] text-wk-gold tracking-[0.12em] uppercase border border-wk-gold/30 rounded-full px-2 py-0.5">
              🔒 Gesloten
            </span>
          )}
        </div>

        {/* Match row */}
        <div className="flex items-center gap-3">
          {/* Home team */}
          <div className="flex flex-1 items-center gap-2 justify-end">
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

          {/* Score inputs */}
          <div className="flex items-center gap-1.5 shrink-0">
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

          {/* Away team */}
          <div className="flex flex-1 items-center gap-2">
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

          {/* Points badge */}
          {pts !== null && pts !== undefined && (
            <span className={`shrink-0 font-mono text-[10px] font-bold px-2 py-1 rounded-full border tracking-[0.12em] uppercase ${ptsBadgeClass(pts)}`}>
              {pts} pt
            </span>
          )}
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
