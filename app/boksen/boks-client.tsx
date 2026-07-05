'use client'

// Knokstukken — 1v1 arcade-boksen met de collega-koppen als doelwit. Jab, hoek, blok,
// knock-downs met de teller (RAM spatie om op te staan) en de jury op punten na de eindbel.
// Canvas 2D; vs computer of 2 spelers op één toetsenbord.

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  COUNT_MAX, DEFAULT_ROUNDS, DODGE_TIME, FIXED_DT, GETUP_BASE, GETUP_PER_KD, HOOK_TOTAL, HOOK_WINDUP,
  JAB_RANGE, JAB_TOTAL, JAB_WINDUP, MAX_HP, MAX_STAM, UPPERCUT_TOTAL,
  UPPERCUT_WINDUP, ULT_MAX, ULT_RANGE, ULT_TOTAL, ULT_WINDUP,
} from '@/lib/boks/constants'
import { makeMatch, step } from '@/lib/boks/sim'
import { aiInput } from '@/lib/boks/ai'
import type { BoksEvent, BoksInput, Fighter, Match, Side } from '@/lib/boks/types'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile, isCoarsePointer } from '@/components/playground/mobile-play'
import { TouchGamepad } from '@/components/playground/touch-gamepad'

const CORNER_COLORS = ['#E63946', '#F4B92E'] as const
type Mode = 'ai' | '2p'

const DIFFICULTY = [
  { label: 'Makkelijk', val: 0.25 },
  { label: 'Normaal', val: 0.55 },
  { label: 'Pittig', val: 0.85 },
]

const POOL_ALPHA = [...PLAYER_POOL].sort((a, b) => a.name.localeCompare(b.name, 'nl'))

type Particle = { x: number; y: number; vx: number; vy: number; life: number; mg?: boolean; ult?: boolean; rot?: number; vr?: number }

type Game = {
  mode: Mode
  difficulty: number
  match: Match
  humans: Partial<Record<Side, 'p1' | 'p2'>>
  shakeT: number
  slowmoT: number // resterende slow-motion na een knock-down
}

