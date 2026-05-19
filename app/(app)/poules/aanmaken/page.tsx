'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createPoule } from '@/app/actions/poules'

export default function PoulesAanmakenPage() {
  const [state, formAction, isPending] = useActionState(createPoule, null)

  return (
    <div className="max-w-lg">
      <Link
        href="/poules"
        className="inline-flex items-center gap-1 font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.14em] uppercase mb-6 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Terug
      </Link>

      <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Nieuw</p>
      <h1 className="font-display text-2xl text-wk-text uppercase leading-none mb-6">Poule aanmaken</h1>

      <div className="bg-wk-surface border border-white/10 rounded-xl p-6">
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              Naam van de poule
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={50}
              autoComplete="off"
              className="w-full rounded bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              placeholder="bijv. Familie De Vries"
            />
          </div>

          {state && !state.ok && (
            <p className="font-mono text-xs text-wk-red bg-wk-red/10 border border-wk-red/30 rounded px-3 py-2 tracking-[0.12em]">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded bg-wk-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? 'Aanmaken…' : 'Poule aanmaken'}
          </button>
        </form>

        <div className="mt-4 rounded bg-wk-bg2 border border-white/10 px-4 py-3">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
            Na het aanmaken ontvang je een unieke uitnodigingscode die je deelt met vrienden.
          </p>
        </div>
      </div>
    </div>
  )
}
