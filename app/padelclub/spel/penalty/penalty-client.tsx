'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'

const W = 380
const H = 480
const GX0 = 50
const GX1 = 330
const ZONES = 5
const ZW = (GX1 - GX0) / ZONES
const GOAL_TOP = 56
const GOAL_LINE = 128
const TARGET_Y = 96
const SPOT = { x: W / 2, y: H - 58 }
const SHOOT_MS = 460
// Keeper duikt vaker naar het midden → hoeken zijn veiliger (skill).
const DIVE_W = [0.13, 0.19, 0.36, 0.19, 0.13]
// Power-balk: gecentreerd groen, daarbuiten geel → oranje → rood (symmetrisch).
// Halve breedtes vanaf het midden (0.5). Groen is bewust klein.
const GREEN_HW = 0.06
const YELLOW_HW = 0.17
const ORANGE_HW = 0.32
const ZONE_PROB: Record<string, number> = { green: 0.95, yellow: 0.65, orange: 0.30, red: 0 }
const PB = { x0: 46, x1: W - 46, y: H - 26, h: 14 }
const zoneOf = (power: number): 'green' | 'yellow' | 'orange' | 'red' => {
  const d = Math.abs(power - 0.5)
  if (d < GREEN_HW) return 'green'
  if (d < YELLOW_HW) return 'yellow'
  if (d < ORANGE_HW) return 'orange'
  return 'red'
}

const FIGS = '/spelers'
const KEEPER = 'lukaku.png'   // vaste keeper

const COL = { grass1: '#16321f', grass2: '#0f2417', line: '#F5F2EB', text: '#F5F2EB', gold: '#F4B92E' }

const zx = (i: number) => GX0 + (i + 0.5) * ZW
const pickDive = () => { let r = Math.random(); for (let i = 0; i < ZONES; i++) { r -= DIVE_W[i]; if (r <= 0) return i } return ZONES - 1 }

