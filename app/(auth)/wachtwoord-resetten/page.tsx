'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function WachtwoordResettenPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }
    if (password !== confirm) {
      setError('Wachtwoorden komen niet overeen.')
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError('Wachtwoord instellen mislukt. De link is mogelijk verlopen — vraag een nieuwe aan.')
      } else {
        router.push('/voorspellingen')
      }
    })
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-wk-surface border border-white/10 rounded-2xl p-8">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">Toegang</p>
        <h2 className="font-display text-2xl text-wk-text uppercase leading-none mb-1">
          Nieuw wachtwoord
        </h2>
        <p className="text-sm text-wk-muted mb-6">Kies een nieuw wachtwoord van minimaal 8 tekens.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              Nieuw wachtwoord
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              Herhaal wachtwoord
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-wk-red bg-wk-red/10 border border-wk-red/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || !password || !confirm}
            className="w-full rounded-lg bg-wk-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? 'Opslaan…' : 'Wachtwoord instellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
