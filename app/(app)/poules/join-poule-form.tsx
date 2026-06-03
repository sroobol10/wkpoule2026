'use client'

import { useState, useTransition } from 'react'
import { joinPoule } from '@/app/actions/poules'
import { useRouter } from 'next/navigation'

export default function JoinPouleForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleJoin() {
    if (!code.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await joinPoule(code)
      if (result.ok) {
        router.refresh()
        setCode('')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-4">
      <p className="text-sm text-wk-soft mb-3">
        Heb je een uitnodigingscode? Vul hem in om deel te nemen.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="ABCD12"
          maxLength={8}
          className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm font-mono text-wk-gold placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition uppercase tracking-widest"
        />
        <button
          onClick={handleJoin}
          disabled={isPending || !code.trim()}
          className="rounded bg-wk-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? '…' : 'Deelnemen'}
        </button>
      </div>
      {error && <p className="mt-2 font-mono text-xs text-wk-red tracking-[0.12em]">{error}</p>}
    </div>
  )
}