export default function BoksClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const keysRef = useRef<Set<string>>(new Set())
  const particlesRef = useRef<Particle[]>([])

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [mode, setMode] = useState<Mode>('ai')
  const [difficulty, setDifficulty] = useState(0.55)
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS)
  const [p1Pick, setP1Pick] = useState(-1) // index in POOL_ALPHA, -1 = willekeurig
  const [p2Pick, setP2Pick] = useState(-1)
  const [popup, setPopup] = useState<{ text: string; color: string; n: number } | null>(null)
  const [matchOver, setMatchOver] = useState<{ text: string; color: string; sub: string } | null>(null)
  const popupN = useRef(0)
  const soundsRef = useRef<Record<string, HTMLAudioElement>>({})
  const bgmRef = useRef<HTMLAudioElement | null>(null) // zacht achtergrondmuziekje tijdens het gevecht

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
  }, [])

  // Geluiden voorladen (uit public/sfx).
  useEffect(() => {
    for (const f of ['quick-punch', 'strongpunch', 'slap', 'falconpunch', 'ko', 'boxing-bell', 'anime-wow', 'bruh']) {
      const a = new window.Audio(`/sfx/${f}.mp3`)
      a.preload = 'auto'
      soundsRef.current[f] = a
    }
    const bgm = new window.Audio('/sfx/wii-sports-boxing.mp3')
    bgm.preload = 'auto'
    bgm.loop = true
    bgm.volume = 0.22 // zachtjes onder het gevecht
    bgmRef.current = bgm
    return () => { bgm.pause() }
  }, [])

  const playSound = useCallback((name: string) => {
    const a = soundsRef.current[name]
    if (!a) return
    try { a.currentTime = 0; void a.play() } catch { /* autoplay geweigerd → stil */ }
  }, [])

  const startMatch = useCallback(() => {
    // Kiezers respecteren; 'willekeurig' pakt een (andere) verrassing uit de pool.
    const i1 = p1Pick >= 0 ? p1Pick : Math.floor(Math.random() * POOL_ALPHA.length)
    let i2 = p2Pick >= 0 ? p2Pick : Math.floor(Math.random() * POOL_ALPHA.length)
    if (i1 === i2) i2 = (i2 + 1 + Math.floor(Math.random() * (POOL_ALPHA.length - 1))) % POOL_ALPHA.length
    const a = POOL_ALPHA[i1]
    const b = POOL_ALPHA[i2]
    gameRef.current = {
      mode, difficulty,
      match: makeMatch([
        { face: a.face, name: a.name, traits: a.traits },
        { face: b.face, name: b.name, traits: b.traits },
      ], rounds),
      humans: mode === 'ai' ? { 0: 'p1' } : { 0: 'p1', 1: 'p2' },
      shakeT: 0, slowmoT: 0,
    }
    particlesRef.current = []
    setPopup(null)
    setMatchOver(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [mode, difficulty, rounds, p1Pick, p2Pick])

  useEffect(() => {
    if (stage !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const keys = keysRef.current

    // De bel bij aanvang + zacht achtergrondmuziekje tijdens het gevecht.
    playSound('boxing-bell')
    const bgm = bgmRef.current
    if (bgm) { try { bgm.currentTime = 0; void bgm.play() } catch { /* autoplay geweigerd */ } }

    const keyInput = (set: 'p1' | 'p2', merged: boolean): BoksInput => {
      const has = (c: string) => keys.has(c)
      if (set === 'p1') {
        return {
          move: ((has('KeyD') || (merged && has('ArrowRight'))) ? 1 : 0) - ((has('KeyA') || (merged && has('ArrowLeft'))) ? 1 : 0),
          block: has('KeyS') || (merged && has('ArrowDown')),
          jab: has('Space') || (merged && has('Enter')),
          hook: has('KeyE') || (merged && has('Slash')),
          uppercut: has('KeyQ') || (merged && has('Period')),
          ultimate: has('KeyR') || (merged && has('Comma')),
          dodge: has('KeyW') || (merged && has('ArrowUp')),
        }
      }
      return {
        move: (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0),
        block: has('ArrowDown'),
        jab: has('Enter'),
        hook: has('Slash'),
        uppercut: has('Period'),
        ultimate: has('Comma'),
        dodge: has('ArrowUp'),
      }
    }

    const spawnSweat = (f: Fighter, dir: number, heavy: boolean) => {
      const n = heavy ? 9 : 5
      for (let i = 0; i < n; i++) {
        particlesRef.current.push({
          x: f.x, y: 378,
          vx: dir * (60 + Math.random() * 160) + (Math.random() - 0.5) * 80,
          vy: -120 - Math.random() * 160,
          life: 0.55 + Math.random() * 0.3,
        })
      }
    }

    const show = (text: string, color: string) => {
      popupN.current++
      setPopup({ text, color, n: popupN.current })
    }

    const handleEvents = (g: Game, events: BoksEvent[]) => {
      const m = g.match
      for (const ev of events) {
        if (ev.type === 'hit' && !ev.blocked) {
          const def = m.f[ev.by === 0 ? 1 : 0]
          const heavy = ev.kind === 'hook' || ev.kind === 'uppercut' || ev.kind === 'ultimate'
          spawnSweat(def, ev.by === 0 ? 1 : -1, heavy)
          g.shakeT = Math.max(g.shakeT, ev.kind === 'ultimate' ? 0.4 : heavy ? 0.22 : 0.1)
          // Rake treffer: hoek (E) = slap, uppercut = strongpunch, jab = quick-punch.
          // De ultimate heeft z'n eigen falconpunch (op het 'ultimate'-event).
          if (ev.kind === 'hook') playSound('slap')
          else if (ev.kind === 'uppercut') playSound('strongpunch')
          else if (ev.kind === 'jab') playSound('quick-punch')
          if (ev.clean) show(`✨ ZUIVER! ${m.f[ev.by].name}`, CORNER_COLORS[ev.by])
        } else if (ev.type === 'ultimate') {
          g.shakeT = Math.max(g.shakeT, 0.3)
          playSound('falconpunch')
          show(`💢 ${m.f[ev.by].name.toUpperCase()} — HAYMAKER!`, CORNER_COLORS[ev.by])
        } else if (ev.type === 'dodge') {
          // Je zware uithaal (ult/uppercut) in de lucht geslagen → bruh.
          if (ev.kind === 'ultimate' || ev.kind === 'uppercut') playSound('bruh')
          show(`💨 ${m.f[ev.by].name} wijkt uit!`, CORNER_COLORS[ev.by])
        } else if (ev.type === 'knockdown') {
          g.shakeT = 0.6
          g.slowmoT = 0.95 // dramatische slow-motion op de knal
          playSound('ko')
          const dn = m.f[ev.who]
          const dir = ev.who === 0 ? -1 : 1 // weg van de vuist
          const hx = dn.x + dir * 4
          const hy = 470 - 46 - 78 // borst-/kophoogte (FLOOR - body - head)
          // De gebitsbeschermer vliegt eruit, met wat kwijl-spatten.
          particlesRef.current.push({ x: hx, y: hy, vx: dir * (180 + Math.random() * 120), vy: -230 - Math.random() * 90, life: 1.1, mg: true, rot: 0, vr: (Math.random() - 0.5) * 20 })
          for (let k = 0; k < 8; k++) particlesRef.current.push({ x: hx, y: hy, vx: dir * (60 + Math.random() * 200), vy: -120 - Math.random() * 160, life: 0.5 + Math.random() * 0.3 })
          show(`💥 ${m.f[ev.who].name.toUpperCase()} GAAT NEER!`, '#ff5a4d')
        } else if (ev.type === 'getup') {
          show(`😤 ${m.f[ev.who].name} staat weer!`, '#7db8e8')
        } else if (ev.type === 'bell' && !ev.last) {
          show(`🔔 Einde ronde ${ev.round}`, '#f4b92e')
        } else if (ev.type === 'round') {
          show(`🔔 RONDE ${ev.round}`, '#f4b92e')
        } else if (ev.type === 'end') {
          if (ev.how === 'ko' || ev.how === 'tko') playSound('anime-wow') // wow-factor bij een knock-out
          const how = ev.how === 'ko' ? 'Knock-out!' : ev.how === 'tko' ? 'TKO — de scheids grijpt in' : ev.how === 'points' ? 'Op punten (de jury heeft geteld)' : 'Gelijkspel — niemand durft te winnen'
          const wn = ev.winner
          setMatchOver(wn === -1
            ? { text: 'Gelijkspel', color: '#ffffff', sub: how }
            : { text: `${m.f[wn].name} wint! 🏆`, color: CORNER_COLORS[wn], sub: how })
        }
      }
    }

    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const g = gameRef.current
      if (!g) return
      acc += Math.min(0.1, (now - last) / 1000)
      last = now
      while (acc >= FIXED_DT) {
        if (g.slowmoT > 0) g.slowmoT = Math.max(0, g.slowmoT - FIXED_DT)
        const sdt = FIXED_DT * (g.slowmoT > 0 ? 0.34 : 1) // slow-motion na een knock-down
        const merged = g.mode === 'ai'
        const inputs: [BoksInput, BoksInput] = [
          g.humans[0] ? keyInput(g.humans[0], merged) : aiInput(g.match, 0, g.difficulty),
          g.humans[1] ? keyInput(g.humans[1], merged && false) : aiInput(g.match, 1, g.difficulty),
        ]
        const events = step(g.match, inputs, sdt)
        if (events.length) handleEvents(g, events)
        if (g.shakeT > 0) g.shakeT = Math.max(0, g.shakeT - FIXED_DT)
        // Ultimate-rush: gouden vonken-spoor achter de stormende bokser.
        for (const f of g.match.f) {
          if (f.state !== 'ultimate') continue
          const d = f.side === 0 ? 1 : -1
          for (let k = 0; k < 2; k++) particlesRef.current.push({
            x: f.x - d * (10 + Math.random() * 20), y: 470 - 30 - Math.random() * 70,
            vx: -d * (60 + Math.random() * 120), vy: -40 + Math.random() * 80,
            life: 0.3 + Math.random() * 0.25, ult: true,
          })
        }
        // zweetdruppels + gebitsbeschermer
        for (const pt of particlesRef.current) {
          pt.x += pt.vx * sdt
          pt.y += pt.vy * sdt
          pt.vy += 700 * sdt
          if (pt.vr !== undefined) pt.rot = (pt.rot ?? 0) + pt.vr * sdt
          pt.life -= sdt
        }
        particlesRef.current = particlesRef.current.filter((pt) => pt.life > 0)
        acc -= FIXED_DT
      }
      draw(ctx, canvas, g, facesRef.current, particlesRef.current, now)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Slash'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
      if (e.code === 'Escape') setStage('menu')
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keys.clear()
      if (bgmRef.current) { bgmRef.current.pause(); bgmRef.current.currentTime = 0 }
    }
  }, [stage, playSound])

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/knokstukken.png" alt="Knokstukken" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-4xl space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Modus">
              <Seg options={['Vs computer', '2 spelers']} value={mode === 'ai' ? 0 : 1} onChange={(i) => setMode(i === 0 ? 'ai' : '2p')} />
            </MenuRow>
            {mode === 'ai' && (
              <MenuRow label="Moeilijkheid">
                <Seg options={DIFFICULTY.map((d) => d.label)} value={DIFFICULTY.findIndex((d) => d.val === difficulty)} onChange={(i) => setDifficulty(DIFFICULTY[i].val)} />
              </MenuRow>
            )}
            <MenuRow label="Rondes">
              <Seg options={['1', '2', '3']} value={rounds - 1} onChange={(i) => setRounds(i + 1)} />
            </MenuRow>

            {/* Jij links (rode hoek), tegenstander rechts (gele hoek) — rustig en duidelijk gescheiden. */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:border-r sm:border-white/10 sm:pr-5">
                <FighterPicker label={mode === 'ai' ? 'Jouw bokser' : 'Bokser 1 (rood)'} pick={p1Pick} onPick={setP1Pick} color={CORNER_COLORS[0]} />
              </div>
              <FighterPicker label={mode === 'ai' ? 'Tegenstander' : 'Bokser 2 (geel)'} pick={p2Pick} onPick={setP2Pick} color={CORNER_COLORS[1]} />
            </div>

            <button onClick={startMatch}
              className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
              Start het gevecht 🥊
            </button>
          </div>

          <div className="max-w-lg text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            P1: A/D lopen · S blok · W ontwijk · spatie jab · E hoek · Q uppercut · R ultimate — P2: pijltjes · ↓ · ↑ · enter · / · . · ,<br />
            snelle stoten · W/↑ = wegwippen met i-frames (elke stoot mist) · uppercut ramt door de dekking · ultimate (R) bij volle meter = vloert<br />
            neergeslagen? RAM spatie om op te staan · 3× neer = TKO · geen KO? de jury telt de punten · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          <button onClick={() => setStage('menu')}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>

          {isTouch && !portrait && mode === 'ai' && (
            <TouchGamepad dir="lr" buttons={[
              { code: 'KeyW', label: 'Duik', color: 'border-sky-300/40 bg-sky-500/25' },
              { code: 'KeyS', label: 'Blok', color: 'border-white/25 bg-white/10' },
              { code: 'KeyE', label: 'Hoek', color: 'border-orange-300/40 bg-orange-500/25' },
              { code: 'KeyQ', label: 'Upper', color: 'border-fuchsia-300/40 bg-fuchsia-500/25' },
              { code: 'KeyR', label: 'Ult', color: 'border-amber-300/50 bg-amber-500/25' },
              { code: 'Space', label: 'Jab', color: 'border-rose-300/50 bg-rose-500/30', big: true },
            ]} />
          )}
          {isTouch && portrait && <RotateNotice game="Knokstukken" />}

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[18%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-5xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: popup.color }}>
                {popup.text}
              </h2>
            </div>
          )}

          {matchOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex flex-col items-center gap-4 text-center animate-fade-up">
                <h2 className="font-score text-7xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: matchOver.color }}>{matchOver.text}</h2>
                <p className="font-mono text-sm uppercase tracking-[0.2em] text-wk-soft">{matchOver.sub}</p>
                <div className="flex gap-3 pt-2">
                  <button onClick={startMatch} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">Rematch</button>
                  <button onClick={() => setStage('menu')} className="rounded-xl border border-white/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-soft hover:border-white/35">Menu</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Renderer ──────────────────────────────────────────────────────────────────
const W = 1000
const H = 560
const FLOOR_Y = 470 // waar de voeten staan

function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, faces: Record<string, HTMLImageElement>, particles: Particle[], now: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#0a0f18'
  ctx.fillRect(0, 0, cw, ch)

  const sc = Math.min(cw / W, ch / H) * (isCoarsePointer() ? 1.2 : 1) // mobiel: extra ingezoomd
  const ox = (cw - W * sc) / 2 + (g.shakeT > 0 ? (Math.random() - 0.5) * 12 * g.shakeT : 0)
  const oy = (ch - H * sc) / 2 + (g.shakeT > 0 ? (Math.random() - 0.5) * 12 * g.shakeT : 0)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(sc, sc)

  // Publiek: rijen bobbende stipjes (deterministische kleuren — geen geflikker).
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 34; i++) {
      const hx = (i * 2654435761 + row * 40503) % 100
      const bob = Math.sin(now * 0.003 + i * 1.7 + row) * 2
      ctx.beginPath()
      ctx.arc(20 + i * 29 + (row % 2) * 14, 52 + row * 34 + bob, 9, 0, Math.PI * 2)
      ctx.fillStyle = `hsl(${(hx * 3.6) | 0} 32% ${26 + row * 4}%)`
      ctx.fill()
    }
  }
  // spotlight op de ring
  const spot = ctx.createRadialGradient(W / 2, FLOOR_Y - 80, 60, W / 2, FLOOR_Y - 80, 560)
  spot.addColorStop(0, 'rgba(255,240,200,0.10)')
  spot.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, W, H)

  // Ring: mat + hoekpalen + touwen (touwen achter de vechters).
  ctx.fillStyle = '#2a3550'
  ctx.fillRect(60, FLOOR_Y - 6, W - 120, 64) // apron
  ctx.fillStyle = '#3d4d74'
  ctx.fillRect(80, FLOOR_Y - 2, W - 160, 14) // matrand
  ctx.fillStyle = '#46587f'
  ctx.fillRect(80, FLOOR_Y + 12, W - 160, 4)
  for (const px of [86, W - 86]) {
    ctx.fillStyle = px < W / 2 ? CORNER_COLORS[0] : CORNER_COLORS[1]
    ctx.fillRect(px - 7, FLOOR_Y - 190, 14, 190)
    ctx.beginPath()
    ctx.arc(px, FLOOR_Y - 192, 9, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let r = 0; r < 3; r++) {
    const ry = FLOOR_Y - 168 + r * 52
    ctx.strokeStyle = r === 1 ? 'rgba(230,235,245,0.75)' : 'rgba(160,175,205,0.6)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(86, ry)
    ctx.quadraticCurveTo(W / 2, ry + 6, W - 86, ry)
    ctx.stroke()
  }

  // De vechters (verliezer/ligger als laatste tekenen zodat-ie vóór ligt).
  const order = g.match.f[0].state === 'down' ? [g.match.f[1], g.match.f[0]] : [g.match.f[0], g.match.f[1]]
  for (const f of order) drawFighter(ctx, f, faces, now)

  // Zweet + de wegvliegende gebitsbeschermer.
  for (const pt of particles) {
    ctx.globalAlpha = Math.min(1, pt.life * 2.2)
    if (pt.mg) {
      // Gebitsbeschermer: een tuitend wit hoefijzertje dat door de lucht tolt.
      ctx.save()
      ctx.translate(pt.x, pt.y)
      ctx.rotate(pt.rot ?? 0)
      ctx.strokeStyle = '#eef2f6'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0.3 * Math.PI, 1.7 * Math.PI)
      ctx.stroke()
      ctx.restore()
    } else if (pt.ult) {
      // Ultimate-rush: gouden vonk met een gloed.
      ctx.fillStyle = 'rgba(255,190,60,0.95)'
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,230,150,0.5)'
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = 'rgba(150,210,255,0.85)'
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  // Count-overlay: de teller van de scheids.
  const m = g.match
  if (m.phase === 'count' && m.down >= 0) {
    const c = Math.min(COUNT_MAX, Math.floor(m.count) + 1)
    ctx.textAlign = 'center'
    ctx.font = '900 120px monospace'
    ctx.fillStyle = 'rgba(255,90,77,0.92)'
    const pop = 1 + (1 - (m.count % 1)) * 0.12
    ctx.save()
    ctx.translate(W / 2, 240)
    ctx.scale(pop, pop)
    ctx.fillText(String(c), 0, 0)
    ctx.restore()
    if (g.humans[m.down as Side]) {
      const downed = m.f[m.down as Side]
      const need = GETUP_BASE + (downed.knockdowns - 1) * GETUP_PER_KD
      ctx.font = 'bold 22px monospace'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`🥊 RAM SPATIE! (${downed.getupMeter}/${need})`, W / 2, 292)
    }
  }
  if (m.phase === 'rest') {
    ctx.textAlign = 'center'
    ctx.font = 'bold 30px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(`☕ Even naar de hoek… ronde ${m.round + 1} komt eraan`, W / 2, 250)
  }

  ctx.restore()

  // ── HUD (schermruimte) ────────────────────────────────────────────────────
  drawHud(ctx, cw, g, faces)
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, faces: Record<string, HTMLImageElement>, now: number) {
  const d = f.side === 0 ? 1 : -1
  const col = CORNER_COLORS[f.side]
  const img = faces[f.face]
  const drawHead = (hx: number, hy: number, r: number, rot = 0) => {
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(rot)
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, -r, -r, r * 2, r * 2)
    } else {
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = '#e8b48c'
      ctx.fill()
    }
    ctx.restore()
  }
  // Handschoen + de arm ernaartoe: een huidkleurige onderarm vanaf de schouder, met een
  // korte mouw in teamkleur, en dan de rode want er bovenop.
  const glove = (gx: number, gy: number, r = 12) => {
    if (f.state !== 'down') {
      const sx = f.x + d * 7 // schouder, iets naar de slag-kant
      const sy = FLOOR_Y - 52
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#e8b48c' // onderarm (huid)
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(gx, gy)
      ctx.stroke()
      ctx.strokeStyle = col // mouwtje bij de schouder
      ctx.lineWidth = 10
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + (gx - sx) * 0.34, sy + (gy - sy) * 0.34)
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
    ctx.beginPath()
    ctx.arc(gx, gy, r, 0, Math.PI * 2)
    ctx.fillStyle = '#c2242e'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // schaduw
  ctx.beginPath()
  ctx.ellipse(f.x, FLOOR_Y + 6, 34, 9, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fill()

  if (f.state === 'down') {
    // Tegen het canvas: languit, kop opzij — maar wél rechtop leesbaar (lichte kanteling).
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.ellipse(f.x + d * 8, FLOOR_Y - 12, 40, 15, 0, 0, Math.PI * 2)
    ctx.fill()
    glove(f.x + d * 44, FLOOR_Y - 10, 10)
    const hx = f.x - d * 38
    const hy = FLOOR_Y - 18
    drawHead(hx, hy, 31, -d * 0.3)
    // een traantje dat langzaam wegdruppelt 😢
    const drip = (now % 1500) / 1500 * 16
    const tx = hx + d * 12
    const ty = hy + 8 + drip
    ctx.fillStyle = 'rgba(120,195,255,0.9)'
    ctx.beginPath()
    ctx.moveTo(tx, ty - 6)
    ctx.quadraticCurveTo(tx + 4, ty, tx, ty + 4)
    ctx.quadraticCurveTo(tx - 4, ty, tx, ty - 6)
    ctx.fill()
    return
  }

  // Dodge: diep door de knieën + lijf naar achteren wippen (weg van de tegenstander).
  const dodgeP = f.state === 'dodge' ? Math.sin(Math.min(1, f.t / DODGE_TIME) * Math.PI) : 0
  const crouch = f.state === 'block' ? 8 : dodgeP * 22
  const lean = -d * dodgeP * 20 // hele lijf leunt naar achteren tijdens de uitwijk
  const sway = f.state === 'win' ? 0 : Math.sin(now * 0.0035 + f.side * 2) * 3
  const bodyY = FLOOR_Y - 46 + crouch

  // benen (bokshouding: voorste been iets naar voren)
  ctx.fillStyle = '#1d2430'
  ctx.fillRect(f.x + d * 12 - 6, FLOOR_Y - 34, 12, 34)
  ctx.fillRect(f.x - d * 14 - 6, FLOOR_Y - 32, 12, 32)
  ctx.fillStyle = '#0e1218'
  ctx.fillRect(f.x + d * 12 - 9, FLOOR_Y - 1, 18, 7) // boksschoenen iets lager (bij de mat)
  ctx.fillRect(f.x - d * 14 - 9, FLOOR_Y + 1, 18, 6)
  // broekje + lijf
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.ellipse(f.x, bodyY + 14, 22, 20, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8b48c'
  ctx.beginPath()
  ctx.ellipse(f.x, bodyY - 6, 19, 18, 0, 0, Math.PI * 2)
  ctx.fill()

  // kop (groter) — zwaait idle mee, klapt naar achteren bij een treffer
  const headR = 32
  const hx = f.x + d * 4 + sway - d * f.headKnock * 16 + lean * 1.3
  const hy = bodyY - 37 - crouch * 0.4 + f.headKnock * 4
  if (f.headKnock > 0.25) {
    ctx.beginPath()
    ctx.arc(hx, hy, headR + 6, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,80,60,${f.headKnock * 0.35})`
    ctx.fill()
  }
  drawHead(hx, hy, headR, -d * f.headKnock * 0.5 + (f.state === 'hook' ? -d * 0.12 : 0))

  // handschoenen per state
  const shoulderX = f.x + d * 10
  const shoulderY = bodyY - 10
  if (f.state === 'jab') {
    const wu = JAB_WINDUP
    const p = f.t < wu ? f.t / wu : Math.max(0, 1 - (f.t - wu) / (JAB_TOTAL - wu))
    glove(shoulderX + d * (18 + p * (JAB_RANGE - 34)), shoulderY - 8)
    glove(f.x + d * 6, hy + 14)
  } else if (f.state === 'hook') {
    const wu = HOOK_WINDUP
    const p = f.t < wu ? f.t / wu : 1
    const ret = f.t > wu ? Math.max(0, 1 - (f.t - wu) / (HOOK_TOTAL - wu)) : 1
    const ang = -1.35 + p * 2.1 // van achter de rug, over de boog naar voren
    glove(shoulderX + d * Math.cos(ang) * 52 * ret, shoulderY - 14 + Math.sin(ang) * 30 * ret, 14)
    glove(f.x + d * 8, hy + 16)
  } else if (f.state === 'uppercut') {
    // Opstoot: eerst diep door de knieën laden (glove zakt laag bij de heup), dan een explosieve
    // boog omhoog tot vér boven de kop — met een korte motion-streak langs de baan.
    const wu = UPPERCUT_WINDUP
    const load = f.t < wu ? f.t / wu : 1
    const p = f.t < wu ? 0 : Math.max(0, 1 - (f.t - wu) / (UPPERCUT_TOTAL - wu))
    // baan: van laag (heup) naar hoog (boven de kop), iets naar voren
    const gx = f.x + d * (6 + load * 6 + p * 30)
    const gy = bodyY + 26 - load * 10 - p * 104 // eindigt boven het hoofd
    if (p > 0.1) { // opwaartse veeg-streak
      ctx.strokeStyle = 'rgba(255,240,180,0.5)'
      ctx.lineWidth = 7
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(gx, gy + 40 * p); ctx.lineTo(gx, gy); ctx.stroke()
      ctx.lineCap = 'butt'
    }
    glove(gx, gy, 15)
    glove(f.x - d * 6, hy + 14)
  } else if (f.state === 'ultimate') {
    // Haymaker: eerst ver naar achteren laden, dan een enorme uithaal vooruit + gloed.
    const wu = ULT_WINDUP
    const load = Math.min(1, f.t / wu)
    const p = f.t < wu ? -load : Math.max(0, 1 - (f.t - wu) / (ULT_TOTAL - wu))
    const gx = shoulderX + d * (p >= 0 ? 20 + p * (ULT_RANGE - 30) : -18 + p * 20)
    ctx.beginPath()
    ctx.arc(gx, shoulderY - 10, 22, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,180,40,0.35)'
    ctx.fill()
    glove(gx, shoulderY - 10, 17)
    glove(f.x - d * 6, hy + 14)
  } else if (f.state === 'dodge') {
    // Wegwippen: handschoenen dicht bij de kop, hoofd al mee naar achteren geleund.
    glove(hx + d * 14, hy + 4, 13)
    glove(hx + d * 2, hy + 14, 13)
  } else if (f.state === 'block') {
    glove(hx + d * 16, hy + 2, 13)
    glove(hx + d * 4, hy + 12, 13)
  } else if (f.state === 'hit') {
    glove(f.x + d * 20, bodyY + 2)
    glove(f.x - d * 2, bodyY + 6)
  } else if (f.state === 'win') {
    const w = Math.sin(now * 0.008) * 6
    glove(f.x - 22, hy - 34 + w, 13)
    glove(f.x + 22, hy - 34 - w, 13)
  } else {
    // dekking
    glove(shoulderX + d * 16, shoulderY - 4)
    glove(f.x + d * 4, hy + 16)
  }
}

function drawHud(ctx: CanvasRenderingContext2D, cw: number, g: Game, faces: Record<string, HTMLImageElement>) {
  const m = g.match
  const bar = (x: number, right: boolean, f: Fighter) => {
    const bw = Math.min(330, cw * 0.34)
    const bx = right ? x - bw : x
    // HP
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(bx, 16, bw, 16)
    const hpFrac = Math.max(0, f.hp / MAX_HP)
    ctx.fillStyle = hpFrac > 0.5 ? '#2EA84B' : hpFrac > 0.25 ? '#F4B92E' : '#E63946'
    ctx.fillRect(right ? bx + bw * (1 - hpFrac) : bx, 16, bw * hpFrac, 16)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, 16, bw, 16)
    // stamina
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(bx, 36, bw, 7)
    const st = f.stamina / MAX_STAM
    ctx.fillStyle = '#4FA8E0'
    ctx.fillRect(right ? bx + bw * (1 - st) : bx, 36, bw * st, 7)
    // ultimate-meter (goud; pulseert + label "R!" als-ie vol is)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(bx, 45, bw, 6)
    const ult = f.ultimate / ULT_MAX
    const full = ult >= 1
    ctx.fillStyle = full ? (Math.floor(performance.now() / 160) % 2 ? '#ffd24a' : '#ff8a1a') : '#a678d8'
    ctx.fillRect(right ? bx + bw * (1 - ult) : bx, 45, bw * ult, 6)
    if (full) {
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = right ? 'right' : 'left'
      ctx.fillStyle = '#ffd24a'
      ctx.fillText('★ ULTIMATE — R!', right ? bx + bw : bx, 68)
    }
    // naam + kopje
    const img = faces[f.face]
    const ix = right ? x - bw - 40 : x + bw + 8
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(ix + 16, 28, 16, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, ix, 12, 32, 32)
      ctx.restore()
    }
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = right ? 'right' : 'left'
    ctx.fillStyle = CORNER_COLORS[f.side]
    ctx.fillText(`${f.name} · ${f.points}p`, right ? bx + bw : bx, 60)
  }
  bar(18, false, m.f[0])
  bar(cw - 18, true, m.f[1])

  ctx.textAlign = 'center'
  ctx.font = 'bold 18px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  const mm = Math.floor(m.clock / 60)
  const ss = Math.floor(m.clock % 60).toString().padStart(2, '0')
  ctx.fillText(`${mm}:${ss}`, cw / 2, 30)
  ctx.font = '11px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(`RONDE ${m.round}/${m.rounds}`, cw / 2, 48)
}

// ── Menu-hulpjes ──────────────────────────────────────────────────────────────
function MenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">{label}</span>
      {children}
    </div>
  )
}

function Seg({ options, value, onChange }: { options: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="flex rounded-lg border border-white/12 bg-wk-bg2 p-0.5">
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(i)}
          className={`rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${i === value ? 'bg-wk-gold/20 text-wk-gold' : 'text-wk-soft hover:text-wk-text'}`}>
          {o}
        </button>
      ))}
    </div>
  )
}

// Bokser-kiezer: rijtje koppen (klik = kiezen, nogmaals = terug naar willekeurig).
function FighterPicker({ label, pick, onPick, color }: { label: string; pick: number; onPick: (i: number) => void; color: string }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">
        {label} <span style={{ color }}>{pick >= 0 ? `— ${POOL_ALPHA[pick].name}` : '— willekeurig'}</span>
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {POOL_ALPHA.map((p, i) => (
          <button key={p.face} onClick={() => onPick(pick === i ? -1 : i)} title={`${p.name} (${p.tag})`}
            className={`group flex flex-col items-center gap-1 transition ${pick === i ? '' : 'opacity-70 hover:opacity-100'}`}>
            <span className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition group-hover:-translate-y-0.5 ${pick === i ? 'scale-105' : ''}`}
              style={{ borderColor: pick === i ? color : 'rgba(255,255,255,0.15)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/spelers/${p.face}`} alt={p.name} className="h-full w-full object-cover" />
            </span>
            <span className="w-full truncate text-center font-mono text-[9px] uppercase tracking-[0.08em]"
              style={{ color: pick === i ? color : undefined }}>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
