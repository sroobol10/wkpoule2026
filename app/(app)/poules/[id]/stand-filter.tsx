'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AvatarCircle } from '@/components/avatar-circle'

// Statistieken waarop de stand kan worden ingezien (alleen Ennovate-poule).
// 'normaal' toont de standaard tussenstand (podium + volledige tabel); de overige
// herrangschikken de deelnemers op die ene stat.
type StatKey = 'correct' | 'exact' | 'joker' | 'dag' | 'bonus'
type FilterKey = 'normaal' | StatKey

export type StandFilterEntry = {
  id: string
  username: string
  fullName: string | null
  avatarUrl: string | null
  correct: number
  exact: number
  joker: number
  dag: number
  bonus: number
}

// `pct` = toon percentage van de gespeelde wedstrijden (noemer = playedCount).
const STATS: { key: FilterKey; label: string; unit: string; pct?: boolean }[] = [
  { key: 'normaal', label: 'Tussenstand', unit: 'pt' },
  { key: 'correct', label: 'Correct resultaat', unit: '×', pct: true },
  { key: 'exact', label: 'Exacte score', unit: '×' },
  { key: 'joker', label: 'Jokerpunten', unit: 'pt' },
  { key: 'dag', label: 'Dagelijkse bonus', unit: 'pt' },
  { key: 'bonus', label: 'Bonus vooraf', unit: 'pt' },
]

export function StandFilter({
  entries,
  currentUserId,
  playedCount = 0,
  enabled = true,
  children,
}: {
  entries: StandFilterEntry[]
  currentUserId: string
  playedCount?: number
  enabled?: boolean
  children: ReactNode
}) {
  const [stat, setStat] = useState<FilterKey>('normaal')

  // Zonder filter (alle poules behalve Ennovate) gewoon de standaardstand tonen.
  if (!enabled) return <>{children}</>

  const base =
    'font-mono text-[10px] tracking-[0.14em] uppercase px-3 py-1.5 rounded-lg border transition-colors cursor-pointer'
  const active = 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
  const inactive = 'border-white/10 text-wk-muted hover:text-wk-soft hover:border-white/20'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {STATS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStat(key)}
            className={`${base} ${stat === key ? active : inactive}`}
          >
            {label}
          </button>
        ))}
      </div>
      {stat === 'normaal' ? children : (
        <StatRanking entries={entries} stat={stat} currentUserId={currentUserId} playedCount={playedCount} />
      )}
    </div>
  )
}

// Compacte stand, gesorteerd op de gekozen stat. Gedeelde posities bij gelijke
// waarde (1, –, –, 4) net als de hoofdtabel.
function StatRanking({
  entries,
  stat,
  currentUserId,
  playedCount,
}: {
  entries: StandFilterEntry[]
  stat: StatKey
  currentUserId: string
  playedCount: number
}) {
  const meta = STATS.find((s) => s.key === stat)
  const unit = meta?.unit ?? 'pt'
  const showPct = !!meta?.pct && playedCount > 0
  const sorted = [...entries].sort((a, b) => b[stat] - a[stat])
  const tiedAbove = sorted.map((r, i) => i > 0 && sorted[i - 1][stat] === r[stat])

  const posCell = (index: number) => {
    if (tiedAbove[index]) return '–'
    const medals = ['🥇', '🥈', '🥉']
    return index < 3 ? medals[index] : String(index + 1)
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">
        Nog geen deelnemers.
      </div>
    )
  }

  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
      {sorted.map((e, index) => {
        const isCurrentUser = e.id === currentUserId
        const pos = posCell(index)
        const isMedal = ['🥇', '🥈', '🥉'].includes(pos)
        const val = e[stat]
        return (
          <div
            key={e.id}
            className={`flex items-center gap-3 px-4 py-3 ${isCurrentUser ? 'bg-wk-gold/5' : ''}`}
          >
            <div className="w-6 text-center shrink-0">
              {isMedal
                ? <span className="text-sm">{pos}</span>
                : <span className="font-mono text-xs text-wk-muted">{pos}</span>}
            </div>
            <AvatarCircle username={e.username} avatarUrl={e.avatarUrl} size={28} />
            <div className="flex-1 min-w-0">
              <Link
                href={`/deelnemers/${e.id}`}
                className={`block text-sm font-medium truncate hover:underline underline-offset-2 ${isCurrentUser ? 'text-wk-gold font-bold' : 'text-wk-text hover:text-wk-gold'}`}
              >
                {e.username}
              </Link>
              {e.fullName && (
                <p className="font-mono text-[9px] text-wk-muted truncate leading-tight">{e.fullName}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div>
                <span className={`font-display text-lg ${val > 0 ? 'text-wk-gold [text-shadow:0_0_12px_rgba(244,185,46,0.45)]' : 'text-wk-muted/50'}`}>
                  {val}
                </span>
                <span className="font-mono text-[10px] text-wk-muted ml-0.5">{unit}</span>
              </div>
              {showPct && (
                <p className="font-mono text-[9px] text-wk-muted leading-tight">
                  {Math.round((val / playedCount) * 100)}%
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
