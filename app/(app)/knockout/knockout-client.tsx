'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { saveKnockoutPrediction } from '@/app/actions/knockout'
import { formatInAmsterdam } from '@/lib/format'
import BracketClient from './bracket-client'

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
type LiveTeam = { id: string; name: string; code: string; flag_url: string }
type LivePrediction = { match_id: string; predicted_winner_id: string; points_awarded: number | null }
type AllTeam = { id: string; name: string; flag_url: string; group_name: string }
type AdvancementEntry = { team_id: string; predicted_position: number }
type BracketPickEntry = { slot: number; predicted_team_id: string }

type Props = {
  // Live knockout matches (post-group stage)
  matches: Match[]
  liveTeams: LiveTeam[]
  livePredictions: LivePrediction[]
  // Bracket prediction (pre-tournament)
  allTeams: AllTeam[]
  advancement: AdvancementEntry[]
  bracketPicks: BracketPickEntry[]
  groupStageStartsAt: string | null
  anyMatchPlayed?: boolean
  actualWinners?: Record<number, string>
  advancedFromStage?: Record<string, string[]>
}

const STAGE_ORDER = ['r32', 'r16', 'qf', 'sf', 'final']
const STAGE_LABELS: Record<string, string> = {
  r32:   'Ronde van 32',
  r16:   'Achtste finales',
  qf:    'Kwartfinales',
  sf:    'Halve finales',
  final: 'Finale',
}
const STAGE_SHORT: Record<string, string> = {
  r32:   'R32',
  r16:   'R16',
  qf:    'KF',
  sf:    'HF',
  final: 'FIN',
}

export default function KnockoutClient({
  matches,
  liveTeams,
  livePredictions,
  allTeams,
  advancement,
  bracketPicks,
  groupStageStartsAt,
  anyMatchPlayed = false,
  actualWinners = {},
  advancedFromStage = {},
}: Props) {
  // Bracket is op slot zodra de eerste groepswedstrijd gespeeld is (niet puur op tijd)
  const bracketLocked = anyMatchPlayed || (
    groupStageStartsAt ? new Date(groupStageStartsAt) <= new Date() : false
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Knock-out fase</p>
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Knock-out voorspelling</h1>
        {bracketLocked && (
          <span className="inline-flex items-center gap-1.5 mt-2 font-mono text-[10px] text-wk-gold border border-wk-gold/30 rounded-full px-3 py-1 tracking-widest uppercase">
            🔒 Gesloten
          </span>
        )}
      </div>

      <KoScoringInfo />

      <BracketClient
        teams={allTeams}
        advancement={advancement}
        bracketPicks={bracketPicks}
        locked={bracketLocked}
        actualWinners={actualWinners}
        advancedFromStage={advancedFromStage}
      />
    </div>
  )
}

// ─── Live section ─────────────────────────────────────────────────────────────

