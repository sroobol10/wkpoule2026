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
// Obstakels = voetballers (visuele variatie). Rick houdt de hoofdrol.
const OBST_FACES = ['/rick.png', '/spelers/lukaku.png', '/spelers/bus.png', '/spelers/dejuul.png', '/spelers/pimp.png', '/spelers/ho.png']
const ALL = [...RUN, JUMP, SKY, CLOUD, VEG, ...OBST_FACES]

const G = 2100          // zwaartekracht
const JUMP_V = 720      // sprongkracht
const BW = 30, BH = 40  // hitbox bunny
// Munten zijn dé scorebron: elke munt geeft COIN_BASE × multiplier. De multiplier loopt op
// terwijl je munten blijft pakken (combo) en zakt terug als je te lang niets pakt.
const COIN_BASE = 40
const COIN_MAX_MULT = 10
const COMBO_WINDOW = 2.2   // sec om de combo levend te houden
const coinMult = (combo: number) => Math.min(COIN_MAX_MULT, 1 + Math.floor(combo / 4))

type Img = HTMLImageElement
type Obst = { x: number; w: number; h: number; tall: boolean; kind: 'ground' | 'fly'; face: string; y: number }
type Gem = { x: number; y: number; got: boolean }
type Cloud = { x: number; y: number; s: number }
type Pickup = { x: number; y: number; kind: 'shield' | 'magnet'; got: boolean }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; col: string }

