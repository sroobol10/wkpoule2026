'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import Image from 'next/image'
import { saveBracketPick, clearBracketSlots } from '@/app/actions/bracket'
import { BRACKET, THIRD_SLOT_GROUPS, assignThirdPlaceSlots } from '@/lib/bracket'

// ─── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; flag_url: string; group_name: string }
type AdvancementEntry = { team_id: string; predicted_position: number }
type BracketPickEntry = { slot: number; predicted_team_id: string; points_awarded?: number | null }

type Props = {
  teams: Team[]
  advancement: AdvancementEntry[]
  bracketPicks: BracketPickEntry[]
  locked: boolean
  actualWinners?: Record<number, string>
  advancedFromStage?: Record<string, string[]>
}

const STAGE_LABELS: Record<string, string> = {
  r32:         'Ronde van 32',
  r16:         'Achtste finales',
  qf:          'Kwartfinales',
  sf:          'Halve finales',
  third_place: 'Derde plaats',
  final:       'Finale',
}
const STAGE_SHORT: Record<string, string> = {
  r32:         'R32',
  r16:         'R16',
  qf:          'KF',
  sf:          'HF',
  third_place: '3e',
  final:       'FIN',
}
const STAGE_ORDER = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']

// ─── Bracket computation ──────────────────────────────────────────────────────

type ResolvedMatch = {
  slot: number
  stage: string
  home: string | null
  away: string | null
  winner: string | null
  loser: string | null
}

function computeBracket(
  advMap: Record<string, Record<number, string>>,
  thirdAssignment: Record<number, string>,
  picks: Record<number, string>
): Record<number, ResolvedMatch> {
  const resolved: Record<number, ResolvedMatch> = {}

  function resolveTeam(seed: string): string | null {
    if (seed.startsWith('W')) {
      const fromSlot = parseInt(seed.slice(1))
      return resolved[fromSlot]?.winner ?? null
    }
    if (seed.startsWith('L')) {
      const fromSlot = parseInt(seed.slice(1))
      return resolved[fromSlot]?.loser ?? null
    }
    if (seed.startsWith('3_')) {
      const slot = parseInt(seed.slice(2))
      const group = thirdAssignment[slot]
      return group ? (advMap[group]?.[3] ?? null) : null
    }
    // Group seed: '1A', '2B', etc.
    const pos = parseInt(seed[0])
    const group = seed[1]
    return advMap[group]?.[pos] ?? null
  }

  for (const match of BRACKET) {
    const home = resolveTeam(match.homeSeed)
    const away = resolveTeam(match.awaySeed)
    const winner = picks[match.slot] ?? null
    const loser = winner
      ? winner === home ? away : home
      : null

    resolved[match.slot] = { slot: match.slot, stage: match.stage, home, away, winner, loser }
  }

  return resolved
}

// ─── Dependency tracking ──────────────────────────────────────────────────────

