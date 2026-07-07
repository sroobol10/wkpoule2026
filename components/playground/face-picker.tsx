'use client'

// Gedeelde spelerkiezer voor de playground-games: een grid met grote vierkante koppen + naam
// eronder. Klik = kies; nogmaals klikken (of pick = -1) = willekeurig. Zelfde look als boksen/darts.

import { PLAYER_POOL } from '@/lib/soccer/teams'

export const POOL_ALPHA = [...PLAYER_POOL].sort((a, b) => a.name.localeCompare(b.name, 'nl'))

export function FacePicker({ label, pick, onPick, color, compact = false }: {
  label: string
  pick: number // index in POOL_ALPHA, of -1 = willekeurig
  onPick: (i: number) => void
  color: string
  compact?: boolean // kleinere koppen (meer kolommen) — bijv. voor Koppenkanon
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">
        {label} <span style={{ color }}>{pick >= 0 ? `— ${POOL_ALPHA[pick].name}` : '— willekeurig'}</span>
      </p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-6 sm:grid-cols-8' : 'grid-cols-4 sm:grid-cols-5'}`}>
        {POOL_ALPHA.map((p, i) => (
          <button key={p.face} onClick={() => onPick(pick === i ? -1 : i)} title={p.name}
            className={`group flex flex-col items-center gap-1 transition ${pick === i ? '' : 'opacity-70 hover:opacity-100'}`}>
            <span className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition group-hover:-translate-y-0.5 ${pick === i ? 'scale-105' : ''}`}
              style={{ borderColor: pick === i ? color : 'rgba(255,255,255,0.15)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/spelers/${p.face}`} alt={p.name} className="h-full w-full object-cover" />
            </span>
            <span className="w-full truncate text-center font-mono text-[9px] uppercase tracking-[0.08em]"
              style={{ color: pick === i ? color : undefined }}>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
