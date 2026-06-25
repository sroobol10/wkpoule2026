'use client'

import { Fragment, useState, useTransition, useEffect, useRef } from 'react'
import Image from 'next/image'
import { saveBracketPick, clearBracketSlots } from '@/app/actions/bracket'
import { BRACKET, KO_KICKOFFS, assignThirdPlaceSlots } from '@/lib/bracket'
import { formatInAmsterdam } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; flag_url: string; group_name: string }
type AdvancementEntry = { team_id: string; predicted_position: number }
type BracketPickEntry = { slot: number; predicted_team_id: string; points_awarded?: number | null }

type SlotDistRow = { teamId: string; place: number; winner: number }

type Props = {
  teams: Team[]
  advancement: AdvancementEntry[]
  bracketPicks: BracketPickEntry[]
  locked: boolean
  actualWinners?: Record<number, string>
  advancedFromStage?: Record<string, string[]>
  slotDist?: Record<number, SlotDistRow[]>
}

const STAGE_LABELS: Record<string, string> = {
  r32:         'Ronde van 32',
  r16:         'Achtste finales',
  qf:          'Kwartfinales',
  sf:          'Halve finales',
  third_place: 'Derde plaats',
  final:       'Finale',
}

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

export default function BracketClient({ teams, advancement, bracketPicks, locked, actualWinners = {}, advancedFromStage = {}, slotDist = {} }: Props) {
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

  const bracket = computeBracket(advMap, thirdAssignment, picks)

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
    const allGroupsFilled = pos12Count === 24
    // Hoeveel groepen heeft de gebruiker volledig ingevuld (pos 1 én pos 2 bekend)
    const completeGroups = Object.values(advMap).filter((gm) => gm[1] && gm[2]).length
    return (
      <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-wk-gold/10 border border-wk-gold/20 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-wk-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="font-display text-base text-wk-text uppercase">Knockoutfase niet volledig</p>
        {allGroupsFilled ? (
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
            Ga naar <a href="/voorspellingen" className="text-wk-gold underline underline-offset-2">Voorspellingen</a>, pas één uitslag aan en zet hem terug — dan worden de beste nummers 3 automatisch bijgewerkt.
          </p>
        ) : (
          <>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
              Vul eerst alle 12 groepen in via de{" "}
              <a href="/voorspellingen" className="text-wk-gold underline underline-offset-2">Voorspellingen-pagina</a>
            </p>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
              {completeGroups}/12 groepen volledig ingevuld
            </p>
          </>
        )}
      </div>
    )
  }

  // Alle wedstrijden onder elkaar in chronologische volgorde
  const ordered = [...BRACKET].sort((a, b) =>
    (KO_KICKOFFS[a.slot] ?? '').localeCompare(KO_KICKOFFS[b.slot] ?? '') || a.slot - b.slot
  )

  return (
    <div className="space-y-3">
      {ordered.map((matchDef, idx) => {
        const m = bracket[matchDef.slot]
        // Teams die deze ronde zijn doorgegaan (o.b.v. doorstroommodel, niet match-winnaar)
        const advancedSet = new Set(advancedFromStage[matchDef.stage] ?? [])
        // Banner boven elke nieuwe ronde, met extra witruimte ertussen
        const newStage = matchDef.stage !== (ordered[idx - 1]?.stage ?? null)
        return (
          <Fragment key={matchDef.slot}>
            {newStage && <RoundBanner stage={matchDef.stage} first={idx === 0} />}
            <BracketMatchCard
              match={m}
              teamMap={teamMap}
              locked={locked}
              isPending={isPending}
              onPick={(teamId) => pickWinner(m.slot, teamId)}
              actualWinnerId={actualWinners[matchDef.slot] ?? null}
              kickoffAt={KO_KICKOFFS[matchDef.slot] ?? null}
              advancedTeams={advancedSet}
              stageHasResults={(advancedFromStage[matchDef.stage] ?? []).length > 0}
              pts={ptsPerSlot[matchDef.slot] ?? null}
              dist={slotDist[matchDef.slot] ?? null}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

// ─── Ronde-banner ───────────────────────────────────────────────────────────
// Markeert het begin van een nieuwe knockout-ronde zodat de fasering van het
// toernooi visueel naar voren komt.
function RoundBanner({ stage, first }: { stage: string; first: boolean }) {
  return (
    <div className={first ? '' : 'pt-6'}>
      <div className="flex items-center gap-3 rounded-xl border border-wk-gold/25 bg-wk-gold/[0.06] px-4 py-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-wk-gold shrink-0" />
        <span className="font-mono text-xs sm:text-sm font-bold text-wk-gold uppercase tracking-[0.2em] leading-none">
          {STAGE_LABELS[stage] ?? stage}
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-wk-gold/30 to-transparent" />
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
  kickoffAt,
  advancedTeams,
  stageHasResults,
  pts,
  dist,
}: {
  match: ResolvedMatch
  teamMap: Record<string, Team>
  locked: boolean
  isPending: boolean
  onPick: (teamId: string) => void
  actualWinnerId: string | null
  kickoffAt: string | null
  advancedTeams: Set<string>
  stageHasResults: boolean
  pts: number | null
  dist: SlotDistRow[] | null
}) {
  const homeTeam = match.home ? teamMap[match.home] : null
  const awayTeam = match.away ? teamMap[match.away] : null
  const bothKnown = !!homeTeam && !!awayTeam

  const userPick = match.winner

  // "Wie koos wat" standaard open; klapt 48u na de aftrap automatisch in
  const collapsedByTime = !!kickoffAt && Date.now() > new Date(kickoffAt).getTime() + 48 * 60 * 60 * 1000
  const [distOpen, setDistOpen] = useState(!collapsedByTime)
  // Correct = jouw pick staat in de teams die deze ronde halen (ongeacht slot)
  const isCorrect = stageHasResults && !!userPick && advancedTeams.has(userPick)
  const isWrong   = stageHasResults && !!userPick && !advancedTeams.has(userPick)

  return (
    <div className={`bg-wk-surface border rounded-xl overflow-hidden ${
      isCorrect ? 'border-wk-green/40' : isWrong ? 'border-wk-red/30' : 'border-white/10'
    }`}>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase shrink-0">
            Wedstrijd {match.slot}
          </span>
          <span className="font-mono text-[9px] text-wk-gold/70 tracking-widest uppercase shrink-0">
            {STAGE_LABELS[match.stage] ?? match.stage}
          </span>
          {kickoffAt && (
            <span className="font-mono text-[9px] text-wk-muted/60 tracking-widest truncate">
              · {formatInAmsterdam(kickoffAt, 'd MMM HH:mm')}
            </span>
          )}
        </div>
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

      {/* Wie koos wat — verdeling over je eigen league (inklapbaar, auto-dicht na 48u) */}
      {dist && dist.length > 0 && (() => {
        const played = actualWinnerId != null
        const toneText: Record<string, string> = { gold: 'text-wk-gold', green: 'text-wk-green', red: 'text-wk-red', grey: 'text-wk-muted' }
        const toneOf = (teamId: string) => {
          if (userPick === teamId) return !played ? 'gold' : teamId === actualWinnerId ? 'green' : 'red'
          if (played && teamId === actualWinnerId) return 'green'
          return 'grey'
        }
        return (
          <div className="border-t border-white/5">
            <button
              type="button"
              onClick={() => setDistOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">Wie koos wat</span>
              <span className={`text-[10px] text-wk-muted transition-transform ${distOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {distOpen && (
              <div className="px-4 pb-3.5">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 sm:gap-x-5 gap-y-2">
                  <span />
                  <span className="font-mono text-[8px] text-wk-muted/70 tracking-[0.1em] uppercase text-right">Op deze plek</span>
                  <span className="font-mono text-[8px] text-wk-muted/70 tracking-[0.1em] uppercase text-right">Als winnaar</span>
                  {dist.map(({ teamId, place, winner }) => {
                    const t = teamMap[teamId]
                    if (!t) return null
                    const tone = toneOf(teamId)
                    return (
                      <Fragment key={teamId}>
                        <span className="flex items-center gap-2 min-w-0" title={t.name}>
                          <Image src={t.flag_url} alt={t.name} width={22} height={14} className="w-[22px] h-3.5 rounded-sm object-cover shrink-0" />
                          <span className={`hidden sm:inline text-[11px] truncate ${toneText[tone]}`}>{t.name}</span>
                        </span>
                        <span className={`font-mono text-xs font-bold text-right ${toneText[tone]}`}>{place}x</span>
                        <span className={`font-mono text-xs font-bold text-right ${toneText[tone]}`}>{winner}x</span>
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}
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
