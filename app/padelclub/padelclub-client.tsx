'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AvatarCircle } from '@/components/avatar-circle'

export type PadelPlayer = {
  id: string
  username: string
  fullName: string | null
  avatarUrl: string | null
  totalPts: number
  groupMatchPts: number
  groupStandingsPts: number
  knockoutPts: number
  bonusPrePts: number
  bonusDailyPts: number
  jokersPlayed: number
  jokerPts: number
  exactHits: number
  correctResults: number
}

export type DayMatch = {
  id: string
  time: string
  home: { name: string; flag: string | null } | null
  away: { name: string; flag: string | null } | null
  actual: string | null
  preds: Record<string, { text: string | null; pts: number | null }>
}

export type DayQuestion = {
  question: string
  correctAnswer: string | null
  answers: Record<string, { answer: string | null; pts: number | null }>
} | null

// Vaste kleur per speler (volgorde = PADEL_USERNAMES) — overal consistent
const PLAYER_COLORS = ['#F4B92E', '#2D6BE5', '#2EA84B', '#E63946'] // goud, blauw, groen, rood

// "Links Rechts" (Snollebollekes): figuren die per beat dwars overvliegen.
const FLYERS = ['bus.png', 'ho.png', 'kim.png', 'vince.png', 'rick.png', 'ashi.png', 'kim2.png', 'trein.png', 'dejuul.png', 'girlref.png']
// Schaal per figuur: bus.png groter (veel transparante rand), ashi.png is een
// kleine afbeelding → kleiner renderen.
const FLYER_SCALE: Record<string, number> = { 'bus.png': 1.7 }
// Oversteek-duur per figuur (seconden); standaard ~2.9s. ashi.png langzamer
// zodat je 'm goed ziet.
const FLYER_DURATION: Record<string, number> = { 'ashi.png': 4.8 }
const DEFAULT_FLYER_DURATION = 2.9
// Beat-momenten (seconden in /linksrechts.mp3) + richting per beat.
const LR_BEAT_TIMES = [0, 3, 6, 9]
const LR_BEAT_DIRS: ('left' | 'right')[] = ['left', 'right', 'left', 'right']
const LR_END_TIME = 12

function useCountUp(target: number, delay = 250, duration = 1100) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) { setValue(0); return }
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