function LiveSection({
  matches,
  teams,
  predictions,
}: {
  matches: Match[]
  teams: LiveTeam[]
  predictions: LivePrediction[]
}) {
  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))
  const predMap = Object.fromEntries(predictions.map((p) => [p.match_id, p]))

  const availableStages = STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s))
  const [activeStage, setActiveStage] = useState(availableStages[0] ?? 'r32')

  if (matches.length === 0) {
    return (
      <div className="space-y-4">
        <KoScoringInfo />
        <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-wk-gold/10 border border-wk-gold/20 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-wk-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="font-display text-base text-wk-text uppercase">Nog niet beschikbaar</p>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
            De knockoutfase start na de groepsfase · juli 2026
          </p>
        </div>
      </div>
    )
  }

  const stageMatches = matches.filter((m) => m.stage === activeStage)
  const predCount = predictions.length

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-wk-blue/20 bg-wk-blue/5 px-4 py-3">
        <span className="text-base shrink-0">👆</span>
        <p className="font-mono text-[10px] text-wk-blue tracking-[0.12em] leading-relaxed">
          Klik op het land waarvan jij denkt dat het doorgaat naar de volgende ronde
        </p>
      </div>

      {/* Scoring */}
      <KoScoringInfo />

      <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">
        {predCount} / {matches.length} voorspellingen
      </p>

      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {availableStages.map((stage) => {
          const count = matches.filter((m) => m.stage === stage).length
          const done  = predictions.filter((p) =>
            matches.find((m) => m.id === p.match_id && m.stage === stage)
          ).length
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(stage)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase border transition-colors ${
                activeStage === stage
                  ? 'bg-wk-gold/10 border-wk-gold/50 text-wk-gold'
                  : 'bg-wk-surface border-white/10 text-wk-muted hover:text-wk-soft'
              }`}
            >
              {STAGE_SHORT[stage]}
              {done === count && count > 0 && (
                <span className="text-wk-green text-[9px]">✓</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
        {STAGE_LABELS[activeStage] ?? activeStage}
      </p>

      <div className="space-y-3">
        {stageMatches.map((match) => (
          <LiveMatchCard
            key={match.id}
            match={match}
            homeTeam={match.home_team_id ? teamMap[match.home_team_id] : null}
            awayTeam={match.away_team_id ? teamMap[match.away_team_id] : null}
            prediction={predMap[match.id] ?? null}
          />
        ))}
      </div>
    </div>
  )
}

function LiveMatchCard({
  match,
  homeTeam,
  awayTeam,
  prediction,
}: {
  match: Match
  homeTeam: LiveTeam | null
  awayTeam: LiveTeam | null
  prediction: LivePrediction | null
}) {
  const [isPending, startTransition] = useTransition()
  const [localWinnerId, setLocalWinnerId] = useState(prediction?.predicted_winner_id ?? null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const kickoff = new Date(match.kickoff_at)
  const closed  = kickoff <= new Date()
  const pts     = prediction?.points_awarded

  function pick(teamId: string) {
    if (closed || isPending) return
    setLocalWinnerId(teamId)
    startTransition(async () => {
      const result = await saveKnockoutPrediction(match.id, teamId)
      if (!result.ok) {
        setLocalWinnerId(prediction?.predicted_winner_id ?? null)
        setToast({ msg: result.error, ok: false })
        setTimeout(() => setToast(null), 3000)
      }
    })
  }

  const teamsUnknown = !homeTeam || !awayTeam

  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">
            {formatInAmsterdam(match.kickoff_at, 'EEEE d MMM · HH:mm')}
          </p>
          <div className="flex items-center gap-2">
            {pts !== null && pts !== undefined && (
              <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-[0.12em] uppercase ${
                pts > 0
                  ? 'bg-wk-green/10 border-wk-green/30 text-wk-green'
                  : 'bg-white/5 border-white/10 text-wk-muted'
              }`}>
                {pts} pt
              </span>
            )}
            {closed && pts === null && (
              <span className="font-mono text-[10px] text-wk-gold border border-wk-gold/30 rounded-full px-2 py-0.5 tracking-widest uppercase">
                Gespeeld
              </span>
            )}
          </div>
        </div>

        {teamsUnknown ? (
          <div className="flex items-center justify-center gap-4 py-2">
            <TbdSlot />
            <span className="font-mono text-[10px] text-wk-muted tracking-widest">VS</span>
            <TbdSlot />
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            <LiveTeamButton
              team={homeTeam}
              selected={localWinnerId === homeTeam.id}
              correct={match.result_entered ? match.home_score! > match.away_score! : null}
              disabled={closed}
              isPending={isPending}
              onClick={() => pick(homeTeam.id)}
            />
            <div className="flex items-center justify-center px-1">
              <span className="font-mono text-[10px] text-wk-muted tracking-widest">VS</span>
            </div>
            <LiveTeamButton
              team={awayTeam}
              selected={localWinnerId === awayTeam.id}
              correct={match.result_entered ? match.away_score! > match.home_score! : null}
              disabled={closed}
              isPending={isPending}
              onClick={() => pick(awayTeam.id)}
            />
          </div>
        )}

        {closed && !localWinnerId && !teamsUnknown && (
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] mt-3 text-center italic">
            Geen voorspelling ingediend
          </p>
        )}
      </div>

      {toast && (
        <div className={`px-5 py-2 font-mono text-[10px] font-semibold text-white tracking-[0.12em] uppercase ${toast.ok ? 'bg-wk-green' : 'bg-wk-red'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function LiveTeamButton({
  team,
  selected,
  correct,
  disabled,
  isPending,
  onClick,
}: {
  team: LiveTeam
  selected: boolean
  correct: boolean | null
  disabled: boolean
  isPending: boolean
  onClick: () => void
}) {
  let colorClass = 'border-white/10 bg-wk-bg2 text-wk-soft'
  if (selected && correct === null)  colorClass = 'border-wk-gold/50 bg-wk-gold/10 text-wk-gold'
  if (selected && correct === true)  colorClass = 'border-wk-green/50 bg-wk-green/10 text-wk-green'
  if (selected && correct === false) colorClass = 'border-wk-red/40 bg-wk-red/5 text-wk-muted line-through'

  return (
    <button
      onClick={onClick}
      disabled={disabled || isPending}
      className={`flex-1 flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-colors disabled:cursor-default ${colorClass} ${
        !disabled ? 'hover:border-white/20 hover:bg-white/5 cursor-pointer' : ''
      }`}
    >
      <Image
        src={team.flag_url}
        alt={team.name}
        width={32}
        height={20}
        className="w-8 h-5 object-cover rounded-sm"
      />
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-center leading-tight">
        {team.name}
      </span>
      {selected && (
        <span className={`font-mono text-[9px] tracking-widest uppercase ${
          correct === true ? 'text-wk-green' : correct === false ? 'text-wk-red' : 'text-wk-gold'
        }`}>
          {correct === true ? '✓ Correct' : correct === false ? '✗ Fout' : '★ Mijn keuze'}
        </span>
      )}
    </button>
  )
}

function TbdSlot() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-3">
      <div className="w-8 h-5 rounded-sm bg-wk-bg2 border border-white/10" />
      <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase">TBD</span>
    </div>
  )
}

// ─── KO scoring info ──────────────────────────────────────────────────────────

const KO_SCORING = [
  { label: 'Laatste 32',    pts: '15 punten' },
  { label: 'Laatste 16',    pts: '25 punten' },
  { label: 'Kwartfinale',   pts: '50 punten' },
  { label: 'Halve finale',  pts: '100 punten' },
  { label: 'Troostfinale',  pts: '50 punten' },
  { label: 'Finale',        pts: '200 punten' },
]

function KoScoringInfo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">Puntentelling</span>
        <svg className={`w-3.5 h-3.5 text-wk-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-white/5 px-5 py-4 space-y-2.5">
          {KO_SCORING.map(({ label, pts }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] text-wk-soft tracking-widest">{label}</span>
              <span className="font-mono text-xs font-bold text-wk-gold shrink-0">{pts}</span>
            </div>
          ))}
          <p className="font-mono text-[9px] text-wk-muted tracking-widest pt-2 border-t border-white/5">
            Aantal te verdienen punten per correct voorspelde winnaar in desbetreffende ronde. Ongeacht of je dit land in exact de juiste wedstrijd hebt voorspeld.
          </p>
        </div>
      )}
    </div>
  )
}
