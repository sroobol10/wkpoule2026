'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AvatarCircle } from '@/components/avatar-circle'

export type GoatSupporter = {
  id: string
  username: string
  avatarUrl: string | null
}

const MESSI_BLUE = '#6CACE4' // Argentijns celeste
const RONALDO_RED = '#E63946' // Portugees rood

// Telt met easing op naar de eindstand
function useCountUp(target: number, delay = 500, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) return
    let raf: number
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delay, duration])
  return value
}

function GoatFigure({
  src,
  alt,
  initials,
  color,
  onActivate,
  active,
  dimmed,
  delay,
}: {
  src: string
  alt: string
  initials: string
  color: string
  onActivate: () => void
  active: boolean
  dimmed: boolean
  delay: number
}) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`animate-podium-pop relative group shrink-0 cursor-pointer outline-none transition-[filter,opacity] duration-700 ${
        dimmed ? 'grayscale opacity-40' : ''
      }`}
      style={{ animationDelay: `${delay}s` }}
      title={alt}
    >
      {/* Gloed in teamkleur — feller zolang het geluid speelt */}
      <div
        className={`absolute inset-0 blur-2xl transition-opacity animate-pulse rounded-full ${
          active ? 'opacity-70' : 'opacity-30 group-hover:opacity-50'
        }`}
        style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }}
      />
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          onError={() => setImgOk(false)}
          className={`animate-podium-float relative h-32 sm:h-80 w-auto object-contain drop-shadow-2xl transition-transform ${
            active ? 'scale-110' : 'group-hover:scale-105'
          }`}
          style={{ animationDelay: `${delay + 0.6}s` }}
        />
      ) : (
        <div
          className="animate-podium-float relative h-32 sm:h-80 w-20 sm:w-48 flex items-center justify-center rounded-2xl border border-white/10"
          style={{ animationDelay: `${delay + 0.6}s`, background: `linear-gradient(to bottom, ${color}22, transparent)` }}
        >
          <span className="font-display text-5xl sm:text-7xl" style={{ color }}>{initials}</span>
        </div>
      )}
    </button>
  )
}

