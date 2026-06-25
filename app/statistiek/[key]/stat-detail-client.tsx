'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AvatarCircle } from '@/components/avatar-circle'

export type StatOption = {
  answer: string
  flag: string | null
  points: number | null
  isCorrect: boolean
  supporters: { id: string; username: string; avatarUrl: string | null; isMe: boolean }[]
}

export default function StatDetailClient({
  title,
  question,
  options,
  totalAnswers,
}: {
  title: string
  question: string
  options: StatOption[]
  totalAnswers: number
}) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/statistieken')
  }
  const maxCount = Math.max(1, ...options.map((o) => o.supporters.length))

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-10 w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.12]" style={{ background: 'radial-gradient(closest-side, var(--color-wk-gold), transparent)' }} />

      <button
        type="button"
        onClick={close}
        aria-label="Sluiten"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative max-w-2xl mx-auto px-4 py-10 sm:py-14 space-y-6">
        <header className="text-center animate-fade-up">
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-2">Wie koos wat</p>
          <h1 className="font-display text-3xl sm:text-5xl uppercase leading-none text-wk-gold">{title}</h1>
          <p className="font-mono text-xs text-wk-soft mt-3 tracking-[0.06em] max-w-lg mx-auto leading-relaxed">{question}</p>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mt-2">
            {totalAnswers} {totalAnswers === 1 ? 'voorspelling' : 'voorspellingen'} in je league
          </p>
        </header>

        {options.length === 0 ? (
          <p className="bg-wk-surface border border-white/10 rounded-xl px-5 py-10 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">
            Nog geen voorspellingen.
          </p>
        ) : (
          <div className="space-y-3">
            {options.map((o, i) => {
              const count = o.supporters.length
              const pct = Math.round((count / maxCount) * 100)
              return (
                <div
                  key={o.answer}
                  className={`animate-fade-up bg-wk-surface border rounded-xl overflow-hidden ${o.isCorrect ? 'border-wk-green/40' : 'border-white/10'}`}
                  style={{ animationDelay: `${Math.min(0.1 + i * 0.05, 1)}s` }}
                >
                  {/* Kop: vlag + antwoord + telling/punten */}
                  <div className="px-4 sm:px-5 py-3 flex items-center gap-3">
                    <span className="font-mono text-sm text-wk-muted w-5 shrink-0 text-center">{i + 1}</span>
                    {o.flag && <Image src={o.flag} alt="" width={28} height={18} className="w-7 h-[18px] rounded-sm object-cover shrink-0" />}
                    <span className={`flex-1 min-w-0 truncate text-sm font-bold ${o.isCorrect ? 'text-wk-green' : 'text-wk-text'}`}>
                      {o.answer}
                      {o.isCorrect && <span className="ml-1.5 text-wk-green">✓</span>}
                    </span>
                    {o.points != null && (
                      <span className="font-mono text-[10px] text-wk-gold tracking-[0.1em] shrink-0">{o.points} pt</span>
                    )}
                    <span className="font-display text-lg text-wk-text shrink-0 w-8 text-right">{count}</span>
                  </div>
                  {/* Verdeelbalk */}
                  <div className="px-4 sm:px-5">
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full rounded-full ${o.isCorrect ? 'bg-wk-green' : 'bg-wk-gold/60'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {/* Supporters */}
                  <div className="px-4 sm:px-5 py-3 flex flex-wrap gap-1.5">
                    {o.supporters.map((s) => (
                      <Link
                        key={s.id}
                        href={`/deelnemers/${s.id}`}
                        className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border transition-colors hover:border-white/30 ${s.isMe ? 'border-wk-gold/50 bg-wk-gold/5' : 'border-white/10 bg-wk-bg2'}`}
                      >
                        <AvatarCircle username={s.username} avatarUrl={s.avatarUrl} size={20} />
                        <span className={`text-xs truncate max-w-28 ${s.isMe ? 'font-bold text-wk-gold' : 'text-wk-soft'}`}>{s.username}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="pt-2 text-center">
          <Link href="/statistieken" className="inline-flex items-center gap-2 font-mono text-[11px] text-wk-muted hover:text-wk-soft tracking-[0.14em] uppercase transition-colors">
            ← Terug naar statistieken
          </Link>
        </div>
      </div>
    </div>
  )
}
