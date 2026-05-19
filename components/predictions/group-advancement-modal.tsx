'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { SaveResult } from '@/app/actions/predictions'

type Team = { id: string; name: string; flag_url: string; group_name: string }
type AdvancementEntry = { team_id: string; predicted_position: number }

type Props = {
  teams: Team[]
  initialAdvancement: AdvancementEntry[]
  onClose: () => void
  onSave: (selections: { teamId: string; position: number }[]) => Promise<SaveResult>
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
type PicksTuple = [string | null, string | null, string | null]

const POS = {
  1: { label: '1e', text: 'text-wk-gold', badge: 'bg-wk-gold text-wk-bg', arrow: 'text-wk-gold'  },
  2: { label: '2e', text: 'text-wk-blue', badge: 'bg-wk-blue text-white',  arrow: 'text-wk-blue'  },
  3: { label: '3e', text: 'text-wk-soft', badge: 'bg-white/20 text-white', arrow: 'text-wk-muted' },
} as const

function buildInitialState(teams: Team[], advancement: AdvancementEntry[]) {
  const groupPicks: Record<string, PicksTuple> = {}
  for (const g of GROUPS) groupPicks[g] = [null, null, null]

  for (const entry of advancement) {
    const team = teams.find((t) => t.id === entry.team_id)
    if (!team) continue
    const g = team.group_name
    const pos = entry.predicted_position
    if (pos === 1 || pos === 2 || pos === 3) groupPicks[g][pos - 1] = entry.team_id
  }
  return { groupPicks }
}

export default function GroupAdvancementModal({ teams, initialAdvancement, onClose, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<string>('A')
  const { groupPicks: init } = buildInitialState(teams, initialAdvancement)
  const [groupPicks, setGroupPicks] = useState<Record<string, PicksTuple>>(init)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deduplicate by name in case the seed created duplicates
  const teamsByGroup = (g: string) => {
    const seen = new Set<string>()
    return teams.filter((t) => {
      if (t.group_name !== g || seen.has(t.name)) return false
      seen.add(t.name)
      return true
    })
  }

  const pos12Picked = Object.values(groupPicks).reduce(
    (acc, [a, b]) => acc + (a ? 1 : 0) + (b ? 1 : 0), 0
  )
  const pos3Picked = Math.min(
    Object.values(groupPicks).reduce((acc, [,, c]) => acc + (c ? 1 : 0), 0),
    8
  )
  const totalPicked = pos12Picked + pos3Picked  // max 32 (24 mandatory + 8 optional)
  const isComplete = pos12Picked === 24 && pos3Picked === 8

  function pickTeam(group: string, teamId: string) {
    setGroupPicks((prev) => {
      const picks = [...prev[group]] as PicksTuple
      const idx = picks.indexOf(teamId)

      if (idx !== -1) {
        // Remove and compact: shift remaining picks left
        const newPicks: PicksTuple = [null, null, null]
        let j = 0
        for (let i = 0; i < 3; i++) {
          if (picks[i] !== null && picks[i] !== teamId) newPicks[j++] = picks[i]
        }
        return { ...prev, [group]: newPicks }
      } else {
        // Add to next empty slot
        const newPicks = [...picks] as PicksTuple
        const firstEmpty = newPicks.indexOf(null)
        if (firstEmpty !== -1) newPicks[firstEmpty] = teamId
        return { ...prev, [group]: newPicks }
      }
    })
  }

  async function handleSave() {
    setIsPending(true)
    setError(null)
    const selections: { teamId: string; position: number }[] = []
    for (const [, picks] of Object.entries(groupPicks)) {
      picks.forEach((teamId, i) => {
        if (teamId) selections.push({ teamId, position: i + 1 })
      })
    }
    const result = await onSave(selections)
    if (!result.ok) setError(result.error)
    setIsPending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative z-10 w-full md:max-w-2xl bg-wk-surface border border-white/10 rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-0.5">Fase 01 · Knockoutfase</p>
            <h2 className="font-display text-lg text-wk-text uppercase leading-none">Wie gaat door?</h2>
            <p className="font-mono text-[10px] text-wk-muted mt-1 tracking-[0.12em]">
              Kies per groep de 1e, 2e en 3e plaats
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-wk-muted hover:text-wk-soft transition-colors rounded hover:bg-white/5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        <div className="px-5 pt-3 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">
              {totalPicked}/32 geselecteerd
            </span>
            {isComplete && (
              <span className="font-mono text-[10px] text-wk-green tracking-[0.12em] uppercase">✓ Volledig</span>
            )}
          </div>
          <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-wk-green rounded-full transition-all" style={{ width: `${(totalPicked / 32) * 100}%` }} />
          </div>
        </div>

        {/* Group tabs */}
        <div className="flex overflow-x-auto gap-1 px-5 py-3 shrink-0 scrollbar-none">
          {GROUPS.map((g) => {
            const picks = groupPicks[g]
            const filled = picks.filter(Boolean).length
            return (
              <button
                key={g}
                onClick={() => setActiveTab(g)}
                className={`relative shrink-0 rounded px-3 py-1.5 text-xs font-mono font-bold tracking-[0.14em] uppercase transition-colors ${
                  activeTab === g
                    ? 'bg-wk-bg2 border border-wk-gold/50 text-wk-gold'
                    : 'bg-wk-bg2 border border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
                }`}
              >
                {g}
                {filled > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-wk-gold text-wk-bg text-[7px] font-bold">{filled}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Group content */}
        <div className="overflow-y-auto flex-1 px-5 pb-5">
          <GroupPanel
            group={activeTab}
            teams={teamsByGroup(activeTab)}
            picks={groupPicks[activeTab]}
            onPick={(teamId) => pickTeam(activeTab, teamId)}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          {error && (
            <p className="font-mono text-xs text-wk-red bg-wk-red/10 border border-wk-red/30 rounded px-3 py-2 mb-3 tracking-[0.12em]">
              {error}
            </p>
          )}
          {!isComplete && (
            <p className="font-mono text-[10px] text-wk-gold tracking-[0.12em] uppercase mb-3">
              Nog {32 - totalPicked} teams te kiezen
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded border border-white/10 px-4 py-2.5 text-sm font-semibold text-wk-soft hover:bg-white/5 transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 rounded bg-wk-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isPending ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Group panel ──────────────────────────────────────────────────────────────

function GroupPanel({
  group,
  teams,
  picks,
  onPick,
}: {
  group: string
  teams: Team[]
  picks: PicksTuple
  onPick: (teamId: string) => void
}) {
  const allFull = picks.every((p) => p !== null)

  return (
    <div>
      {/* Card header — deck slide 6 style */}
      <div className="flex items-baseline justify-between border-b border-white/10 pb-2 mb-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-base text-wk-text uppercase">Groep {group}</span>
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
            {picks.filter(Boolean).length}/3
          </span>
        </div>
        <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
          Klik om rang toe te wijzen
        </span>
      </div>

      {/* 4 team rows */}
      <div>
        {teams.map((team) => {
          const idx = picks.indexOf(team.id)
          const pos = idx !== -1 ? (idx + 1) as 1 | 2 | 3 : null
          const style = pos ? POS[pos] : null
          const disabled = allFull && pos === null

          return (
            <button
              key={team.id}
              onClick={() => !disabled && onPick(team.id)}
              disabled={disabled}
              className={`w-full flex items-center justify-between py-3.5 border-b border-white/5 last:border-0 transition-colors ${
                disabled
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-white/3 cursor-pointer'
              }`}
            >
              {/* Flag + name */}
              <div className="flex items-center gap-3">
                {team.flag_url && (
                  <Image
                    src={team.flag_url}
                    alt={team.name}
                    width={28}
                    height={20}
                    className="rounded-sm object-cover shrink-0 w-7 h-5"
                  />
                )}
                <span className={`text-sm font-semibold leading-none ${style ? style.text : 'text-wk-text'}`}>
                  {team.name}
                </span>
              </div>

              {/* Position badge + arrow */}
              <div className="flex items-center gap-2 shrink-0">
                {pos !== null ? (
                  <>
                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full tracking-widest uppercase ${style!.badge}`}>
                      {POS[pos].label}
                    </span>
                    <span className={`font-mono text-sm leading-none ${style!.arrow}`}>→</span>
                  </>
                ) : (
                  <span className="font-mono text-sm leading-none text-wk-muted opacity-40">↓</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-white/5">
        {([1, 2, 3] as const).map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-widest ${POS[p].badge}`}>
              {POS[p].label}
            </span>
            <span className="font-mono text-[9px] text-wk-muted tracking-widest uppercase">
              {p === 1 ? 'Eerste' : p === 2 ? 'Tweede' : 'Derde'}
            </span>
          </div>
        ))}
        <span className="font-mono text-[9px] text-wk-muted tracking-widest uppercase ml-auto">
          Klik geselecteerde om te verwijderen
        </span>
      </div>
    </div>
  )
}