function GrowBar({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  const [grow, setGrow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrow(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div className="h-full rounded-full" style={{
      width: grow ? `${pct}%` : '0%',
      background: color,
      transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
    }} />
  )
}

const firstName = (p: PadelPlayer) => (p.fullName?.split(' ')[0]) || p.username

// Dagscore-kaartje (avatar + getelde punten van vandaag), leider in goud
function DayScoreCard({ p, color, pts, isLead, delay }: { p: PadelPlayer; color: string; pts: number; isLead: boolean; delay: number }) {
  const count = useCountUp(pts, delay)
  return (
    <div
      className={`flex flex-col items-center rounded-xl border py-3 px-1 ${isLead ? 'border-wk-gold/50 bg-wk-gold/[0.06]' : 'border-white/10 bg-wk-surface'}`}
    >
      <span className="rounded-full ring-2 ring-offset-1 ring-offset-wk-bg" style={{ ['--tw-ring-color' as string]: color }} title={firstName(p)}>
        <AvatarCircle username={p.username} avatarUrl={p.avatarUrl} size={34} />
      </span>
      <span className="font-fun font-semibold text-3xl leading-none mt-3" style={{ color }}>{count}</span>
      <span className="font-mono text-[8px] text-wk-muted tracking-[0.12em] uppercase mt-0.5">pt vandaag</span>
    </div>
  )
}

// Compacte avatar met spelerskleur-ring — gebruikt bij scores i.p.v. de naam
function PlayerAvatar({ p, color, size = 24 }: { p: PadelPlayer; color: string; size?: number }) {
  return (
    <span className="rounded-full ring-1 shrink-0 inline-flex" style={{ ['--tw-ring-color' as string]: color }} title={firstName(p)}>
      <AvatarCircle username={p.username} avatarUrl={p.avatarUrl} size={size} />
    </span>
  )
}

export default function PadelclubClient({
  players,
  dayLabel,
  dayMatches,
  dayQuestion,
  heroImage,
  currentUserId,
}: {
  players: PadelPlayer[]
  dayLabel: string
  dayMatches: DayMatch[]
  dayQuestion: DayQuestion
  heroImage: string
  currentUserId: string
}) {
  const router = useRouter()

  // 🎾 in de hero → "Links Rechts" (Snollebollekes): 4 runs van 3s (links, rechts,
  // links, rechts). Per run komt links.png/rechts.png in beeld én vliegt een random
  // figuur dwars over het scherm. Rick vliegt altijd tégen de flow in. Synct met
  // /linksrechts.mp3 en de hele pagina krijgt confetti (ballen + padelrackets).
  const [shakeDir, setShakeDir] = useState<'left' | 'right' | null>(null)
  const [fly, setFly] = useState<{ key: number; src: string; toRight: boolean; top: number; size: number; wide: boolean; duration: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const runningRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Audio vooraf inladen, zodat de eerste klik direct (zonder buffer-latency) start
  useEffect(() => {
    const a = new Audio('/linksrechts.mp3')
    a.preload = 'auto'
    audioRef.current = a
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      timersRef.current.forEach(clearTimeout)
      a.pause()
    }
  }, [])

  const triggerBeat = (i: number) => {
    const dir = LR_BEAT_DIRS[i]
    setShakeDir(dir)
    const src = FLYERS[Math.floor(Math.random() * FLYERS.length)]
    // Normaal vliegt de figuur mét de flow; Rick precies andersom.
    const flowToRight = dir === 'right'
    const isRick = src === 'rick.png'
    // Desktop heeft geen perf-issues → volle random hoogte/grootte (net wat gaver).
    // Mobiel houdt een veilige band + kleinere maat zodat de figuur in beeld blijft.
    const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
    const top = wide ? 8 + Math.floor(Math.random() * 50) : 14 + Math.floor(Math.random() * 24)
    const base = wide ? 280 + Math.floor(Math.random() * 320) : 220 + Math.floor(Math.random() * 200)
    setFly({
      key: i,
      src,
      toRight: isRick ? !flowToRight : flowToRight,
      top,
      size: Math.round(base * (FLYER_SCALE[src] ?? 1)),
      wide,
      duration: FLYER_DURATION[src] ?? DEFAULT_FLYER_DURATION,
    })
  }

  const stopLinksRechts = () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setShakeDir(null)
    setFly(null)
    setPlaying(false)
    runningRef.current = false
  }

  const doLinksRechts = () => {
    if (runningRef.current || !audioRef.current) return
    runningRef.current = true
    setPlaying(true)
    const audio = audioRef.current
    audio.currentTime = 0
    let nextBeat = 0
    // Beats worden getriggerd op basis van de wérkelijke afspeelpositie (currentTime),
    // niet vanaf de klik — zo lopen de bewegingen synchroon met de mp3.
    const loop = () => {
      if (!runningRef.current) return
      const ct = audio.currentTime
      while (nextBeat < LR_BEAT_TIMES.length && ct >= LR_BEAT_TIMES[nextBeat]) {
        triggerBeat(nextBeat)
        nextBeat++
      }
      if (audio.ended || ct >= LR_END_TIME) { stopLinksRechts(); return }
      rafRef.current = requestAnimationFrame(loop)
    }
    audio.play()
      .then(() => { rafRef.current = requestAnimationFrame(loop) })
      .catch(() => {
        // Autoplay geblokkeerd → val terug op timers vanaf de klik
        LR_BEAT_TIMES.forEach((t, i) => timersRef.current.push(setTimeout(() => triggerBeat(i), t * 1000)))
        timersRef.current.push(setTimeout(stopLinksRechts, LR_END_TIME * 1000))
      })
  }

  const colorById = useMemo(
    () => Object.fromEntries(players.map((p, i) => [p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]])),
    [players],
  )

  const ranked = useMemo(() => [...players].sort((a, b) => b.totalPts - a.totalPts), [players])

  // Scheidsrechter-ballen die tijdens "Links Rechts" naar beneden rollen — alleen
  // op desktop (mobiel laten we ze weg voor de performance). Gelijkmatig verdeeld.
  const balls = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      left: Math.min(94, Math.max(0, Math.round((i / 12) * 94 + (Math.random() - 0.5) * 10))),
      delay: +(Math.random() * 4).toFixed(2),
      duration: +(7 + Math.random() * 5).toFixed(2),
      size: 34 + Math.round(Math.random() * 52),
    })),
    [],
  )

  // Punten van vandaag = som van de dag-wedstrijdpunten + de dag-bonusvraag
  const dayPoints = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of players) m[p.id] = 0
    for (const dm of dayMatches) for (const p of players) {
      const pts = dm.preds[p.id]?.pts
      if (pts != null) m[p.id] += pts
    }
    if (dayQuestion) for (const p of players) {
      const pts = dayQuestion.answers[p.id]?.pts
      if (pts != null) m[p.id] += pts
    }
    return m
  }, [players, dayMatches, dayQuestion])
  const dayLead = Math.max(0, ...players.map((p) => dayPoints[p.id]))

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/poules')
  }

  const fmtDate = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })

  const CATEGORIES: { label: string; key: keyof PadelPlayer; unit: string }[] = [
    { label: 'Wedstrijden', key: 'groupMatchPts', unit: 'pt' },
    { label: 'Eindstand', key: 'groupStandingsPts', unit: 'pt' },
    { label: 'Knockout', key: 'knockoutPts', unit: 'pt' },
    { label: 'Bonus vooraf', key: 'bonusPrePts', unit: 'pt' },
    { label: 'Bonus dag', key: 'bonusDailyPts', unit: 'pt' },
    { label: 'Jokerpunten', key: 'jokerPts', unit: 'pt' },
    { label: 'Exact goed', key: 'exactHits', unit: '×' },
    { label: 'Toto goed', key: 'correctResults', unit: '×' },
  ]

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      {/* Speelse spotlights in de spelerskleuren — alleen op desktop; de grote
          blur-vlakken zijn op mobiel (vooral iOS Safari) duur om te schilderen */}
      {players.map((p, i) => (
        <div
          key={p.id}
          className="pointer-events-none absolute w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.13] hidden sm:block"
          style={{
            background: `radial-gradient(closest-side, ${colorById[p.id]}, transparent)`,
            top: i < 2 ? '-6rem' : 'auto',
            bottom: i >= 2 ? '-6rem' : 'auto',
            left: i % 2 === 0 ? '-8rem' : 'auto',
            right: i % 2 === 1 ? '-8rem' : 'auto',
          }}
        />
      ))}

      {/* Scheidsrechter-ballen rollen tijdens "Links Rechts" naar beneden — desktop only */}
      {playing && (
        <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden hidden sm:block" aria-hidden>
          {balls.map((b, i) => (
            <Image
              key={i}
              src="/referee.png" alt="" width={88} height={88} aria-hidden
              className="absolute top-0 rounded-full drop-shadow-xl"
              style={{
                left: `${b.left}%`,
                width: `${b.size}px`,
                height: `${b.size}px`,
                willChange: 'transform',
                animation: `confetti-fall ${b.duration}s linear ${b.delay}s infinite both`,
              }}
            />
          ))}
        </div>
      )}

      {/* Kruisje rechtsboven */}
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

      {/* Random figuur vliegt per run dwars over het scherm (Rick tégen de flow in).
          maxHeight begrenst de figuur zodat hij ook op een korte mobiele viewport
          volledig in beeld blijft. */}
      {fly && (
        <Image
          key={fly.key}
          src={`/${fly.src}`} alt="" width={420} height={420} aria-hidden loading="eager"
          className="pointer-events-none fixed left-0 z-40 h-auto w-auto object-contain drop-shadow-2xl"
          style={{
            top: `${fly.top}%`,
            width: `${fly.size}px`,
            maxWidth: fly.wide ? '85vw' : '72vw',
            maxHeight: fly.wide ? '90vh' : '50vh',
            willChange: 'transform',
            // Duur per figuur (standaard ~2.9s < de 3s run); langzamere figuren maken
            // hun oversteek niet helemaal af voordat de volgende beat ze vervangt.
            animation: `${fly.toRight ? 'cross-right' : 'cross-left'} ${fly.duration}s linear both`,
          }}
        />
      )}

      {/* Links/Rechts mascottes — schuiven van de zijkant in (buitenste laag) en
          wiebelen heen en weer (binnenste laag, zodat transforms niet botsen) */}
      <div
        className="pointer-events-none fixed top-2 sm:top-4 left-2 sm:left-8 z-40 transition-transform duration-700 ease-out"
        style={{ transform: shakeDir === 'left' ? 'translateX(0)' : 'translateX(120vw)' }}
        aria-hidden
      >
        <Image
          src="/links.png" alt="" width={280} height={280}
          className="w-44 sm:w-72 h-auto drop-shadow-2xl"
          style={{ animation: 'rock-left 1.1s ease-in-out infinite' }}
        />
      </div>
      <div
        className="pointer-events-none fixed top-2 sm:top-4 right-2 sm:right-8 z-40 transition-transform duration-700 ease-out"
        style={{ transform: shakeDir === 'right' ? 'translateX(0)' : 'translateX(-120vw)' }}
        aria-hidden
      >
        <Image
          src="/rechts.png" alt="" width={280} height={280}
          className="w-44 sm:w-72 h-auto drop-shadow-2xl"
          style={{ animation: 'rock-right 1.1s ease-in-out infinite' }}
        />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-10 sm:py-14 space-y-10">
        {/* ── Hero header (2:1) — random afbeelding, geen overlay/tekst ──── */}
        <header className="animate-fade-up">
          <div className="relative aspect-[2/1] -mx-4 sm:mx-0 sm:rounded-2xl overflow-hidden border-y sm:border border-white/10">
            <Image src={heroImage} alt="Padel Club" fill priority sizes="(max-width: 640px) 100vw, 768px" className="object-cover animate-hero-in" />
            {/* 🎾 blijft de Links Rechts-trigger — gecentreerd in de hero */}
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                onClick={doLinksRechts}
                aria-label="Links Rechts!"
                title="Links Rechts!"
                className="animate-podium-float text-4xl sm:text-5xl drop-shadow-lg cursor-pointer select-none transition-transform hover:scale-125 active:scale-95"
              >
                🎾
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {players.map((p) => (
              <span key={p.id} className="h-1.5 w-8 rounded-full" style={{ background: colorById[p.id] }} />
            ))}
          </div>
        </header>

        {/* ── Dagdashboard: vraag + uitslagen van de speeldag ───────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-wk-gold tracking-[0.2em] uppercase">📋 Dagdashboard</span>
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase">{fmtDate(dayLabel)}</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* spelers-legenda */}
          <div className="flex flex-wrap gap-3">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <span className="rounded-full ring-2 ring-offset-1 ring-offset-wk-bg" style={{ ['--tw-ring-color' as string]: colorById[p.id] }}>
                  <AvatarCircle username={p.username} avatarUrl={p.avatarUrl} size={22} />
                </span>
                <span className="text-xs font-semibold" style={{ color: colorById[p.id] }}>{firstName(p)}</span>
              </div>
            ))}
          </div>

          {/* Punten van vandaag — de vier naast elkaar */}
          <div className="grid grid-cols-4 gap-2 animate-fade-up">
            {players.map((p, i) => (
              <DayScoreCard
                key={p.id}
                p={p}
                color={colorById[p.id]}
                pts={dayPoints[p.id]}
                isLead={dayPoints[p.id] > 0 && dayPoints[p.id] === dayLead}
                delay={200 + i * 120}
              />
            ))}
          </div>

          {/* Voorspelde uitslagen van die dag */}
          {dayMatches.length === 0 ? (
            <p className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">
              Geen wedstrijden op deze dag.
            </p>
          ) : (
            dayMatches.map((m, mi) => (
              <div key={m.id} className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden animate-fade-up" style={{ animationDelay: `${0.1 + mi * 0.05}s` }}>
                <div className="px-4 py-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                      <span className="text-xs font-semibold text-wk-soft truncate">{m.home?.name ?? '?'}</span>
                      {m.home?.flag && <Image src={m.home.flag} alt={m.home.name} width={20} height={14} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />}
                    </div>
                    <span className="font-fun font-semibold text-base text-wk-text shrink-0 px-1">{m.actual ?? 'vs'}</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {m.away?.flag && <Image src={m.away.flag} alt={m.away.name} width={20} height={14} className="w-5 h-3.5 rounded-sm object-cover shrink-0" />}
                      <span className="text-xs font-semibold text-wk-soft truncate">{m.away?.name ?? '?'}</span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-center font-mono text-[10px] text-wk-muted tracking-[0.12em]">{fmtTime(m.time)}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/5">
                  {players.map((p) => {
                    const pr = m.preds[p.id]
                    const scored = pr?.pts != null
                    const good = scored && (pr!.pts as number) > 0
                    return (
                      <div key={p.id} className="px-3 py-2.5 min-w-0 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <PlayerAvatar p={p} color={colorById[p.id]} />
                          {scored && (
                            <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${good ? 'bg-wk-green/15 text-wk-green' : 'bg-wk-red/15 text-wk-red'}`}>{pr!.pts}</span>
                          )}
                        </div>
                        <p className={`font-fun font-medium text-lg ${pr?.text ? 'text-wk-text' : 'text-wk-muted/40'}`}>{pr?.text ?? '—'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        {/* ── Head-to-head-to-head-to-head ──────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-wk-gold tracking-[0.2em] uppercase">⚔️ De onderlinge strijd</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Ranglijst met telanimatie */}
          <div className="bg-wk-surface border border-white/10 rounded-2xl overflow-hidden">
            {ranked.map((p, i) => (
              <RankRow
                key={p.id}
                player={p}
                rank={i + 1}
                color={colorById[p.id]}
                topPts={ranked[0]?.totalPts ?? 1}
                isCurrent={p.id === currentUserId}
                delay={300 + i * 140}
              />
            ))}
          </div>

          {/* Categorie-vergelijking — kaart per categorie met 4 balken */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CATEGORIES.map((cat, ci) => {
              const max = Math.max(1, ...players.map((p) => p[cat.key] as number))
              const lead = Math.max(...players.map((p) => p[cat.key] as number))
              return (
                <div key={cat.label} className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3 animate-fade-up" style={{ animationDelay: `${0.2 + ci * 0.05}s` }}>
                  <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mb-2.5">{cat.label}</p>
                  <div className="space-y-2">
                    {players.map((p, pi) => {
                      const v = p[cat.key] as number
                      const isLead = v === lead && lead > 0
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <PlayerAvatar p={p} color={colorById[p.id]} size={26} />
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <GrowBar pct={(v / max) * 100} color={colorById[p.id]} delay={400 + ci * 60 + pi * 50} />
                          </div>
                          <span className={`font-mono text-[10px] w-9 text-right shrink-0 ${isLead ? 'text-wk-gold font-bold' : 'text-wk-soft'}`}>
                            {v}{cat.unit}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function RankRow({
  player, rank, color, topPts, isCurrent, delay,
}: {
  player: PadelPlayer; rank: number; color: string; topPts: number; isCurrent: boolean; delay: number
}) {
  const count = useCountUp(player.totalPts, delay)
  const pct = topPts > 0 ? (player.totalPts / topPts) * 100 : 0
  const medal = ['🥇', '🥈', '🥉'][rank - 1] ?? null
  return (
    <div className={`relative flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0 ${isCurrent ? 'bg-white/[0.03]' : ''}`}>
      {/* achtergrondbalk = aandeel t.o.v. koploper */}
      <div className="absolute inset-y-0 left-0 opacity-[0.08]" style={{ width: `${pct}%`, background: color }} />
      <span className="relative w-7 text-center shrink-0">
        {medal ? <span className="text-lg">{medal}</span> : <span className="font-mono text-sm text-wk-muted">{rank}</span>}
      </span>
      <span className="relative rounded-full ring-2 ring-offset-2 ring-offset-wk-surface shrink-0" style={{ ['--tw-ring-color' as string]: color }}>
        <AvatarCircle username={player.username} avatarUrl={player.avatarUrl} size={rank === 1 ? 44 : 36} />
      </span>
      <div className="relative flex-1 min-w-0">
        <p className="text-base font-bold truncate" style={{ color }}>{firstName(player)}</p>
        {player.fullName && <p className="font-mono text-[9px] text-wk-muted truncate leading-tight">{player.fullName}</p>}
      </div>
      <div className="relative text-right shrink-0">
        <span className="font-fun font-semibold text-3xl sm:text-4xl leading-none" style={{ color }}>{count}</span>
        <span className="font-mono text-[10px] text-wk-muted ml-1">pt</span>
      </div>
    </div>
  )
}
