'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { login } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null)

  return (
    <div className="w-full max-w-sm">
      <div className="bg-wk-surface border border-white/10 rounded-2xl p-8">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">Inloggen</p>
        <h2 className="font-display text-2xl text-wk-text uppercase leading-none mb-1">Welkom terug</h2>
        <p className="text-sm text-wk-muted mb-6">Vul je gegevens in om door te gaan.</p>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              E-mailadres
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              placeholder="jouw@email.nl"
            />
          </div>

          <div>
            <label htmlFor="password" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              Wachtwoord
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-wk-red bg-wk-red/10 border border-wk-red/30 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-wk-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? 'Bezig met inloggen…' : 'Inloggen'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-wk-muted">
          Nog geen account?{' '}
          <Link href="/registreren" className="font-semibold text-wk-gold hover:opacity-80 transition-opacity">
            Registreren
          </Link>
        </p>
      </div>
    </div>
  )
}