// Given a slot that changes, return all downstream slots that depend on its winner/loser
function getDownstreamSlots(changedSlot: number): number[] {
  const downstream: number[] = []

  function collectDeps(seed: string): void {
    for (const match of BRACKET) {
      if (match.homeSeed === seed || match.awaySeed === seed) {
        downstream.push(match.slot)
        collectDeps(`W${match.slot}`)
        collectDeps(`L${match.slot}`)
      }
    }
  }

  collectDeps(`W${changedSlot}`)
  collectDeps(`L${changedSlot}`)
  return [...new Set(downstream)]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BracketClient({ teams, advancement, bracketPicks, locked, actualWinners = {}, advancedFromStage = {} }: Props) {
  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t]))

  // Build advancement map: group -> pos -> teamId
  const advMap: Record<string, Record<number, string>> = {}
  for (const entry of advancement) {
    const team = teamMap[entry.team_id]
    if (!team) continue
    const g = team.group_name
    if (!advMap[g]) advMap[g] = {}
    advMap[g][entry.predicted_position] = entry.team_id
  }

  // Count how many teams are picked at each position
  const pos12Count = Object.values(advMap).reduce(
    (acc, gm) => acc + (gm[1] ? 1 : 0) + (gm[2] ? 1 : 0), 0
  )
  const pos3Count = Object.values(advMap).reduce(
    (acc, gm) => acc + (gm[3] ? 1 : 0), 0
  )
  const advancementComplete = pos12Count === 24 && pos3Count === 8

  // Compute third-place slot assignment
  const thirdGroups = Object.entries(advMap)
    .filter(([, gm]) => gm[3])
    .map(([g]) => g)
    .sort() // deterministic ordering for consistent slot assignment
  const thirdAssignment = assignThirdPlaceSlots(thirdGroups)

  // Bracket picks state
  const [picks, setPicks] = useState<Record<number, string>>(() =>
    Object.fromEntries(bracketPicks.map((p) => [p.slot, p.predicted_team_id]))
  )

  // Points per slot (bracket_predictions.points_awarded)
  const ptsPerSlot = Object.fromEntries(
    bracketPicks
      .filter((p) => p.points_awarded != null)
      .map((p) => [p.slot, p.points_awarded!])
  )
  const [isPending, startTransition] = useTransition()
  const [activeStage, setActiveStage] = useState('r32')

  const bracket = computeBracket(advMap, thirdAssignment, picks)

  const totalPicks = Object.keys(picks).length

  function pickWinner(slot: number, teamId: string) {
    if (locked || isPending) return
    const current = picks[slot]
    if (current === teamId) return

    // Clear downstream picks that depended on the previous winner
    const downstream = current ? getDownstreamSlots(slot) : []
    const newPicks = { ...picks }
    for (const ds of downstream) delete newPicks[ds]
    newPicks[slot] = teamId
    setPicks(newPicks)

    startTransition(async () => {
      if (downstream.length > 0) await clearBracketSlots(downstream)
      await saveBracketPick(slot, teamId)
    })
  }

  if (!advancementComplete) {
    return (
      <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-wk-gold/10 border border-wk-gold/20 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-wk-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="font-display text-base text-wk-text uppercase">Knockoutfase niet volledig</p>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
          Vul eerst alle 32 doorgestoten teams in via de Voorspellingen-pagina
        </p>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
          {pos12Count}/24 groepswinnaars/nummers 2 · {pos3Count}/8 beste nummers 3
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">
            Fase 02 · Vóór het toernooi
          </p>
          <h2 className="font-display text-xl text-wk-text uppercase leading-none">Knock-out voorspelling</h2>
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {totalPicks} / 32 wedstrijden voorspeld
          </p>
        </div>
        {locked && (
          <span className="font-mono text-[10px] text-wk-gold border border-wk-gold/30 rounded-full px-3 py-1 tracking-widest uppercase">
            🔒 Gesloten
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-wk-green rounded-full transition-all"
          style={{ width: `${(totalPicks / 32) * 100}%` }}
        />
      </div>

      {/* Stage tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STAGE_ORDER.map((stage) => {
          const stageMatches = BRACKET.filter((m) => m.stage === stage)
          const done = stageMatches.filter((m) => picks[m.slot]).length
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
              {done === stageMatches.length && (
                <span className="text-wk-green text-[9px]">✓</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Stage label */}
      <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
        {STAGE_LABELS[activeStage]}
      </p>

      {/* Matches */}
      <div className="space-y-3">
        {BRACKET.filter((m) => m.stage === activeStage).map((matchDef) => {
          const m = bracket[matchDef.slot]
          // Teams die deze ronde zijn doorgegaan (o.b.v. doorstroommodel, niet match-winnaar)
          const advancedSet = new Set(advancedFromStage[matchDef.stage] ?? [])
          return (
            <BracketMatchCard
              key={matchDef.slot}
              match={m}
              teamMap={teamMap}
              locked={locked}
              isPending={isPending}
              onPick={(teamId) => pickWinner(m.slot, teamId)}
              actualWinnerId={actualWinners[matchDef.slot] ?? null}
              advancedTeams={advancedSet}
              stageHasResults={(advancedFromStage[matchDef.stage] ?? []).length > 0}
              pts={ptsPerSlot[matchDef.slot] ?? null}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────

function BracketMatchCard({
  match,
  teamMap,
  locked,
  isPending,
  onPick,
  actualWinnerId,
  advancedTeams,
  stageHasResults,
  pts,
}: {
  match: ResolvedMatch
  teamMap: Record<string, Team>
  locked: boolean
  isPending: boolean
  onPick: (teamId: string) => void
  actualWinnerId: string | null
  advancedTeams: Set<string>
  stageHasResults: boolean
  pts: number | null
}) {
  const homeTeam = match.home ? teamMap[match.home] : null
  const awayTeam = match.away ? teamMap[match.away] : null
  const bothKnown = !!homeTeam && !!awayTeam

  const userPick = match.winner
  // Correct = jouw pick staat in de teams die deze ronde halen (ongeacht slot)
  const isCorrect = stageHasResults && !!userPick && advancedTeams.has(userPick)
  const isWrong   = stageHasResults && !!userPick && !advancedTeams.has(userPick)

  return (
    <div className={`bg-wk-surface border rounded-xl overflow-hidden ${
      isCorrect ? 'border-wk-green/40' : isWrong ? 'border-wk-red/30' : 'border-white/10'
    }`}>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">
          Wedstrijd {match.slot}
        </span>
        <div className="flex items-center gap-2">
          {isCorrect && (
            <span className="font-mono text-[9px] font-bold text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest uppercase">
              ✓ Correct
            </span>
          )}
          {isWrong && (
            <span className="font-mono text-[9px] font-bold text-wk-red border border-wk-red/30 rounded-full px-2 py-0.5 tracking-widest uppercase">
              ✗ Fout
            </span>
          )}
          {pts !== null && (
            <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-[0.12em] uppercase ${
              pts > 0
                ? 'bg-wk-green/10 border-wk-green/30 text-wk-green'
                : 'bg-white/5 border-white/10 text-wk-muted'
            }`}>
              {pts} pt
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {!bothKnown ? (
          <div className="flex items-center justify-center gap-4 py-1">
            <TbdSlot label={homeTeam ? homeTeam.name : 'TBD'} flag={homeTeam?.flag_url} />
            <span className="font-mono text-[10px] text-wk-muted tracking-widest">VS</span>
            <TbdSlot label={awayTeam ? awayTeam.name : 'TBD'} flag={awayTeam?.flag_url} />
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            <TeamBtn
              team={homeTeam}
              selected={match.winner === homeTeam.id}
              isActualWinner={actualWinnerId === homeTeam.id}
              advanced={advancedTeams.has(homeTeam.id)}
              stageHasResults={stageHasResults}
              disabled={locked || !bothKnown}
              isPending={isPending}
              onClick={() => onPick(homeTeam.id)}
            />
            <div className="flex items-center justify-center px-1">
              <span className="font-mono text-[10px] text-wk-muted tracking-widest">VS</span>
            </div>
            <TeamBtn
              team={awayTeam}
              selected={match.winner === awayTeam.id}
              isActualWinner={actualWinnerId === awayTeam.id}
              advanced={advancedTeams.has(awayTeam.id)}
              stageHasResults={stageHasResults}
              disabled={locked || !bothKnown}
              isPending={isPending}
              onClick={() => onPick(awayTeam.id)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TeamBtn({
  team,
  selected,
  isActualWinner,
  advanced,
  stageHasResults,
  disabled,
  isPending,
  onClick,
}: {
  team: Team
  selected: boolean
  isActualWinner: boolean   // won this specific match (for display)
  advanced: boolean         // reached the next round (for scoring)
  stageHasResults: boolean  // is this stage concluded?
  disabled: boolean
  isPending: boolean
  onClick: () => void
}) {
  const pickCorrect = selected && stageHasResults && advanced
  const pickWrong   = selected && stageHasResults && !advanced

  // Pop-animatie wanneer team net geselecteerd wordt
  const [popping, setPopping] = useState(false)
  const prevSelected = useRef(selected)
  useEffect(() => {
    if (selected && !prevSelected.current) {
      setPopping(true)
      const t = setTimeout(() => setPopping(false), 350)
      return () => clearTimeout(t)
    }
    prevSelected.current = selected
  }, [selected])

  let colorClass: string
  if (pickCorrect) {
    colorClass = 'border-wk-green/60 bg-wk-green/10 text-wk-green'
  } else if (pickWrong) {
    colorClass = 'border-wk-red/30 bg-wk-red/5 text-wk-muted'
  } else if (selected) {
    colorClass = 'border-wk-gold/50 bg-wk-gold/10 text-wk-gold'
  } else if (stageHasResults && advanced && !selected) {
    // Doorgegaan, maar niet de pick van de gebruiker
    colorClass = 'border-wk-gold/30 bg-wk-bg2 text-wk-soft'
  } else {
    colorClass = 'border-white/10 bg-wk-bg2 text-wk-soft'
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || isPending}
      className={`flex-1 flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-colors disabled:cursor-default ${colorClass} ${
        !disabled ? 'hover:border-white/25 hover:bg-white/5 cursor-pointer' : ''
      } ${popping ? 'animate-pop' : ''}`}
    >
      <Image
        src={team.flag_url}
        alt={team.name}
        width={32}
        height={20}
        className="w-8 h-5 object-cover rounded-sm"
      />
      <span className={`font-mono text-[10px] tracking-[0.12em] uppercase text-center leading-tight ${pickWrong ? 'line-through opacity-60' : ''}`}>
        {team.name}
      </span>
      {pickCorrect && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-green">✓ Correct</span>
      )}
      {pickWrong && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-red">✗ Uitgeschakeld</span>
      )}
      {!stageHasResults && selected && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-gold">★ Mijn keuze</span>
      )}
      {stageHasResults && advanced && !selected && isActualWinner && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-muted">Uitslag</span>
      )}
    </button>
  )
}

function TbdSlot({ label, flag }: { label: string; flag?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-2 flex-1">
      {flag ? (
        <Image src={flag} alt={label} width={32} height={20} className="w-8 h-5 object-cover rounded-sm" />
      ) : (
        <div className="w-8 h-5 rounded-sm bg-wk-bg2 border border-white/10" />
      )}
      <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase text-center">
        {label}
      </span>
    </div>
  )
}