export default function RunnerClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [hud, setHud] = useState({ score: 0, coins: 0, mult: 1, shield: false, magnet: false })
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean } | null>(null)
  const [ready, setReady] = useState(false)

  const phaseRef = useRef(phase); phaseRef.current = phase
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const imgs = useRef<Record<string, Img>>({})

  const player = useRef({ y: GROUND, vy: 0, grounded: true, jumps: 0, frame: 0, ft: 0, shield: false, magnet: 0, inv: 0 })
  const obst = useRef<Obst[]>([])
  const gems = useRef<Gem[]>([])
  const pickups = useRef<Pickup[]>([])
  const parts = useRef<Particle[]>([])
  const clouds = useRef<Cloud[]>([])
  const pickupCd = useRef(7)
  const shake = useRef(0)
  const audioCtx = useRef<AudioContext | null>(null)
  const speed = useRef(240)
  const dist = useRef(0)
  const score = useRef(0)
  const coins = useRef(0)
  const coinPts = useRef(0)      // verzamelde muntpunten (incl. multiplier)
  const combo = useRef(0)        // aantal munten in de huidige reeks
  const comboTimer = useRef(0)   // resterende tijd om de combo levend te houden
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

  // Korte synth-effectjes (geen assets)
  const beep = (kind: 'jump' | 'coin' | 'hit' | 'power') => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx = audioCtx.current ?? (audioCtx.current = new Ctx())
      if (ctx.state === 'suspended') void ctx.resume()
      const t = ctx.currentTime
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination)
      if (kind === 'coin') { o.type = 'triangle'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.08); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.start(t); o.stop(t + 0.13) }
      else if (kind === 'jump') { o.type = 'square'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(720, t + 0.1); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); o.start(t); o.stop(t + 0.13) }
      else if (kind === 'power') { o.type = 'sawtooth'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1040, t + 0.18); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.start(t); o.stop(t + 0.23) }
      else { o.type = 'square'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.25); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.start(t); o.stop(t + 0.32) }
    } catch { /* geluid is optioneel */ }
  }

  const reset = useCallback(() => {
    player.current = { y: GROUND, vy: 0, grounded: true, jumps: 0, frame: 0, ft: 0, shield: false, magnet: 0, inv: 0 }
    obst.current = []; gems.current = []; pickups.current = []; parts.current = []
    if (!clouds.current.length) clouds.current = Array.from({ length: 5 }, (_, i) => ({ x: (i * W) / 5 + Math.random() * 80, y: 20 + Math.random() * 90, s: 0.3 + Math.random() * 0.5 }))
    speed.current = 240; dist.current = 0; score.current = 0; coins.current = 0
    coinPts.current = 0; combo.current = 0; comboTimer.current = 0
    obCd.current = 1.0; gemCd.current = 0.8; worldX.current = 0; pickupCd.current = 6 + Math.random() * 4; shake.current = 0
    setHud({ score: 0, coins: 0, mult: 1, shield: false, magnet: false })
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
    if (p.jumps < 2) { p.vy = -JUMP_V; p.grounded = false; p.jumps++; beep('jump') }
  }, [reset])

  // ── loop ──
  const loop = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - last.current) / 1000); last.current = t
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) { raf.current = requestAnimationFrame(loop); return }
    const playing = phaseRef.current === 'playing'

    // screenshake (bij een klap)
    let sx = 0, sy = 0
    if (shake.current > 0) { const m = Math.min(1, shake.current / 0.4) * 5; sx = (Math.random() - 0.5) * 2 * m; sy = (Math.random() - 0.5) * 2 * m }
    ctx.save(); ctx.translate(sx, sy)

    // ── lucht (verticale gradient-strip uitgerekt) ──
    const sky = imgs.current[SKY]
    if (sky) ctx.drawImage(sky, 0, 0, sky.width, sky.height, 0, 0, W, H)
    else { ctx.fillStyle = '#f5a3a3'; ctx.fillRect(0, 0, W, H) }
    // zonsondergang-tint die met de afstand opbouwt (progressie-gevoel)
    const tint = Math.min(0.32, dist.current / 60000)
    if (tint > 0) { ctx.fillStyle = `rgba(255,120,60,${tint})`; ctx.fillRect(0, 0, W, H) }

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
    ctx.restore()
    raf.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── simulatie ──
  const step = (dt: number) => {
    const p = player.current
    speed.current = Math.min(520, speed.current + dt * 7)   // tempo loopt op
    dist.current += speed.current * dt
    worldX.current += speed.current * dt
    // Afstand is slechts een bodempje; munten (met combo-multiplier) bepalen de score
    score.current = Math.floor(dist.current / 11) + coinPts.current
    if (comboTimer.current > 0) { comboTimer.current -= dt; if (comboTimer.current <= 0) combo.current = 0 }

    // bunny-fysica
    p.vy += G * dt; p.y += p.vy * dt
    if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.grounded = true; p.jumps = 0 }
    if (p.grounded) { p.ft += dt; if (p.ft > 0.06) { p.ft = 0; p.frame = (p.frame + 1) % RUN.length } }
    if (p.inv > 0) p.inv -= dt
    if (p.magnet > 0) p.magnet -= dt
    if (shake.current > 0) shake.current -= dt

    // obstakels (voetballers) spawnen — grond (overheen springen) of vliegend (juist niet springen!)
    obCd.current -= dt
    if (obCd.current <= 0) {
      const face = OBST_FACES[Math.floor(Math.random() * OBST_FACES.length)]
      const fly = speed.current > 300 && Math.random() < 0.32   // vliegers pas na wat opwarmen
      if (fly) {
        obst.current.push({ x: W + 30, w: 42, h: 38, tall: false, kind: 'fly', face, y: GROUND - 74 })
      } else {
        const tall = Math.random() < 0.28
        const h = tall ? 70 : 42 + Math.random() * 10
        obst.current.push({ x: W + 30, w: tall ? 38 : 34, h, tall, kind: 'ground', face, y: GROUND - h })
      }
      const gap = Math.max(0.7, 1.5 - speed.current / 900) + Math.random() * 0.5
      obCd.current = gap
    }
    for (const o of obst.current) o.x -= speed.current * dt
    obst.current = obst.current.filter((o) => o.x > -60)

    // munten spawnen (boogjes, soms op spronghoogte)
    gemCd.current -= dt
    if (gemCd.current <= 0) {
      // ~helft van de bogen hangt hóóg → alleen met een dubbelsprong te pakken (en meer munten waard)
      const high = Math.random() < 0.5
      const n = (high ? 4 : 3) + Math.floor(Math.random() * 3)
      const baseY = GROUND - (high ? 132 + Math.random() * 40 : 28 + Math.random() * 26)
      const amp = high ? 30 : 22
      for (let i = 0; i < n; i++) gems.current.push({ x: W + 30 + i * 26, y: baseY - Math.sin((i / (n - 1)) * Math.PI) * amp, got: false })
      gemCd.current = 1.0 + Math.random() * 1.1
    }
    for (const g of gems.current) g.x -= speed.current * dt
    // magneet: trekt munten naar de bunny
    if (p.magnet > 0) { const tx = 90, ty = p.y - BH / 2; for (const g of gems.current) { g.x += (tx - g.x) * Math.min(1, dt * 6); g.y += (ty - g.y) * Math.min(1, dt * 6) } }
    gems.current = gems.current.filter((g) => g.x > -30 && !g.got)

    // power-ups spawnen (zeldzaam): 🛡 schild of 🧲 magneet, op spronghoogte
    pickupCd.current -= dt
    if (pickupCd.current <= 0) {
      const kind: 'shield' | 'magnet' = Math.random() < 0.5 ? 'shield' : 'magnet'
      pickups.current.push({ x: W + 40, y: GROUND - (62 + Math.random() * 64), kind, got: false })
      pickupCd.current = 9 + Math.random() * 7
    }
    for (const pk of pickups.current) pk.x -= speed.current * dt
    pickups.current = pickups.current.filter((pk) => pk.x > -40 && !pk.got)

    // deeltjes
    for (const pt of parts.current) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 380 * dt; pt.life -= dt }
    parts.current = parts.current.filter((pt) => pt.life > 0)
    const spark = (x: number, y: number, col: string, n = 6) => { for (let i = 0; i < n; i++) parts.current.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 140, life: 0.4 + Math.random() * 0.3, col }) }

    // botsing met obstakels — een schild vangt één treffer op
    const bx = 90 - BW / 2, by = p.y - BH
    const hit = () => {
      if (p.inv > 0) return
      if (p.shield) { p.shield = false; p.inv = 1.1; shake.current = 0.35; beep('hit'); spark(90, p.y - BH / 2, '#2D6BE5', 10) }
      else { shake.current = 0.5; beep('hit'); endGame() }
    }
    for (const o of obst.current) {
      const ox = o.x - o.w / 2
      if (o.kind === 'fly') {
        const oy0 = o.y - o.h / 2, oy1 = o.y + o.h / 2
        if (bx < ox + o.w - 6 && bx + BW > ox + 6 && by < oy1 - 4 && by + BH > oy0 + 4) { hit(); break }
      } else {
        const oy = GROUND - o.h
        if (bx < ox + o.w - 6 && bx + BW > ox + 6 && by < oy + o.h && by + BH > oy + 4) { hit(); break }
      }
    }
    if (phaseRef.current === 'over') return

    // munten pakken
    const cx = 90, cy = p.y - BH / 2
    for (const g of gems.current) {
      if (!g.got && Math.abs(g.x - cx) < 18 && Math.abs(g.y - cy) < 22) {
        g.got = true; coins.current += 1
        combo.current += 1; comboTimer.current = COMBO_WINDOW
        coinPts.current += COIN_BASE * coinMult(combo.current)
        spark(g.x, g.y, '#F4B92E', 5); beep('coin')
      }
    }
    gems.current = gems.current.filter((g) => !g.got)

    // power-ups pakken
    for (const pk of pickups.current) {
      if (!pk.got && Math.abs(pk.x - cx) < 22 && Math.abs(pk.y - cy) < 24) {
        pk.got = true; beep('power')
        if (pk.kind === 'shield') { p.shield = true; spark(pk.x, pk.y, '#2D6BE5', 10) }
        else { p.magnet = 6; spark(pk.x, pk.y, '#9b59ff', 10) }
      }
    }
    pickups.current = pickups.current.filter((pk) => !pk.got)

    const m = comboTimer.current > 0 ? coinMult(combo.current) : 1
    const sh = p.shield, mg = p.magnet > 0
    setHud((h) => (h.score === score.current && h.coins === coins.current && h.mult === m && h.shield === sh && h.magnet === mg ? h : { score: score.current, coins: coins.current, mult: m, shield: sh, magnet: mg }))
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

    // power-ups (🛡 schild blauw, 🧲 magneet paars) — zwevend met gloed
    for (const pk of pickups.current) {
      const col = pk.kind === 'shield' ? '#2D6BE5' : '#9b59ff'
      ctx.save(); ctx.translate(pk.x, pk.y + Math.sin((worldX.current + pk.x) * 0.05) * 4)
      ctx.shadowColor = col; ctx.shadowBlur = 14
      ctx.fillStyle = 'rgba(11,14,20,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke()
      ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(pk.kind === 'shield' ? '🛡' : '🧲', 0, 1)
      ctx.restore()
    }

    // obstakels (voetballers) — grond (evt. gestapeld) of vliegend op kophoogte
    for (const o of obst.current) {
      const im = imgs.current[o.face]
      if (o.kind === 'fly') {
        if (im) ctx.drawImage(im, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h)
        else { ctx.fillStyle = '#E63946'; ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h) }
      } else {
        const oy = GROUND - o.h
        if (im) {
          if (o.tall) { ctx.drawImage(im, o.x - o.w / 2, oy, o.w, o.h * 0.55); ctx.drawImage(im, o.x - o.w / 2, oy + o.h * 0.5, o.w, o.h * 0.55) }
          else ctx.drawImage(im, o.x - o.w / 2, oy, o.w, o.h)
        } else { ctx.fillStyle = '#E63946'; ctx.fillRect(o.x - o.w / 2, oy, o.w, o.h) }
      }
    }

    // deeltjes
    for (const pt of parts.current) { ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2.5)); ctx.fillStyle = pt.col; ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4) }
    ctx.globalAlpha = 1

    // bunny (knippert tijdens invuln; aura bij schild/magneet)
    if (p.shield) { ctx.save(); ctx.strokeStyle = 'rgba(45,107,229,0.85)'; ctx.lineWidth = 2.5; ctx.shadowColor = '#2D6BE5'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(90, p.y - BH / 2, 30, 0, Math.PI * 2); ctx.stroke(); ctx.restore() }
    if (p.magnet > 0) { ctx.save(); ctx.strokeStyle = `rgba(155,89,255,${0.4 + 0.3 * Math.sin(worldX.current * 0.1)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(90, p.y - BH / 2, 38, 0, Math.PI * 2); ctx.stroke(); ctx.restore() }
    if (!(p.inv > 0 && Math.floor(p.inv * 16) % 2 === 0)) {
      const src = !p.grounded ? JUMP : RUN[p.frame]
      const im = imgs.current[src]
      if (im) { const dh = 48; const dw = (im.width / im.height) * dh; ctx.drawImage(im, 90 - dw / 2, p.y - dh, dw, dh) }
      else { ctx.fillStyle = '#E8862E'; ctx.fillRect(90 - BW / 2, p.y - BH, BW, BH) }
    }
  }

  useEffect(() => {
    setupCanvas(); last.current = now(); raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); void audioCtx.current?.close() }
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
            <div className="text-center"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Power</p><p className="text-lg leading-none">{hud.shield ? '🛡' : ''}{hud.magnet ? '🧲' : ''}{!hud.shield && !hud.magnet ? <span className="font-score text-wk-muted">–</span> : null}</p></div>
            <div className="text-right"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Munten</p><p className="font-score text-2xl leading-none text-wk-text">🪙 {hud.coins}{hud.mult > 1 ? <span className="text-wk-gold"> ×{hud.mult}</span> : null}</p></div>
          </div>
        )}

        <div className="gx-stage relative mx-auto w-full max-w-[440px] select-none touch-none cursor-pointer" onPointerDown={(e) => { e.preventDefault(); jump() }}>
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }} />

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-wk-bg/55 backdrop-blur-[1px] rounded-2xl">
              <p className="text-5xl">🐰</p>
              <p className="text-sm text-wk-soft leading-relaxed">
                <b className="text-wk-gold">Tik</b> (of spatie) om te springen — nog een tik in de lucht = <b>dubbelsprong</b>. Ontwijk <b className="text-wk-red">Rick</b>. Spring óver de voetballers op de grond, maar duik <b>ónder</b> de vliegende koppen door (niet springen!). <b className="text-wk-gold">Munten</b> 🪙 zijn de jackpot: pak ze in reeksen voor een oplopende <b className="text-wk-gold">×-multiplier</b> (tot ×10), en de hoogste bogen haal je <b>alléén met een dubbelsprong</b>. Pak <b className="text-wk-blue">🛡 schild</b> (overleeft één klap) en <b style={{ color: '#9b59ff' }}>🧲 magneet</b> (trekt munten aan).
              </p>
              <button onClick={(e) => { e.stopPropagation(); jump() }} disabled={!ready} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50">
                {ready ? 'Start' : 'Laden…'}
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/65 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Getackeld!</p>
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