function SupporterList({
  title,
  color,
  supporters,
  currentUserId,
  align,
  dimmed,
}: {
  title: string
  color: string
  supporters: GoatSupporter[]
  currentUserId: string
  align: 'left' | 'right'
  dimmed: boolean
}) {
  return (
    <div className={`min-w-0 transition-[filter,opacity] duration-700 ${dimmed ? 'grayscale opacity-40' : ''}`}>
      <p
        className={`font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-3 ${align === 'right' ? 'text-right' : ''}`}
        style={{ color }}
      >
        {title} · {supporters.length}
      </p>
      <div className={`flex flex-wrap gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {supporters.length === 0 ? (
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">Nog niemand gekozen.</p>
        ) : (
          supporters.map(({ id, username, avatarUrl }, i) => {
            const isCurrentUser = id === currentUserId
            return (
              <Link
                key={id}
                href={`/deelnemers/${id}`}
                className={`animate-podium-pop flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-wk-surface border transition-colors hover:border-white/30 ${
                  isCurrentUser ? 'border-wk-gold/50' : 'border-white/10'
                }`}
                style={{ animationDelay: `${Math.min(1 + i * 0.05, 2.2)}s` }}
              >
                <AvatarCircle username={username} avatarUrl={avatarUrl} size={20} />
                <span className={`text-xs truncate max-w-28 ${isCurrentUser ? 'font-bold text-wk-gold' : 'text-wk-soft'}`}>
                  {username}
                </span>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function GoatClient({
  messiGoals,
  ronaldoGoals,
  messiSupporters,
  ronaldoSupporters,
  currentUserId,
}: {
  messiGoals: number
  ronaldoGoals: number
  messiSupporters: GoatSupporter[]
  ronaldoSupporters: GoatSupporter[]
  currentUserId: string
}) {
  const messiCount = useCountUp(messiGoals)
  const ronaldoCount = useCountUp(ronaldoGoals)
  const totalGoals = messiGoals + ronaldoGoals
  const messiPct = totalGoals > 0 ? (messiGoals / totalGoals) * 100 : 50

  // Zolang het geluid van een speler klinkt kleurt de pagina in zijn landstijl.
  // Zonder actieve takeover geldt het thema van degene die voorstaat.
  const [takeover, setTakeover] = useState<'messi' | 'ronaldo' | null>(null)
  const leader = messiGoals > ronaldoGoals ? 'messi' : ronaldoGoals > messiGoals ? 'ronaldo' : null
  const theme = takeover ?? leader
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cheer = (side: 'messi' | 'ronaldo', sound: string) => {
    audioRef.current?.pause()
    const audio = new Audio(sound)
    audioRef.current = audio
    audio.onended = () => setTakeover((cur) => (cur === side ? null : cur))
    audio.play().then(() => setTakeover(side)).catch(() => setTakeover(null))
  }
  useEffect(() => () => audioRef.current?.pause(), [])

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      {/* Argentinië-takeover: hemelsblauw-witte banen met een gouden zon */}
      <div
        className={`pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ${
          theme === 'messi' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: `
            radial-gradient(circle at 50% -10%, rgba(244, 185, 46, 0.35), transparent 40%),
            repeating-linear-gradient(90deg,
              rgba(108, 172, 228, 0.20) 0px, rgba(108, 172, 228, 0.20) 90px,
              rgba(245, 242, 235, 0.10) 90px, rgba(245, 242, 235, 0.10) 180px)
          `,
        }}
      />
      {/* Portugal-takeover: groen-rode vlag */}
      <div
        className={`pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 ${
          theme === 'ronaldo' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: `
            radial-gradient(circle at 38% 50%, rgba(244, 185, 46, 0.18), transparent 30%),
            linear-gradient(100deg, rgba(0, 102, 68, 0.35) 0%, rgba(0, 102, 68, 0.30) 38%, rgba(230, 57, 70, 0.35) 38%, rgba(230, 57, 70, 0.28) 100%)
          `,
        }}
      />
      {/* Spotlights in teamkleuren */}
      <div
        className="pointer-events-none absolute -left-48 top-16 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 animate-pulse"
        style={{ background: `radial-gradient(closest-side, ${MESSI_BLUE}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute -right-48 top-16 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 animate-pulse"
        style={{ background: `radial-gradient(closest-side, ${RONALDO_RED}, transparent)`, animationDelay: '1s' }}
      />

      {/* Sluiten */}
      <Link
        href="/statistieken"
        aria-label="Sluiten"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-5xl mx-auto px-4 py-10 sm:py-14 space-y-10">
        {/* Kop */}
        <div className="text-center animate-fade-up">
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-2">Bonusvraag · 5 punten</p>
          <h1 className="font-display text-3xl sm:text-5xl uppercase leading-none">Het GOAT-duel</h1>
          <p className="font-mono text-xs text-wk-muted mt-2 tracking-[0.12em]">
            Wie maakt de meeste goals op het WK 2026?
          </p>
        </div>

        {/* Het duel */}
        <div className="flex items-end justify-between gap-2 sm:gap-8">
          <GoatFigure
            src="/messi.png"
            alt="Lionel Messi"
            initials="LM10"
            color={MESSI_BLUE}
            onActivate={() => cheer('messi', '/ankara-messi-best-sound.mp3')}
            active={takeover === 'messi'}
            dimmed={theme === 'ronaldo'}
            delay={0.25}
          />

          {/* Scorebord */}
          <div className="animate-podium-pop flex-1 text-center pb-6 sm:pb-16 min-w-0" style={{ animationDelay: '0.55s' }}>
            <div className="flex items-baseline justify-center gap-3 sm:gap-6">
              <div>
                <p className="font-mono text-[9px] sm:text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: MESSI_BLUE }}>
                  Messi
                </p>
                <p
                  className={`font-display text-5xl sm:text-8xl leading-none ${messiGoals > ronaldoGoals ? 'text-wk-gold' : ''}`}
                  style={messiGoals > ronaldoGoals ? undefined : { color: MESSI_BLUE }}
                >
                  {messiCount}
                </p>
              </div>
              <span className="font-display text-xl sm:text-3xl text-wk-muted/50">–</span>
              <div>
                <p className="font-mono text-[9px] sm:text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: RONALDO_RED }}>
                  Ronaldo
                </p>
                <p
                  className={`font-display text-5xl sm:text-8xl leading-none ${ronaldoGoals > messiGoals ? 'text-wk-gold' : ''}`}
                  style={ronaldoGoals > messiGoals ? undefined : { color: RONALDO_RED }}
                >
                  {ronaldoCount}
                </p>
              </div>
            </div>
            <p className="font-mono text-[9px] sm:text-[10px] text-wk-muted tracking-[0.16em] uppercase mt-2 sm:mt-3">
              {totalGoals === 0 ? 'Het duel moet nog losbarsten' : 'Doelpunten dit toernooi'}
            </p>

            {/* Krachtmeting */}
            <div className="mt-4 sm:mt-6 h-1.5 rounded-full overflow-hidden flex bg-white/5 max-w-xs mx-auto">
              <div className="transition-all duration-1000" style={{ width: `${messiPct}%`, background: MESSI_BLUE }} />
              <div className="transition-all duration-1000" style={{ width: `${100 - messiPct}%`, background: RONALDO_RED }} />
            </div>
          </div>

          <GoatFigure
            src="/ronaldo.png"
            alt="Cristiano Ronaldo"
            initials="CR7"
            color={RONALDO_RED}
            onActivate={() => cheer('ronaldo', '/ronaldo-siuuuu.mp3')}
            active={takeover === 'ronaldo'}
            dimmed={theme === 'messi'}
            delay={0.4}
          />
        </div>

        {/* Wie koos wie */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-t border-white/10 pt-8">
          <SupporterList
            title="Team Messi"
            color={MESSI_BLUE}
            supporters={messiSupporters}
            currentUserId={currentUserId}
            align="left"
            dimmed={theme === 'ronaldo'}
          />
          <SupporterList
            title="Team Ronaldo"
            color={RONALDO_RED}
            supporters={ronaldoSupporters}
            currentUserId={currentUserId}
            align="right"
            dimmed={theme === 'messi'}
          />
        </div>

        <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.12em] text-center">
          Tip: klik op een speler voor het beste geluid van het toernooi.
        </p>
      </div>
    </div>
  )
}
