'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { register } from '@/app/actions/auth'

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(register, null)

  return (
    <div className="w-full max-w-md">
      <div className="bg-wk-surface border border-white/10 rounded-2xl p-8">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-3">Registreren</p>
        <h2 className="font-display text-2xl text-wk-text uppercase leading-none mb-1">Account aanmaken</h2>
        <p className="text-sm text-wk-muted mb-6">Meld je aan en doe mee aan de poule.</p>

        <form action={formAction} className="space-y-4">
          {[
            { id: 'username', label: 'Gebruikersnaam', type: 'text',     autoComplete: 'username',     placeholder: 'jouwgebruikersnaam', minLength: 3,  maxLength: 30 },
            { id: 'email',    label: 'E-mailadres',    type: 'email',    autoComplete: 'email',         placeholder: 'jouw@email.nl' },
            { id: 'password', label: 'Wachtwoord',     type: 'password', autoComplete: 'new-password', placeholder: 'Minimaal 8 tekens',   minLength: 8 },
            { id: 'confirm',  label: 'Wachtwoord bevestigen', type: 'password', autoComplete: 'new-password', placeholder: '••••••••' },
          ].map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
                {f.label}
              </label>
              <input
                id={f.id}
                name={f.id}
                type={f.type}
                required
                autoComplete={f.autoComplete}
                minLength={f.minLength}
                maxLength={f.maxLength}
                className="w-full rounded-lg bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                placeholder={f.placeholder}
              />
            </div>
          ))}

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
            {isPending ? 'Account aanmaken…' : 'Registreren'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-wk-muted">
          Al een account?{' '}
          <Link href="/login" className="font-semibold text-wk-gold hover:opacity-80 transition-opacity">
            Inloggen
          </Link>
        </p>
      </div>
    </div>
  )
}
