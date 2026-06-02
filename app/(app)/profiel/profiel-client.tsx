'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setTheme } from '@/app/actions/profile'

type Profile = { id: string; username: string; email: string; avatar_url: string | null; created_at: string }
type Score = { total_pts: number; exact_hits: number; correct_results: number }

type Props = Readonly<{
  profile: Profile
  score: Score | null
  predCount: number
  bonusCount: number
  currentTheme: string
}>

export default function ProfielClient({ profile, score, predCount, bonusCount, currentTheme }: Props) {
  const [username, setUsername] = useState(profile.username)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [themeToast, setThemeToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const router = useRouter()

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function saveUsername() {
    const trimmed = username.trim()
    if (!trimmed || trimmed === profile.username) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('profiles').update({ username: trimmed }).eq('id', profile.id)
      if (error) showToast('Opslaan mislukt.', false)
      else { showToast('Opgeslagen!', true); router.refresh() }
    })
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const stats = [
    { label: 'Punten', value: score?.total_pts ?? 0, color: 'text-wk-gold' },
    { label: 'Exact', value: score?.exact_hits ?? 0, color: 'text-wk-green' },
    { label: 'Resultaat', value: score?.correct_results ?? 0, color: 'text-wk-blue' },
    { label: 'Voorspellingen', value: predCount, color: 'text-wk-text' },
    { label: 'Bonusvragen', value: bonusCount, color: 'text-wk-text' },
  ]

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Account</p>
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Profiel</h1>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">{profile.email}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3">
            <p className={`font-display text-2xl leading-none ${s.color}`}>{s.value}</p>
            <p className="font-mono text-[10px] text-wk-muted mt-1 tracking-[0.12em] uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Settings */}
      <div className="bg-wk-surface border border-white/10 rounded-xl p-5">
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-4">Instellingen</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              Gebruikersnaam
            </label>
            <div className="flex gap-2">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
                maxLength={30}
                className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm text-wk-text focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              />
              <button
                onClick={saveUsername}
                disabled={isPending || !username.trim() || username.trim() === profile.username}
                className="rounded bg-wk-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? '…' : 'Opslaan'}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              E-mailadres
            </label>
            <p className="rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm text-wk-muted font-mono tracking-widest">
              {profile.email}
            </p>
          </div>
        </div>
      </div>

      {/* Thema-keuze */}
      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase">Thema</p>
        </div>
        <div className="p-5 space-y-3">
          {([
            {
              id: 'default',
              label: 'Standaard',
              desc: 'Donker stadion-thema',
              preview: 'bg-[#0B0E14] border-[#F4B92E]/30',
              dot: 'bg-[#F4B92E]',
            },
            {
              id: 'retro-1988',
              label: 'EK 1988 Retro',
              desc: 'Oranje · Strijd · Passie · Glorie',
              preview: 'bg-[#2A0800] border-[#FF6600]/40',
              dot: 'bg-[#FF6600]',
            },
          ] as const).map((t) => {
            const active = currentTheme === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  startTransition(async () => {
                    const result = await setTheme(t.id)
                    setThemeToast({ msg: result.ok ? `Thema "${t.label}" ingesteld!` : result.error, ok: result.ok })
                    setTimeout(() => setThemeToast(null), 3000)
                  })
                }}
                disabled={active || isPending}
                className={`w-full flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-wk-gold/50 bg-wk-gold/5'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Preview swatch */}
                <div className={`w-10 h-7 rounded shrink-0 border ${t.preview} flex items-center justify-center`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${active ? 'text-wk-gold' : 'text-wk-text'}`}>{t.label}</p>
                  <p className="font-mono text-[10px] text-wk-muted tracking-widest">{t.desc}</p>
                </div>
                {active && (
                  <span className="font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest uppercase shrink-0">
                    Actief
                  </span>
                )}
              </button>
            )
          })}
          {themeToast && (
            <p className={`font-mono text-[10px] tracking-[0.12em] ${themeToast.ok ? 'text-wk-green' : 'text-wk-red'}`}>
              {themeToast.msg}
            </p>
          )}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full rounded border border-wk-red/30 px-4 py-2.5 text-sm font-mono font-medium text-wk-red hover:bg-wk-red/5 transition-colors tracking-[0.12em] uppercase"
      >
        Uitloggen
      </button>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 font-mono text-xs font-semibold shadow-lg text-white tracking-[0.12em] uppercase ${
          toast.ok ? 'bg-wk-green' : 'bg-wk-red'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
