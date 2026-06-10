'use client'

import { useState, type ReactNode } from 'react'

// Schakelt tussen het klassieke klassement (podium + tabel) en de bergetappe-weergave.
// Beide views worden server-side gerenderd en als ReactNode doorgegeven.
// De tabs (en daarmee de bergetappe) zijn alleen op desktop zichtbaar; op mobiel
// wordt altijd het klassement getoond. Zonder `bergetappe` zijn er geen tabs.
export function LeaderboardTabs({ bergetappe, children }: { bergetappe?: ReactNode; children: ReactNode }) {
  const [tab, setTab] = useState<'klassement' | 'bergetappe'>('klassement')
  if (!bergetappe) return <>{children}</>

  const base = 'font-mono text-[10px] tracking-[0.14em] uppercase px-3.5 py-2 rounded-lg border transition-colors cursor-pointer'
  const active = 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
  const inactive = 'border-white/10 text-wk-muted hover:text-wk-soft hover:border-white/20'
  return (
    <div className="space-y-6">
      <div className="hidden sm:flex gap-2">
        <button
          type="button"
          onClick={() => setTab('klassement')}
          className={`${base} ${tab === 'klassement' ? active : inactive}`}
        >
          Klassement
        </button>
        <button
          type="button"
          onClick={() => setTab('bergetappe')}
          className={`${base} ${tab === 'bergetappe' ? active : inactive}`}
        >
          Bergetappe
        </button>
      </div>
      {tab === 'bergetappe' && <div className="hidden sm:block">{bergetappe}</div>}
      <div className={`space-y-6 ${tab === 'bergetappe' ? 'sm:hidden' : ''}`}>{children}</div>
    </div>
  )
}
