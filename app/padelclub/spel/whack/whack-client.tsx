'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'
import TeamsPopup from '../teams-popup'
import ImmersiveToggle from '../immersive-toggle'

const HOLES = 9
const GAME_SECONDS = 30
// Spel-figuren staan los van /padelclub in /public/spelers (512×512, strak bijgesneden).
const FIGS = '/spelers'
// "Goede" figuren (+1). Rick is de boosdoener (-2): hij gaat altijd tegen de flow in.
const GOOD = ['ashi.png', 'bus.png', 'dejuul.png', 'ho.png', 'kim.png', 'trein.png', 'vince.png', 'pimp.png', 'lukaku.png']
const RICK = 'rick.png'

type Hole = { src: string; key: number; rick: boolean; scale: number; exploding?: boolean } | null

export default function WhackClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const [holes, setHoles] = useState<Hole[]>(Array(HOLES).fill(null))
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean } | null>(null)
  // Easter egg: tik je Rick, dan dendert een grote Rick over je scherm 💢
  const [rickFly, setRickFly] = useState(0)
  // Zwevende +1 / −2 labels per vak
  const [pops, setPops] = useState<{ id: number; idx: number; delta: number }[]>([])
  const popRef = useRef(0)

  const phaseRef = useRef(phase); phaseRef.current = phase
  const scoreRef = useRef(0)
  useEffect(() => { scoreRef.current = score }, [score])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const endAt = useRef(0)
  const keyRef = useRef(0)
  const audioCtx = useRef<AudioContext | null>(null)

  // Kort geluidje via Web Audio (geen asset): vrolijke 'pop' bij een goede tik,
  // lage buzz bij Rick.
  const playSfx = (rick: boolean) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx = audioCtx.current ?? (audioCtx.current = new Ctx())
      if (ctx.state === 'suspended') void ctx.resume()
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      if (rick) {
        osc.type = 'square'
        osc.frequency.setValueAtTime(160, t)
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.18)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
        osc.start(t); osc.stop(t + 0.22)
      } else {
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(620, t)
        osc.frequency.exponentialRampToValueAtTime(960, t + 0.09)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
        osc.start(t); osc.stop(t + 0.16)
      }
    } catch { /* geluid is optioneel */ }
  }

  const clearAll = () => {
    timers.current.forEach(clearTimeout); timers.current = []
    if (tick.current) { clearInterval(tick.current); tick.current = null }
  }
  useEffect(() => () => { clearAll(); void audioCtx.current?.close() }, [])

  const spawnOne = () => {
    setHoles((prev) => {
      const empty = prev.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0)
      if (!empty.length) return prev
      const idx = empty[Math.floor(Math.random() * empty.length)]
      const rick = Math.random() < 0.22
      const src = rick ? RICK : GOOD[Math.floor(Math.random() * GOOD.length)]
      const key = ++keyRef.current
      // Vult altijd het vak; goede figuren tot 30% ingezoomd, Rick tot 100% voor extra variatie
      const scale = 1 + Math.random() * (rick ? 1 : 0.3)
      const next = [...prev]
      next[idx] = { src, key, rick, scale }
      const elapsed = GAME_SECONDS * 1000 - (endAt.current - performance.now())
      const speed = Math.min(1, Math.max(0, elapsed / (GAME_SECONDS * 1000)))
      const dur = 820 - speed * 360 + Math.random() * 300
      const ht = setTimeout(() => {
        setHoles((p) => (p[idx]?.key === key ? p.map((h, i) => (i === idx ? null : h)) : p))
      }, dur)
      timers.current.push(ht)
      return next
    })
  }

  const scheduleSpawn = () => {
    if (phaseRef.current !== 'playing') return
    const elapsed = GAME_SECONDS * 1000 - (endAt.current - performance.now())
    const speed = Math.min(1, Math.max(0, elapsed / (GAME_SECONDS * 1000)))
    const gap = 520 - speed * 300 + Math.random() * 300
    const t = setTimeout(() => { spawnOne(); scheduleSpawn() }, gap)
    timers.current.push(t)
  }

  const endGame = () => {
    if (phaseRef.current !== 'playing') return
    phaseRef.current = 'over'
    setPhase('over')
    clearAll()
    setHoles(Array(HOLES).fill(null))
    const final = scoreRef.current
    const prevBest = board.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest })
    setBoard((prev) =>
      prev
        .map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e))
        .sort((a, b) => b.best - a.best),
    )
    void submitPadelScore('whack', final)
  }

  const start = () => {
    clearAll()
    setScore(0); scoreRef.current = 0
    setTimeLeft(GAME_SECONDS)
    setHoles(Array(HOLES).fill(null))
    setResult(null)
    setPhase('playing'); phaseRef.current = 'playing'
    endAt.current = performance.now() + GAME_SECONDS * 1000
    scheduleSpawn()
    tick.current = setInterval(() => {
      const remain = Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000))
      setTimeLeft(remain)
      if (remain <= 0) endGame()
    }, 200)
  }

  const whack = (idx: number) => {
    if (phaseRef.current !== 'playing') return
    const h = holes[idx]
    if (!h || h.exploding) return
    playSfx(h.rick)
    const delta = h.rick ? -2 : 1
    setScore((s) => Math.max(0, s + delta))
    if (h.rick) setRickFly((k) => k + 1)
    const pid = ++popRef.current
    setPops((p) => [...p, { id: pid, idx, delta }])
    const pt = setTimeout(() => setPops((p) => p.filter((x) => x.id !== pid)), 720)
    timers.current.push(pt)
    // even laten 'ontploffen' voordat-ie verdwijnt
    setHoles((p) => p.map((x, i) => (i === idx ? { ...x!, exploding: true } : x)))
    const t = setTimeout(() => {
      setHoles((p) => p.map((x, i) => (i === idx && x?.exploding ? null : x)))
    }, 270)
    timers.current.push(t)
  }

  return (
    <div data-game-root className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <TeamsPopup active={phase === 'playing'} />
      <ImmersiveToggle />
      {/* Easter egg: grote Rick dendert van links naar rechts als je 'm tikt */}
      {rickFly > 0 && (
        <div key={rickFly} className="pointer-events-none fixed inset-0 z-50 flex items-center overflow-hidden" aria-hidden>
          <Image
            src={`${FIGS}/rick.png`} alt="" width={460} height={460}
            onAnimationEnd={() => setRickFly(0)}
            className="h-auto w-[62vw] max-w-[460px] drop-shadow-2xl"
            style={{ animation: 'cross-right 1.15s cubic-bezier(0.4,0,0.7,1) both' }}
          />
        </div>
      )}
      <div className="pointer-events-none absolute -left-40 -top-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.12]" style={{ background: 'radial-gradient(closest-side, var(--color-wk-green), transparent)' }} />
      <div className="pointer-events-none absolute -right-40 -bottom-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.12]" style={{ background: 'radial-gradient(closest-side, var(--color-wk-gold), transparent)' }} />

      <button
        type="button" onClick={close} aria-label="Sluiten"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative max-w-md mx-auto gx-container px-4 py-10 sm:py-14 space-y-6">
        <header className="gx-hide text-center animate-fade-up">
          <Link href="/padelclub/spel" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.2em] uppercase mb-2 inline-block">← Spellen</Link>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Whack-a-flyer</h1>
        </header>

        {phase === 'playing' && (
          <div className="flex items-center justify-between bg-wk-surface border border-white/10 rounded-xl px-5 py-3">
            <div>
              <p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Score</p>
              <p className="font-score text-3xl leading-none text-wk-gold">{score}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Tijd</p>
              <p className={`font-score text-3xl leading-none ${timeLeft <= 5 ? 'text-wk-red' : 'text-wk-text'}`}>{timeLeft}</p>
            </div>
          </div>
        )}

        {phase !== 'idle' && (
          <div className="gx-grid grid grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden">
            {holes.map((h, i) => (
              <button
                key={i}
                type="button"
                onPointerDown={(e) => { e.preventDefault(); whack(i) }}
                disabled={phase !== 'playing'}
                className="relative aspect-square bg-wk-bg2 overflow-hidden select-none touch-none active:scale-95 transition-transform flex items-center justify-center"
                style={{ touchAction: 'none', ...(h?.exploding ? { animation: 'whack-shock 0.4s ease-out', ['--shock' as string]: h.rick ? 'var(--color-wk-red)' : 'var(--color-wk-green)' } : {}) } as React.CSSProperties}
              >
                {h && (
                  <span
                    key={h.key}
                    className={`pointer-events-none relative ${h.exploding ? '' : 'animate-pop'}`}
                    style={{
                      width: `${Math.round(h.scale * 100)}%`,
                      height: `${Math.round(h.scale * 100)}%`,
                      ...(h.exploding ? { animation: 'whack-pop 0.4s cubic-bezier(0.3,0,0.2,1) forwards' } : {}),
                    }}
                  >
                    <Image src={`${FIGS}/${h.src}`} alt="" fill className="object-contain drop-shadow-lg" sizes="140px" />
                  </span>
                )}
                {pops.filter((p) => p.idx === i).map((p) => (
                  <span
                    key={p.id}
                    className={`pointer-events-none absolute left-1/2 top-1/2 font-score text-3xl sm:text-4xl drop-shadow-[0_2px_0_rgba(0,0,0,0.5)] ${p.delta < 0 ? 'text-wk-red' : 'text-wk-green'}`}
                    style={{ animation: 'whack-float 0.72s cubic-bezier(0.2,0.7,0.3,1) forwards' }}
                  >
                    {p.delta > 0 ? `+${p.delta}` : p.delta}
                  </span>
                ))}
              </button>
            ))}
          </div>
        )}

        {phase === 'idle' && (
          <div className="bg-wk-surface border border-white/10 rounded-2xl px-5 py-6 text-center space-y-4 animate-fade-up">
            <p className="text-5xl">🎾</p>
            <p className="text-sm text-wk-soft leading-relaxed">
              Tik zo snel mogelijk op de figuren die opduiken — <b className="text-wk-green">+1</b> per tik.
              Maar pas op voor <b className="text-wk-red">Rick</b> 💢: die gaat tégen de flow in en kost je <b className="text-wk-red">−2</b>.
              Je hebt <b>{GAME_SECONDS} seconden</b>.
            </p>
            <button onClick={start} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
              Start
            </button>
          </div>
        )}

        {phase === 'over' && result && (
          <div className="bg-wk-surface border border-wk-gold/40 rounded-2xl px-5 py-6 text-center space-y-3 animate-podium-pop" style={{ boxShadow: '0 0 24px rgba(244,185,46,0.18)' }}>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.2em] uppercase">Klaar!</p>
            <p className="font-score text-5xl text-wk-gold leading-none">{result.score}</p>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">punten</p>
            {result.record && <p className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase">🏆 Nieuw persoonlijk record!</p>}
            <button onClick={start} className="font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
              Nog een keer
            </button>
          </div>
        )}

        <div className="gx-hide"><GameLeaderboard entries={board} currentUserId={currentUserId} /></div>
      </div>
    </div>
  )
}
