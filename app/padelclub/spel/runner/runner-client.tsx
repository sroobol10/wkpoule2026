'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'
import TeamsPopup from '../teams-popup'
import ImmersiveToggle from '../immersive-toggle'

// Liggend speelveld (2:1) — schaalt naar de breedte van de kolom.
const W = 640
const H = 320
const GROUND = H - 48          // voetlijn
const RUN = ['/spel/run/run0.png', '/spel/run/run1.png', '/spel/run/run2.png', '/spel/run/run3.png', '/spel/run/run4.png', '/spel/run/run5.png']
const JUMP = '/spel/run/jump.png'
const SKY = '/spel/run/sky.png'
const CLOUD = '/spel/run/cloud.png'
const VEG = '/spel/run/veg.png'
const RICK = '/rick.png'
const ALL = [...RUN, JUMP, SKY, CLOUD, VEG, RICK]

const G = 2100          // zwaartekracht
const JUMP_V = 720      // sprongkracht
const BW = 30, BH = 40  // hitbox bunny

type Img = HTMLImageElement
type Obst = { x: number; w: number; h: number; tall: boolean }
type Gem = { x: number; y: number; got: boolean }
type Cloud = { x: number; y: number; s: number }

export default function RunnerClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [hud, setHud] = useState({ score: 0, coins: 0 })
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean } | null>(null)
  const [ready, setReady] = useState(false)

  const phaseRef = useRef(phase); phaseRef.current = phase
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const imgs = useRef<Record<string, Img>>({})

  const player = useRef({ y: GROUND, vy: 0, grounded: true, jumps: 0, frame: 0, ft: 0 })
  const obst = useRef<Obst[]>([])
  const gems = useRef<Gem[]>([])
  const clouds = useRef<Cloud[]>([])
  const speed = useRef(240)
  const dist = useRef(0)
  const score = useRef(0)
  const coins = useRef(0)
  const obCd = useRef(1.2)
  const gemCd = useRef(0.8)
  const worldX = useRef(0)   // voor grond/struik-scroll

  useEffect(() => {
    let alive = true; let done = 0
    ALL.forEach((src) => {
      const im = new window.Image()
      const fin = () => { done++; if (done === ALL.length && alive) setReady(true) }
      im.onload = () => { imgs.current[src] = im; fin() }
      im.onerror = fin
      im.src = src
    })
    return () => { alive = false }
  }, [])

  const setupCanvas = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return
    const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    cv.width = W * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d'); if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false }
  }, [])

  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

  const reset = useCallback(() => {
    player.current = { y: GROUND, vy: 0, grounded: true, jumps: 0, frame: 0, ft: 0 }
    obst.current = []; gems.current = []
    if (!clouds.current.length) clouds.current = Array.from({ length: 5 }, (_, i) => ({ x: (i * W) / 5 + Math.random() * 80, y: 20 + Math.random() * 90, s: 0.3 + Math.random() * 0.5 }))
    speed.current = 240; dist.current = 0; score.current = 0; coins.current = 0
    obCd.current = 1.0; gemCd.current = 0.8; worldX.current = 0
    setHud({ score: 0, coins: 0 })
  }, [])

  const endGame = useCallback(() => {
    if (phaseRef.current === 'over') return
    phaseRef.current = 'over'; setPhase('over')
    const final = score.current
    const prevBest = board.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest })
    setBoard((prev) => prev.map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e)).sort((a, b) => b.best - a.best))
    void submitPadelScore('runner', final)
  }, [board, currentUserId])

  const jump = useCallback(() => {
    if (phaseRef.current === 'idle') { reset(); setResult(null); phaseRef.current = 'playing'; setPhase('playing'); return }
    if (phaseRef.current !== 'playing') return
    const p = player.current
    if (p.jumps < 2) { p.vy = -JUMP_V; p.grounded = false; p.jumps++ }
  }, [reset])

  // ── loop ──
  const loop = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - last.current) / 1000); last.current = t
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) { raf.current = requestAnimationFrame(loop); return }
    const playing = phaseRef.current === 'playing'

    // ── lucht (verticale gradient-strip uitgerekt) ──
    const sky = imgs.current[SKY]
    if (sky) ctx.drawImage(sky, 0, 0, sky.width, sky.height, 0, 0, W, H)
    else { ctx.fillStyle = '#f5a3a3'; ctx.fillRect(0, 0, W, H) }

    // wolken
    const cloud = imgs.current[CLOUD]
    for (const c of clouds.current) {
      if (playing) { c.x -= speed.current * c.s * 0.25 * dt; if (c.x < -90) { c.x = W + Math.random() * 60; c.y = 20 + Math.random() * 90 } }
      if (cloud) { ctx.globalAlpha = 0.85; ctx.drawImage(cloud, c.x, c.y, 84, 55); ctx.globalAlpha = 1 }
    }

    if (playing) step(dt)

    // ── parallax-struiken net boven de grond ──
    const veg = imgs.current[VEG]
    if (veg) { const vw = 112, vy = GROUND - 70; const off = (worldX.current * 0.5) % vw; ctx.globalAlpha = 0.9; for (let x = -off - vw; x < W + vw; x += vw) ctx.drawImage(veg, x, vy, vw, 102); ctx.globalAlpha = 1 }

    // ── grond ──
    ctx.fillStyle = '#b5651d'; ctx.fillRect(0, GROUND, W, H - GROUND)
    ctx.fillStyle = '#3aa34a'; ctx.fillRect(0, GROUND, W, 6)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    const tile = 32; const toff = worldX.current % tile
    for (let x = -toff; x < W; x += tile) ctx.fillRect(x, GROUND + 6, 2, H - GROUND - 6)

    drawWorld(ctx)
    raf.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── simulatie ──
  const step = (dt: number) => {
    const p = player.current
    speed.current = Math.min(520, speed.current + dt * 7)   // tempo loopt op
    dist.current += speed.current * dt
    worldX.current += speed.current * dt
    score.current = Math.floor(dist.current / 10) + coins.current * 10

    // bunny-fysica
    p.vy += G * dt; p.y += p.vy * dt
    if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.grounded = true; p.jumps = 0 }
    if (p.grounded) { p.ft += dt; if (p.ft > 0.06) { p.ft = 0; p.frame = (p.frame + 1) % RUN.length } }

    // obstakels (Rick) spawnen
    obCd.current -= dt
    if (obCd.current <= 0) {
      const tall = Math.random() < 0.28
      const h = tall ? 70 : 42 + Math.random() * 10
      obst.current.push({ x: W + 30, w: tall ? 38 : 34, h, tall })
      const gap = Math.max(0.7, 1.5 - speed.current / 900) + Math.random() * 0.5
      obCd.current = gap
    }
    for (const o of obst.current) o.x -= speed.current * dt
    obst.current = obst.current.filter((o) => o.x > -60)

    // munten spawnen (boogjes, soms op spronghoogte)
    gemCd.current -= dt
    if (gemCd.current <= 0) {
      const n = 3 + Math.floor(Math.random() * 3)
      const baseY = GROUND - (Math.random() < 0.5 ? 30 : 96)
      for (let i = 0; i < n; i++) gems.current.push({ x: W + 30 + i * 26, y: baseY - Math.sin((i / (n - 1)) * Math.PI) * 26, got: false })
      gemCd.current = 1.1 + Math.random() * 1.2
    }
    for (const g of gems.current) g.x -= speed.current * dt
    gems.current = gems.current.filter((g) => g.x > -30 && !g.got)

    // botsing met obstakels
    const bx = 90 - BW / 2, by = p.y - BH
    for (const o of obst.current) {
      const ox = o.x - o.w / 2, oy = GROUND - o.h
      if (bx < ox + o.w - 6 && bx + BW > ox + 6 && by < oy + o.h && by + BH > oy + 4) { endGame(); return }
    }
    // munten pakken
    const cx = 90, cy = p.y - BH / 2
    for (const g of gems.current) { if (!g.got && Math.abs(g.x - cx) < 18 && Math.abs(g.y - cy) < 22) { g.got = true; coins.current += 1 } }
    gems.current = gems.current.filter((g) => !g.got)

    setHud((h) => (h.score === score.current && h.coins === coins.current ? h : { score: score.current, coins: coins.current }))
  }

  // ── tekenen ──
  const drawWorld = (ctx: CanvasRenderingContext2D) => {
    const p = player.current

    // munten
    for (const g of gems.current) {
      ctx.save(); ctx.translate(g.x, g.y)
      ctx.shadowColor = '#F4B92E'; ctx.shadowBlur = 8
      ctx.fillStyle = '#F4B92E'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(-2, -2, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    // obstakels (Rick)
    const rick = imgs.current[RICK]
    for (const o of obst.current) {
      const oy = GROUND - o.h
      if (rick) {
        if (o.tall) { ctx.drawImage(rick, o.x - o.w / 2, oy, o.w, o.h * 0.55); ctx.drawImage(rick, o.x - o.w / 2, oy + o.h * 0.5, o.w, o.h * 0.55) }
        else ctx.drawImage(rick, o.x - o.w / 2, oy, o.w, o.h)
      } else { ctx.fillStyle = '#E63946'; ctx.fillRect(o.x - o.w / 2, oy, o.w, o.h) }
    }

    // bunny
    const airborne = !p.grounded
    const src = airborne ? JUMP : RUN[p.frame]
    const im = imgs.current[src]
    if (im) {
      const dh = 48; const dw = (im.width / im.height) * dh
      ctx.drawImage(im, 90 - dw / 2, p.y - dh, dw, dh)
    } else { ctx.fillStyle = '#E8862E'; ctx.fillRect(90 - BW / 2, p.y - BH, BW, BH) }
  }

  useEffect(() => {
    setupCanvas(); last.current = now(); raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current) }
  }, [setupCanvas, loop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump])

  return (
    <div data-game-root className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <TeamsPopup active={phase === 'playing'} />
      <ImmersiveToggle />
      <Link
        href="/padelclub/spel" aria-label="Sluiten"
        onClick={(e) => { e.preventDefault(); close() }}
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-md mx-auto gx-container px-4 py-8 sm:py-12 space-y-5">
        <header className="gx-hide text-center animate-fade-up">
          <Link href="/padelclub/spel" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.2em] uppercase mb-2 inline-block">← Spellen</Link>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Sunny Sprint</h1>
        </header>

        {phase === 'playing' && (
          <div className="flex items-center justify-between bg-wk-surface border border-white/10 rounded-xl px-4 py-2">
            <div><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Score</p><p className="font-score text-2xl leading-none text-wk-gold">{hud.score}</p></div>
            <div className="text-right"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Munten</p><p className="font-score text-2xl leading-none text-wk-text">🪙 {hud.coins}</p></div>
          </div>
        )}

        <div className="gx-stage relative mx-auto w-full max-w-[440px] select-none touch-none cursor-pointer" onPointerDown={(e) => { e.preventDefault(); jump() }}>
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }} />

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-wk-bg/55 backdrop-blur-[1px] rounded-2xl">
              <p className="text-5xl">🐰</p>
              <p className="text-sm text-wk-soft leading-relaxed">
                <b className="text-wk-gold">Tik</b> (of spatie) om te springen — nog een tik in de lucht = <b>dubbelsprong</b>. Ontwijk <b className="text-wk-red">Rick</b>, pak <b className="text-wk-gold">munten</b> 🪙 en ren zo ver mogelijk. Het gaat steeds sneller!
              </p>
              <button onClick={(e) => { e.stopPropagation(); jump() }} disabled={!ready} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50">
                {ready ? 'Start' : 'Laden…'}
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/65 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Gevangen door Rick!</p>
              <p className="font-score text-5xl text-wk-gold leading-none">{result.score}</p>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">punten</p>
              {result.record && <p className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase">Nieuw record!</p>}
              <button onClick={(e) => { e.stopPropagation(); reset(); setResult(null); phaseRef.current = 'playing'; setPhase('playing') }} className="mt-1 font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Opnieuw
              </button>
            </div>
          )}
        </div>

        <div className="gx-hide"><GameLeaderboard entries={board} currentUserId={currentUserId} /></div>
      </div>
    </div>
  )
}
