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

// "Wie koos wat" per slot: verdeling op de thuis-seed en op de uit-seed.
export type SlotDist = {
  homeSeed: string
  awaySeed: string
  home: { teamId: string; count: number }[]
  away: { teamId: string; count: number }[]
  actualHome: string | null
  actualAway: string | null
}

type Props = {
  teams: Team[]
  advancement: AdvancementEntry[]
  bracketPicks: BracketPickEntry[]
  locked: boolean
  actualWinners?: Record<number, string>
  advancedFromStage?: Record<string, string[]>
  eliminatedTeams?: string[]
  slotDist?: Record<number, SlotDist>
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

export default function BracketClient({ teams, advancement, bracketPicks, locked, actualWinners = {}, advancedFromStage = {}, eliminatedTeams = [], slotDist = {} }: Props) {
  const eliminatedSet = new Set(eliminatedTeams)
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
              eliminatedTeams={eliminatedSet}
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
  eliminatedTeams,
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
  eliminatedTeams: Set<string>
  stageHasResults: boolean
  pts: number | null
  dist: SlotDist | null
}) {
  const homeTeam = match.home ? teamMap[match.home] : null
  const awayTeam = match.away ? teamMap[match.away] : null
  const bothKnown = !!homeTeam && !!awayTeam

  const userPick = match.winner

  // "Wie koos wat" standaard open; klapt 48u na de aftrap automatisch in
  const collapsedByTime = !!kickoffAt && Date.now() > new Date(kickoffAt).getTime() + 48 * 60 * 60 * 1000
  const [distOpen, setDistOpen] = useState(!collapsedByTime)
  // Correct = jouw pick ging deze ronde door; Fout = jouw pick is uitgeschakeld.
  // (Niet "stageHasResults && niet doorgegaan" — dan kleurden nog-niet-gespeelde
  //  wedstrijden ten onrechte rood zodra één duel in de ronde gespeeld was.)
  const isCorrect = !!userPick && advancedTeams.has(userPick)
  const isWrong   = !!userPick && eliminatedTeams.has(userPick)
  const resultIn  = actualWinnerId != null   // uitslag ingevoerd → datum weg, ruimte voor punten

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
          {kickoffAt && !resultIn && (
            <span className="font-mono text-[9px] text-wk-muted/60 tracking-widest truncate">
              · {formatInAmsterdam(kickoffAt, 'd MMM HH:mm')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
              eliminated={eliminatedTeams.has(homeTeam.id)}
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
              eliminated={eliminatedTeams.has(awayTeam.id)}
              stageHasResults={stageHasResults}
              disabled={locked || !bothKnown}
              isPending={isPending}
              onClick={() => onPick(awayTeam.id)}
            />
          </div>
        )}
      </div>

      {/* Wie koos wat — verdeling over je eigen league (inklapbaar, auto-dicht na 48u) */}
      {dist && (dist.home.length > 0 || dist.away.length > 0) && (
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
            <div className="px-4 pb-3.5 grid grid-cols-2 gap-x-3 sm:gap-x-6">
              <SeedDist label="Thuis" seed={dist.homeSeed} rows={dist.home} ownId={match.home} actualId={dist.actualHome} teamMap={teamMap} />
              <SeedDist label="Uit" seed={dist.awaySeed} rows={dist.away} ownId={match.away} actualId={dist.actualAway} teamMap={teamMap} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Korte, leesbare seed-omschrijving (1C → "1e groep C", 3_74 → "beste nr. 3", W97 → "winnaar wd. 97")
function seedLabel(seed: string): string {
  if (/^[123][A-L]$/.test(seed)) return `${seed[0]}e · groep ${seed[1]}`
  if (seed.startsWith('3_')) return 'beste nr. 3'
  if (seed.startsWith('W')) return `winnaar wd. ${seed.slice(1)}`
  if (seed.startsWith('L')) return `verliezer wd. ${seed.slice(1)}`
  return seed
}

// Eén kolom: verdeling van teams op deze seed (thuis óf uit). Kleuren volgens de
// groepsfase-conventie: eigen keuze geel zolang niet bekend, groen bij goed, rood
// bij fout (juiste keuze groen), de rest grijs.
function SeedDist({
  label, seed, rows, ownId, actualId, teamMap,
}: {
  label: string
  seed: string
  rows: { teamId: string; count: number }[]
  ownId: string | null
  actualId: string | null
  teamMap: Record<string, Team>
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  const played = actualId != null
  const toneText: Record<string, string> = { gold: 'text-wk-gold', green: 'text-wk-green', red: 'text-wk-red', grey: 'text-wk-soft' }
  const toneBar: Record<string, string> = { gold: 'bg-wk-gold', green: 'bg-wk-green', red: 'bg-wk-red/70', grey: 'bg-white/15' }
  const toneOf = (teamId: string) => {
    if (ownId === teamId) return !played ? 'gold' : teamId === actualId ? 'green' : 'red'
    if (played && teamId === actualId) return 'green'
    return 'grey'
  }
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8px] text-wk-muted/70 tracking-[0.12em] uppercase mb-2">
        {label} · <span className="text-wk-muted">{seedLabel(seed)}</span>
      </p>
      <div className="space-y-1.5">
        {rows.map(({ teamId, count }) => {
          const t = teamMap[teamId]
          if (!t) return null
          const tone = toneOf(teamId)
          return (
            <div key={teamId} className="flex items-center gap-1.5" title={t.name}>
              <Image src={t.flag_url} alt={t.name} width={18} height={12} className="w-[18px] h-3 rounded-sm object-cover shrink-0" />
              <span className={`hidden sm:inline text-[11px] w-16 shrink-0 truncate ${toneText[tone]}`}>{t.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${toneBar[tone]}`} style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="font-mono text-[10px] text-wk-muted w-7 text-right shrink-0">{count}x</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamBtn({
  team,
  selected,
  isActualWinner,
  advanced,
  eliminated,
  stageHasResults,
  disabled,
  isPending,
  onClick,
}: {
  team: Team
  selected: boolean
  isActualWinner: boolean   // won this specific match (for display)
  advanced: boolean         // reached the next round (for scoring)
  eliminated: boolean       // is dit team uit het toernooi? → rood
  stageHasResults: boolean  // is this stage concluded?
  disabled: boolean
  isPending: boolean
  onClick: () => void
}) {
  const pickCorrect = selected && stageHasResults && advanced
  // Uit het toernooi (en niet via deze ronde doorgegaan) → rood, ook in latere slots
  const out = eliminated && !advanced
  const pickWrong   = out && selected

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
  } else if (out) {
    colorClass = 'border-wk-red/40 bg-wk-red/5 text-wk-muted'
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
        className={`w-8 h-5 object-cover rounded-sm ${out ? 'grayscale opacity-60' : ''}`}
      />
      <span className={`font-mono text-[10px] tracking-[0.12em] uppercase text-center leading-tight ${out ? 'line-through opacity-60' : ''}`}>
        {team.name}
      </span>
      {/* Altijd "mijn keuze" bij jouw gekozen land — los van resultaat/correct */}
      {selected && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-gold">★ Mijn keuze</span>
      )}
      {pickCorrect && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-green">✓ Correct</span>
      )}
      {pickWrong && (
        <span className="font-mono text-[9px] tracking-widest uppercase text-wk-red">✗ Uitgeschakeld</span>
      )}
      {!selected && isActualWinner && (
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
