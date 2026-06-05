'use client'

import { useState } from 'react'
import type { GroupPreview } from '@/lib/group-previews'

export function GroupPreviewToggle({ preview }: { preview: GroupPreview }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-wk-muted hover:text-wk-soft transition-colors w-full text-left"
      >
        <span>Voorbeschouwing</span>
        <span className="ml-auto opacity-60">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-wk-gold/10 border border-wk-gold/20 text-wk-gold">
              ★ {preview.favorite}
            </span>
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-wk-soft">
              ◆ {preview.darkHorse}
            </span>
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-wk-blue/10 border border-wk-blue/20 text-wk-blue">
              ▶ {preview.playerToWatch}
            </span>
          </div>
          <p className="text-xs text-wk-soft leading-relaxed">{preview.preview}</p>
        </div>
      )}
    </div>
  )
}