export default function PenaltyClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'aim' | 'power' | 'shoot' | 'over'>('idle')
  const [score, setScore] = useState(0)
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean } | null>(null)
  // Easter eggs: keeper klapt om bij elke 7 op rij; Panenka bij midden-goal terwijl keeper duikt
  const [keeperFall, setKeeperFall] = useState(0)
  const [panenka, setPanenka] = useState(0)
  const [goalFx, setGoalFx] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const keeperImg = useRef<HTMLImageElement | null>(null)
  const phaseRef = useRef(phase); phaseRef.current = phase
  const scoreRef = useRef(0)
  const boardRef = useRef(board); boardRef.current = board
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const reticle = useRef({ pos: 0, dir: 1 })
  const pwr = useRef({ pos: 0, dir: 1 })
  const aimLock = useRef(2)
  const shot = useRef({ start: 0, lock: 2, keeperZone: 2, scored: false, over: false, panenka: false })
  const particles = useRef<{ x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[]>([])

  const ZONE_COLOR: Record<string, string> = { green: '#2EA84B', yellow: '#F4B92E', orange: '#E8862E', red: '#E63946' }
  const spawnSplash = (power: number) => {
    const mx = PB.x0 + (PB.x1 - PB.x0) * power
    const my = PB.y + PB.h / 2
    const color = ZONE_COLOR[zoneOf(power)]
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 70 + Math.random() * 180
      const life = 0.45 + Math.random() * 0.3
      particles.current.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140, life, max: life, color, size: 2 + Math.random() * 2.6 })
    }
  }

  const drawScene = useCallback((ballX: number, ballY: number, keeperX: number, reticleX: number | null, power: number | null = null, keeperRot = 0, keeperDy = 0) => {
    const cv = canvasRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    // gras met diepte
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#1f4029'); g.addColorStop(0.5, '#163020'); g.addColorStop(1, '#0e2216')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    // maaibanen onder het doel
    const band = (H - GOAL_LINE) / 8
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.05)'; ctx.fillRect(0, GOAL_LINE + i * band, W, band) }
    // strafschopstip
    ctx.fillStyle = 'rgba(245,242,235,0.55)'; ctx.beginPath(); ctx.ellipse(SPOT.x, SPOT.y + 16, 3.5, 2, 0, 0, Math.PI * 2); ctx.fill()

    // ── 3D doel ──────────────────────────────────────────────────────────────
    const line = (a: number, b2: number, c: number, d: number) => { ctx.beginPath(); ctx.moveTo(a, b2); ctx.lineTo(c, d); ctx.stroke() }
    const ins = 18, upT = 10, upB = 30
    const fL = GX0, fR = GX1, fT = GOAL_TOP, fB = GOAL_LINE
    const bL = GX0 + ins, bR = GX1 - ins, bT = GOAL_TOP + upT, bB = GOAL_LINE - upB
    // donkere doelmond achter het net (diepte)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath(); ctx.moveTo(bL, bT); ctx.lineTo(bR, bT); ctx.lineTo(bR, bB); ctx.lineTo(bL, bB); ctx.closePath(); ctx.fill()
    const cols = 10, rows = 6
    // achtervlak-net
    ctx.strokeStyle = 'rgba(245,242,235,0.16)'; ctx.lineWidth = 1
    for (let i = 0; i <= cols; i++) { const x = bL + (bR - bL) * i / cols; line(x, bT, x, bB) }
    for (let j = 0; j <= rows; j++) { const y = bT + (bB - bT) * j / rows; line(bL, y, bR, y) }
    // zij- en bovennet (perspectief-diepte)
    ctx.strokeStyle = 'rgba(245,242,235,0.10)'
    line(fL, fT, bL, bT); line(fR, fT, bR, bT); line(fL, fB, bL, bB); line(fR, fB, bR, bB)
    for (let j = 1; j < rows; j++) { const fy = fT + (fB - fT) * j / rows, by = bT + (bB - bT) * j / rows; line(fL, fy, bL, by); line(fR, fy, bR, by) }
    for (let i = 1; i < cols; i++) { const fx = fL + (fR - fL) * i / cols, bx = bL + (bR - bL) * i / cols; line(fx, fT, bx, bT) }
    // frame: lat + palen met schaduw + dikte
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 7
    ctx.beginPath(); ctx.moveTo(fL + 2, fB); ctx.lineTo(fL + 2, fT + 2); ctx.lineTo(fR + 2, fT + 2); ctx.lineTo(fR + 2, fB); ctx.stroke()
    ctx.strokeStyle = '#F5F2EB'; ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(fL, fB); ctx.lineTo(fL, fT); ctx.lineTo(fR, fT); ctx.lineTo(fR, fB); ctx.stroke()
    ctx.lineCap = 'butt'

    // keeper-schaduw
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath(); ctx.ellipse(keeperX, GOAL_LINE, 24, 6, 0, 0, Math.PI * 2); ctx.fill()

    // keeper — kan 'duiken' (rotatie + iets omlaag) rond zijn voeten
    const img = keeperImg.current
    const kh = 76
    ctx.save()
    ctx.translate(keeperX, GOAL_LINE)
    ctx.rotate(keeperRot)
    if (img && img.complete && img.naturalWidth > 0) {
      const kw = kh * (img.naturalWidth / img.naturalHeight)
      ctx.drawImage(img, -kw / 2, -kh + keeperDy, kw, kh)
    } else {
      ctx.font = '52px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText('🧤', 0, keeperDy)
    }
    ctx.restore()

    // richtkruis
    if (reticleX != null) {
      ctx.strokeStyle = COL.gold; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(reticleX, TARGET_Y, 11, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(reticleX - 16, TARGET_Y); ctx.lineTo(reticleX + 16, TARGET_Y)
      ctx.moveTo(reticleX, TARGET_Y - 16); ctx.lineTo(reticleX, TARGET_Y + 16); ctx.stroke()
    }

    // bal
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('⚽', ballX, ballY)

    // power-balk: gecentreerd groen → geel → oranje → rood (symmetrisch)
    if (power != null) {
      const bw = PB.x1 - PB.x0
      const seg = (from: number, to: number, color: string) =>
        { ctx.fillStyle = color; ctx.fillRect(PB.x0 + bw * (0.5 + from), PB.y, bw * (to - from), PB.h) }
      // schaduw onder de balk
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2
      ctx.fillStyle = '#0e1118'; ctx.beginPath(); ctx.roundRect(PB.x0, PB.y, bw, PB.h, 7); ctx.fill()
      ctx.restore()
      // gekleurde zones
      ctx.save()
      ctx.beginPath(); ctx.roundRect(PB.x0, PB.y, bw, PB.h, 7); ctx.clip()
      seg(-0.5, 0.5, '#E63946')                 // rood (alles)
      seg(-ORANGE_HW, ORANGE_HW, '#E8862E')     // oranje
      seg(-YELLOW_HW, YELLOW_HW, '#F4B92E')      // geel
      seg(-GREEN_HW, GREEN_HW, '#2EA84B')        // groen (klein, midden)
      // glans bovenin
      const sh = ctx.createLinearGradient(0, PB.y, 0, PB.y + PB.h)
      sh.addColorStop(0, 'rgba(255,255,255,0.28)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)')
      ctx.fillStyle = sh; ctx.fillRect(PB.x0, PB.y, bw, PB.h)
      ctx.restore()
      // randje
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(PB.x0 + 0.5, PB.y + 0.5, bw - 1, PB.h - 1, 7); ctx.stroke()
      // marker: witte naald met pijlpunt + gloed
      const mx = PB.x0 + bw * power
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 5
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath(); ctx.roundRect(mx - 1.6, PB.y - 6, 3.2, PB.h + 12, 1.5); ctx.fill()
      ctx.beginPath(); ctx.moveTo(mx - 5, PB.y - 9); ctx.lineTo(mx + 5, PB.y - 9); ctx.lineTo(mx, PB.y - 2); ctx.closePath(); ctx.fill()
      ctx.restore()
    }

    // splash-deeltjes (kleur spat van de power-balk)
    for (const pt of particles.current) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max)
      ctx.fillStyle = pt.color
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // score
    ctx.fillStyle = COL.text; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`Op rij: ${scoreRef.current}`, W / 2, 14)
  }, [])

  const setupCanvas = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return
    const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    cv.width = W * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const endGame = useCallback(() => {
    phaseRef.current = 'over'; setPhase('over')
    if (raf.current != null) cancelAnimationFrame(raf.current)
    const final = scoreRef.current
    const prevBest = boardRef.current.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest })
    setBoard((prev) => prev.map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e)).sort((a, b) => b.best - a.best))
    void submitPadelScore('penalty', final)
  }, [currentUserId])

  const loop = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - last.current) / 1000); last.current = t
    // splash-deeltjes updaten
    if (particles.current.length) {
      for (const pt of particles.current) { pt.life -= dt; pt.vy += 900 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt }
      particles.current = particles.current.filter((pt) => pt.life > 0)
    }
    const p = phaseRef.current
    // Beide balken gaan 5% sneller per goal (moeilijkheidsgraad)
    const ramp = Math.pow(1.05, scoreRef.current)
    if (p === 'aim') {
      const speed = Math.min(6, 2.1 * ramp)
      let pos = reticle.current.pos + reticle.current.dir * speed * dt
      let dir = reticle.current.dir
      if (pos > ZONES - 1) { pos = ZONES - 1; dir = -1 }
      if (pos < 0) { pos = 0; dir = 1 }
      reticle.current = { pos, dir }
      drawScene(SPOT.x, SPOT.y, zx(2), zx(pos))
      raf.current = requestAnimationFrame(loop)
    } else if (p === 'power') {
      const speed = Math.min(2.6, 1.1 * ramp)
      let pos = pwr.current.pos + pwr.current.dir * speed * dt
      let dir = pwr.current.dir
      if (pos > 1) { pos = 1; dir = -1 }
      if (pos < 0) { pos = 0; dir = 1 }
      pwr.current = { pos, dir }
      drawScene(SPOT.x, SPOT.y, zx(2), zx(aimLock.current), pos)
      raf.current = requestAnimationFrame(loop)
    } else if (p === 'shoot') {
      const k = Math.min(1, (t - shot.current.start) / SHOOT_MS)
      const ease = 1 - Math.pow(1 - k, 2)
      const bx = SPOT.x + (zx(shot.current.lock) - SPOT.x) * ease
      // over = bal vliegt boven de lat; panenka = cheeky chip-boogje
      const endY = shot.current.over ? GOAL_TOP - 52 : TARGET_Y
      const arc = shot.current.over ? -Math.sin(k * Math.PI) * 60 : shot.current.panenka ? -Math.sin(k * Math.PI) * 46 : 0
      const by = SPOT.y + (endY - SPOT.y) * ease + arc
      // keeper duikt: schuift naar zijn zone + leunt + zakt iets door
      const kprog = Math.min(1, k * 1.3)
      const kx = zx(2) + (zx(shot.current.keeperZone) - zx(2)) * kprog
      const kdir = Math.sign(zx(shot.current.keeperZone) - zx(2))
      drawScene(bx, by, kx, null, null, kdir * 0.5 * kprog, 16 * kprog)
      if (k >= 1) {
        if (!shot.current.scored) { endGame(); return }
        scoreRef.current += 1; setScore(scoreRef.current)
        setGoalFx((g) => g + 1)
        if (shot.current.panenka) setPanenka((pp) => pp + 1)
        if (scoreRef.current % 7 === 0) setKeeperFall((pp) => pp + 1)
        phaseRef.current = 'aim'; setPhase('aim')
      }
      raf.current = requestAnimationFrame(loop)
    }
  }, [drawScene, endGame])

  const start = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current)
    scoreRef.current = 0; setScore(0); setResult(null)
    reticle.current = { pos: 0, dir: 1 }
    pwr.current = { pos: 0, dir: 1 }
    phaseRef.current = 'aim'; setPhase('aim')
    last.current = performance.now()
    raf.current = requestAnimationFrame(loop)
  }, [loop])

  // Eén tik: in 'aim' legt de richting vast → power-balk; in 'power' legt de kracht
  // vast → schot. Te zacht (links) = keeper grijpt; te hard (rechts) = over.
  const tap = useCallback(() => {
    if (phaseRef.current === 'aim') {
      aimLock.current = Math.round(reticle.current.pos)
      pwr.current = { pos: 0, dir: 1 }
      phaseRef.current = 'power'; setPhase('power')
    } else if (phaseRef.current === 'power') {
      spawnSplash(pwr.current.pos)
      const lock = aimLock.current
      const zone = zoneOf(pwr.current.pos)
      const dive = pickDive()
      const over = zone === 'red'                       // rood → altijd over (mis)
      const read = lock === dive                         // keeper raadt je hoek → redding
      const scored = !over && !read && Math.random() < ZONE_PROB[zone]
      // keeper duikt naar de bal als hij 'm pakt, anders de verkeerde kant op
      const keeperZone = scored ? dive : lock
      const panenka = scored && lock === 2 && dive !== 2
      shot.current = { start: performance.now(), lock, keeperZone, scored, over, panenka }
      phaseRef.current = 'shoot'; setPhase('shoot')
    }
  }, [])

  // keeper laden
  useEffect(() => {
    const img = new window.Image()
    img.onload = () => { keeperImg.current = img; if (phaseRef.current === 'idle') { setupCanvas(); drawScene(SPOT.x, SPOT.y, zx(2), null) } }
    img.src = `${FIGS}/${KEEPER}`
  }, [setupCanvas, drawScene])

  // Panenka- en goal-flash weer verbergen
  useEffect(() => { if (!panenka) return; const t = setTimeout(() => setPanenka(0), 1100); return () => clearTimeout(t) }, [panenka])
  useEffect(() => { if (!goalFx) return; const t = setTimeout(() => setGoalFx(0), 900); return () => clearTimeout(t) }, [goalFx])

  useEffect(() => {
    setupCanvas(); drawScene(SPOT.x, SPOT.y, zx(2), null)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); if (phaseRef.current === 'aim' || phaseRef.current === 'power') tap(); else if (phaseRef.current === 'idle') start() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); if (raf.current != null) cancelAnimationFrame(raf.current) }
  }, [setupCanvas, drawScene, tap, start])

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <Link
        href="/padelclub/spel" aria-label="Sluiten"
        onClick={(e) => { e.preventDefault(); close() }}
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-md mx-auto px-4 py-10 sm:py-14 space-y-6">
        <header className="text-center animate-fade-up">
          <Link href="/padelclub/spel" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.2em] uppercase mb-2 inline-block">← Spellen</Link>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Strafschoppen</h1>
        </header>

        <div className="relative mx-auto w-full max-w-[380px] select-none touch-none" onPointerDown={(e) => { e.preventDefault(); tap() }}>
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10" style={{ aspectRatio: `${W} / ${H}` }} />

          {/* Easter egg: keeper klapt om bij elke 7 op rij */}
          {keeperFall > 0 && (
            <div key={`kf${keeperFall}`} className="pointer-events-none absolute inset-x-0 top-[7%] flex justify-center z-20" aria-hidden>
              <Image
                src={`${FIGS}/${KEEPER}`} alt="" width={120} height={120}
                onAnimationEnd={() => setKeeperFall(0)}
                className="w-20 h-auto drop-shadow-2xl"
                style={{ animation: 'keeper-tumble 1.4s ease-in forwards' }}
              />
            </div>
          )}

          {/* Goal! met voetbal */}
          {goalFx > 0 && (
            <div key={`g${goalFx}`} className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 z-20" aria-hidden>
              <span className="animate-pop text-6xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">⚽</span>
              <span className="animate-pop font-display text-3xl sm:text-4xl text-wk-green drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">GOAL!</span>
            </div>
          )}

          {/* Easter egg: Panenka! */}
          {panenka > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20" aria-hidden>
              <span className="animate-pop font-display text-3xl sm:text-4xl text-wk-gold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">Panenka! 😎</span>
            </div>
          )}

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-5 bg-wk-bg/40 backdrop-blur-[1px] rounded-2xl">
              <p className="text-5xl">⚽</p>
              <p className="text-sm text-wk-soft leading-relaxed">
                Tik eerst voor de <b className="text-wk-gold">richting</b> (mik op de hoeken — daar duikt de keeper minder vaak), daarna voor de <b className="text-wk-green">kracht</b>: stop de balk in het <b className="text-wk-green">groen</b>. Te zacht = redding, te hard = over. Eén misser = klaar.
              </p>
              <button onClick={(e) => { e.stopPropagation(); start() }} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Start
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/55 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.2em] uppercase">Gestopt!</p>
              <p className="font-fun font-semibold text-5xl text-wk-gold leading-none">{result.score}</p>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">op rij</p>
              {result.record && <p className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase">🏆 Nieuw record!</p>}
              <button onClick={(e) => { e.stopPropagation(); start() }} className="mt-1 font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Nog een keer
              </button>
            </div>
          )}
        </div>

        <GameLeaderboard entries={board} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
