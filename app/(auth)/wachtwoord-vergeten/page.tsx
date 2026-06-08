'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function WachtwoordVergetenPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${siteUrl}/auth/callback?next=/wachtwoord-resetten`,
      })
      if (error) {
        setError('Er ging iets mis. Probeer het opnieuw.')
      } else {
        setSent(true)
      }
    })
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-wk-surface border border-white/10 rounded-2xl p-8">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">Toegang</p>
        <h2 className="font-display text-2xl text-wk-text uppercase leading-none mb-1">
          Wachtwoord vergeten
        </h2>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg bg-wk-green/10 border border-wk-green/30 px-4 py-3">
              <p className="text-sm text-wk-green">
                Als dit e-mailadres bij ons bekend is, ontvang je zo een link om je wachtwoord opnieuw in te stellen.
              </p>
            </div>
            <p className="text-sm text-wk-muted">Controleer ook je spammap.</p>
            <Link
              href="/login"
              className="block text-center font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-widest uppercase transition-colors"
            >
              ← Terug naar inloggen
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-wk-muted mb-6">
              Vul je e-mailadres in. Je ontvangt een link om een nieuw wachtwoord in te stellen.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
                  E-mailadres
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                  placeholder="jouw@email.nl"
                />
              </div>

              {error && (
                <p className="text-sm text-wk-red bg-wk-red/10 border border-wk-red/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isPending || !email.trim()}
                className="w-full rounded-lg bg-wk-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? 'Versturen…' : 'Stuur resetlink'}
              </button>
            </form>

            <p className="mt-6 text-center">
              <Link
                href="/login"
                className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-widest uppercase transition-colors"
              >
                ← Terug naar inloggen
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
