'use client'

// Pijlwerk — 301/501 met dubbele finish. Het richtkruis zwabbert (en steeds érger hoe
// langer je twijfelt); stuur bij met de pijltjes/WASD en gooi op het juiste moment.
// 1-4 spelers hotseat of vs de computer. De pijlen dragen de kop van de gooier.

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  BOARD_R, R_BULL, R_BULLSEYE, R_DOUBLE_IN, R_DOUBLE_OUT, R_TRIPLE_IN, R_TRIPLE_OUT,
  SECTORS, checkoutHint,
} from '@/lib/darts/board'
import { aiScatter, aiTarget, makeDartsMatch, nextVisit, throwDart, type DartsMatch } from '@/lib/darts/game'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile } from '@/components/playground/mobile-play'
import { TouchGamepad } from '@/components/playground/touch-gamepad'

type Mode = 'ai' | '2p' | '3p' | '4p'

const DIFFICULTY = [
  { label: 'Makkelijk', val: 0.25 },
  { label: 'Normaal', val: 0.55 },
  { label: 'Pittig', val: 0.85 },
]

const W = 1000
const H = 560
const CX = W * 0.63 // bordmidden
const CY = 285
const FIXED_DT = 1 / 120
const POOL_ALPHA = [...PLAYER_POOL].sort((a, b) => a.name.localeCompare(b.name, 'nl'))

type Dart = { x: number; y: number; face: string } // gepositioneerd t.o.v. bordmidden
type Game = {
  match: DartsMatch
  difficulty: number
  cross: { x: number; y: number } // richtkruis (t.o.v. bordmidden)
  swayT: number // hoe lang deze pijl al "klaar" is → meer zwabber
  swaySeed: number
  darts: Dart[] // pijlen die nu in het bord steken (deze beurt)
  pauseT: number // korte pauze na een worp / beurtwissel
  phase: 'aim' | 'pause' | 'turnend' | 'over'
  aiFrom: { x: number; y: number } | null // AI: kruis glijdt van hier naar het doel
  aiT: number
}

export default function DartsClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const keysRef = useRef<Set<string>>(new Set())

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [mode, setMode] = useState<Mode>('ai')
  const [difficulty, setDifficulty] = useState(0.55)
  const [startScore, setStartScore] = useState(301)
  const [picks, setPicks] = useState<number[]>([-1, -1, -1, -1]) // gekozen speler per slot (-1 = willekeurig)
  const [popup, setPopup] = useState<{ text: string; color: string; n: number } | null>(null)
  const [turnCard, setTurnCard] = useState<{ name: string; points: number; color: string; n: number } | null>(null)
  const [matchOver, setMatchOver] = useState<{ name: string; darts: number } | null>(null)
  const popupN = useRef(0)
  const cardN = useRef(0)
  const soundsRef = useRef<Record<string, HTMLAudioElement>>({})

  // Geluiden voorladen.
  useEffect(() => {
    for (const f of ['gameon-darts', 'darts-180', 'darts-140', 'darts-100', 'dartssound', 'emotional-damage']) {
      const a = new window.Audio(`/sfx/${f}.mp3`)
      a.preload = 'auto'
      soundsRef.current[f] = a
    }
  }, [])

  const playSound = useCallback((name: string) => {
    const a = soundsRef.current[name]
    if (!a) return
    try { a.currentTime = 0; void a.play() } catch { /* autoplay geweigerd → stil */ }
  }, [])
  const slots = mode === 'ai' ? 2 : mode === '2p' ? 2 : mode === '3p' ? 3 : 4

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
  }, [])

  const startMatch = useCallback(() => {
    const nSlots = mode === 'ai' ? 2 : mode === '2p' ? 2 : mode === '3p' ? 3 : 4
    const shuffled = [...PLAYER_POOL].sort(() => Math.random() - 0.5)
    const used = new Set<string>()
    const players = Array.from({ length: nSlots }, (_, i) => {
      // Gekozen speler respecteren; anders (of bij een dubbele) een willekeurige vrije.
      let pick = picks[i] >= 0 ? POOL_ALPHA[picks[i]] : null
      if (pick && used.has(pick.face)) pick = null
      if (!pick) pick = shuffled.find((p) => !used.has(p.face)) ?? shuffled[i]
      used.add(pick.face)
      return {
        face: pick.face,
        name: mode === 'ai' && i === 1 ? `${pick.name} (AI)` : pick.name,
        isAI: mode === 'ai' && i === 1,
      }
    })
    gameRef.current = {
      match: makeDartsMatch(players, startScore),
      difficulty,
      cross: { x: 0, y: -60 }, swayT: 0, swaySeed: Math.random() * 100,
      darts: [], pauseT: 0, phase: 'aim', aiFrom: null, aiT: 0,
    }
    setPopup(null)
    setMatchOver(null)
    setTurnCard(null)
    enterImmersiveIfMobile()
    playSound('gameon-darts')
    setStage('playing')
  }, [mode, difficulty, startScore, picks, playSound])

  useEffect(() => {
    if (stage !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const keys = keysRef.current

    const show = (text: string, color: string) => {
      popupN.current++
      setPopup({ text, color, n: popupN.current })
    }

    const doThrow = (g: Game, x: number, y: number) => {
      const m = g.match
      const p = m.players[m.current]
      const visitStart = p.visitStart
      const res = throwDart(m, x, y)
      g.darts.push({ x, y, face: p.face })
      playSound('dartssound') // de pijl ploft in het bord
      if (res.finished) {
        g.phase = 'over'
        setMatchOver({ name: p.name, darts: p.dartsThrown })
        return
      }
      if (res.bust) {
        show('BUST', '#ff5a4d') // enige melding: een bust voidt je hele beurt (score-relevant)
        playSound('emotional-damage') // je hele beurt weggegooid — au
        g.phase = 'turnend'
        g.pauseT = 1.2
        return
      }
      if (m.dartsLeft <= 0) {
        // Beurt klaar → goal-achtig tussenscherm met de score van deze beurt (2 sec).
        const points = visitStart - p.score
        const color = points >= 180 ? '#f4b92e' : points >= 100 ? '#e0533a' : points >= 60 ? '#4FA8E0' : '#5fbf6e'
        cardN.current++
        setTurnCard({ name: p.name, points, color, n: cardN.current })
        // Commentaar-geluid bij de dikke scores.
        if (points >= 180) playSound('darts-180')
        else if (points >= 140) playSound('darts-140')
        else if (points >= 100) playSound('darts-100')
        g.phase = 'turnend'
        g.pauseT = 2.0
      } else {
        g.phase = 'pause'
        g.pauseT = 0.4
      }
    }

    const update = (g: Game, dt: number) => {
      const m = g.match
      if (g.phase === 'over') return
      if (g.phase === 'pause' || g.phase === 'turnend') {
        g.pauseT -= dt
        if (g.pauseT <= 0) {
          if (g.phase === 'turnend') {
            nextVisit(m)
            g.darts = []
            setTurnCard(null)
          }
          g.phase = 'aim'
          g.swayT = 0
          g.swaySeed = Math.random() * 100
          g.cross = { x: (Math.random() - 0.5) * 60, y: -60 + (Math.random() - 0.5) * 40 }
          g.aiFrom = null
          g.aiT = 0
        }
        return
      }

      const p = m.players[m.current]
      g.swayT += dt

      if (p.isAI) {
        // Computer: kruis glijdt naar het doel en gooit (met mik-fout).
        if (!g.aiFrom) {
          g.aiFrom = { ...g.cross }
          g.aiT = 0
        }
        g.aiT += dt
        const tgt = aiTarget(p.score)
        const f = Math.min(1, g.aiT / 0.9)
        const ease = f * f * (3 - 2 * f)
        g.cross.x = g.aiFrom.x + (tgt.x - g.aiFrom.x) * ease + Math.sin(g.aiT * 9 + g.swaySeed) * 6 * (1 - ease)
        g.cross.y = g.aiFrom.y + (tgt.y - g.aiFrom.y) * ease + Math.cos(g.aiT * 8 + g.swaySeed) * 6 * (1 - ease)
        if (g.aiT > 1.05) doThrow(g, tgt.x + aiScatter(g.difficulty), tgt.y + aiScatter(g.difficulty))
        return
      }

      // Mens: bijsturen met pijltjes/WASD; de zwabber (groeiend met g.swayT) komt uit
      // swayOffset() en wordt zowel getekend als bij de worp opgeteld.
      const steer = 230 * dt
      if (keys.has('ArrowLeft') || keys.has('KeyA')) g.cross.x -= steer
      if (keys.has('ArrowRight') || keys.has('KeyD')) g.cross.x += steer
      if (keys.has('ArrowUp') || keys.has('KeyW')) g.cross.y -= steer
      if (keys.has('ArrowDown') || keys.has('KeyS')) g.cross.y += steer
      g.cross.x = Math.max(-BOARD_R - 30, Math.min(BOARD_R + 30, g.cross.x))
      g.cross.y = Math.max(-BOARD_R - 30, Math.min(BOARD_R + 30, g.cross.y))
    }

    const swayOffset = (g: Game) => {
      const A = 8 + Math.min(46, g.swayT * 14)
      const t = g.swayT
      return {
        x: (Math.sin(t * 3.1 + g.swaySeed) + Math.sin(t * 5.3 + g.swaySeed * 2)) * 0.5 * A,
        y: (Math.cos(t * 2.7 + g.swaySeed) + Math.sin(t * 4.3 + g.swaySeed * 3)) * 0.5 * A,
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
        update(g, FIXED_DT)
        acc -= FIXED_DT
      }
      draw(ctx, canvas, g, facesRef.current, swayOffset)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
      if (e.code === 'Escape') { setStage('menu'); return }
      const g = gameRef.current
      if (!g || g.phase !== 'aim' || e.repeat) return
      const p = g.match.players[g.match.current]
      if (!p.isAI && (e.code === 'Space' || e.code === 'Enter')) {
        const off = swayOffset(g)
        doThrow(g, g.cross.x + off.x, g.cross.y + off.y)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keys.clear()
    }
  }, [stage, playSound])

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/pijlwerk.png" alt="Pijlwerk" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-4xl space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Spelers">
              <Seg options={['Vs computer', '2', '3', '4']} value={mode === 'ai' ? 0 : mode === '2p' ? 1 : mode === '3p' ? 2 : 3}
                onChange={(i) => setMode(i === 0 ? 'ai' : i === 1 ? '2p' : i === 2 ? '3p' : '4p')} />
            </MenuRow>
            {mode === 'ai' && (
              <MenuRow label="Moeilijkheid">
                <Seg options={DIFFICULTY.map((d) => d.label)} value={DIFFICULTY.findIndex((d) => d.val === difficulty)} onChange={(i) => setDifficulty(DIFFICULTY[i].val)} />
              </MenuRow>
            )}
            <MenuRow label="Spel">
              <Seg options={['301', '501']} value={startScore === 301 ? 0 : 1} onChange={(i) => setStartScore(i === 0 ? 301 : 501)} />
            </MenuRow>
            {/* Jouw speler links, tegenstander(s) rechts — netjes in twee kolommen. */}
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {Array.from({ length: slots }, (_, i) => (
                <div key={i} className={i % 2 === 0 ? 'sm:border-r sm:border-white/10 sm:pr-5' : ''}>
                  <PlayerPicker
                    label={mode === 'ai' ? (i === 0 ? 'Jouw speler' : 'Tegenstander') : `Speler ${i + 1}`}
                    pick={picks[i]}
                    onPick={(v) => setPicks((prev) => { const n = [...prev]; n[i] = prev[i] === v ? -1 : v; return n })}
                    color={i === 0 ? '#5fbf6e' : '#F4B92E'} />
                </div>
              ))}
            </div>
            <button onClick={startMatch}
              className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
              Game on! 🎯
            </button>
          </div>

          <div className="max-w-md text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            richtkruis zwabbert — hoe langer je twijfelt, hoe erger · bijsturen met pijltjes/WASD · spatie = gooien<br />
            finishen op een dubbel (of bullseye) · onder nul of op 1 = bust · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          {isTouch && !portrait && (
            <TouchGamepad dir="full" buttons={[
              { code: 'Space', label: 'Gooi', color: 'border-emerald-300/50 bg-emerald-500/30', big: true },
            ]} />
          )}
          {isTouch && portrait && <RotateNotice game="Pijlwerk" />}
          <button onClick={() => setStage('menu')}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[12%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-5xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: popup.color }}>
                {popup.text}
              </h2>
            </div>
          )}

          {/* Goal-achtig tussenscherm na elke beurt: naam + gescoorde punten (2 sec). */}
          {turnCard && (
            <div key={turnCard.n} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/45" />
              <div className="relative flex flex-col items-center gap-2 text-center" style={{ animation: 'goal-pop 0.4s cubic-bezier(0.2,1.5,0.4,1) both' }}>
                <span className="font-mono text-sm uppercase tracking-[0.3em] text-white/80">{turnCard.name}</span>
                <span className="font-score text-[120px] leading-none uppercase drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)]" style={{ color: turnCard.color }}>
                  {turnCard.points}
                </span>
                <span className="font-display text-lg uppercase tracking-[0.24em] text-white/85">
                  {turnCard.points === 180 ? 'ONE HUNDRED AND EIGHTY! 🎯' : turnCard.points >= 100 ? 'ton plus!' : turnCard.points === 0 ? 'niks…' : 'punten'}
                </span>
              </div>
            </div>
          )}

          {matchOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex flex-col items-center gap-4 text-center animate-fade-up">
                <h2 className="font-score text-7xl uppercase text-wk-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">{matchOver.name} wint! 🏆</h2>
                <p className="font-mono text-sm uppercase tracking-[0.2em] text-wk-soft">Uitgegooid in {matchOver.darts} pijlen</p>
                <div className="flex gap-3 pt-2">
                  <button onClick={startMatch} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">Nog een potje</button>
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
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, faces: Record<string, HTMLImageElement>, swayOffset: (g: Game) => { x: number; y: number }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#101722'
  ctx.fillRect(0, 0, cw, ch)

  const sc = Math.min(cw / W, ch / H)
  const ox = (cw - W * sc) / 2
  const oy = (ch - H * sc) / 2
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(sc, sc)

  // Kurk-achtergrond achter het bord (pub-sfeer) + spotlight.
  const spot = ctx.createRadialGradient(CX, CY, 40, CX, CY, 420)
  spot.addColorStop(0, 'rgba(255,235,190,0.10)')
  spot.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, W, H)

  drawBoard(ctx)

  // Gestoken pijlen (met de kop van de gooier als flight).
  for (const d of g.darts) {
    const px = CX + d.x
    const py = CY + d.y
    ctx.strokeStyle = '#d8dee8'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + 26, py - 30)
    ctx.stroke()
    const img = faces[d.face]
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(px + 33, py - 38, 12, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, px + 21, py - 50, 24, 24)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(px, py, 2.6, 0, Math.PI * 2)
    ctx.fillStyle = '#f2f4f8'
    ctx.fill()
  }

  // Richtkruis (mens aan de beurt).
  const m = g.match
  const p = m.players[m.current]
  if (g.phase === 'aim' && !p.isAI) {
    const off = swayOffset(g)
    const kx = CX + g.cross.x + off.x
    const ky = CY + g.cross.y + off.y
    ctx.strokeStyle = 'rgba(255,90,77,0.95)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(kx, ky, 14, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(kx - 22, ky)
    ctx.lineTo(kx + 22, ky)
    ctx.moveTo(kx, ky - 22)
    ctx.lineTo(kx, ky + 22)
    ctx.stroke()
  } else if (g.phase === 'aim' && p.isAI) {
    const kx = CX + g.cross.x
    const ky = CY + g.cross.y
    ctx.strokeStyle = 'rgba(125,184,232,0.9)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(kx, ky, 14, 0, Math.PI * 2)
    ctx.stroke()
  }

  // ── Scorepaneel links ─────────────────────────────────────────────────────
  ctx.textAlign = 'left'
  let py2 = 70
  for (let i = 0; i < m.players.length; i++) {
    const pl = m.players[i]
    const active = i === m.current && m.winner === -1
    if (active) {
      ctx.fillStyle = 'rgba(244,185,46,0.08)'
      ctx.fillRect(24, py2 - 34, 300, 78)
      ctx.strokeStyle = 'rgba(244,185,46,0.5)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(24, py2 - 34, 300, 78)
    }
    const img = faces[pl.face]
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(58, py2, 24, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, 34, py2 - 24, 48, 48)
      ctx.restore()
    }
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = active ? '#F4B92E' : 'rgba(255,255,255,0.75)'
    ctx.fillText(pl.name, 94, py2 - 8)
    ctx.font = '900 34px monospace'
    ctx.fillStyle = active ? '#ffffff' : 'rgba(255,255,255,0.55)'
    ctx.fillText(String(pl.score), 94, py2 + 26)
    // checkout-hint voor de actieve speler
    if (active) {
      const hint = checkoutHint(pl.score, m.dartsLeft)
      if (hint) {
        ctx.font = 'bold 13px monospace'
        ctx.fillStyle = '#5fbf6e'
        ctx.fillText(`→ ${hint}`, 200, py2 + 24)
      }
    }
    py2 += 100
  }

  // Beurt-info: pijlen over + wat er deze beurt gegooid is.
  ctx.font = 'bold 14px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fillText(`Pijlen: ${'🎯'.repeat(Math.max(0, m.dartsLeft))}${'·'.repeat(3 - Math.max(0, m.dartsLeft))}`, 26, py2 + 4)
  if (m.visitLabels.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(`Deze beurt: ${m.visitLabels.join(' · ')}`, 26, py2 + 26)
  }

  ctx.restore()
}

// Het bord zelf: sectoren, ringen, cijfers — één keer per frame vers getekend (goedkoop zat).
function drawBoard(ctx: CanvasRenderingContext2D) {
  // rand + nummers-ring
  ctx.beginPath()
  ctx.arc(CX, CY, BOARD_R + 34, 0, Math.PI * 2)
  ctx.fillStyle = '#1c2431'
  ctx.fill()
  for (let i = 0; i < 20; i++) {
    const a0 = -Math.PI / 2 - Math.PI / 20 + i * (Math.PI / 10)
    const a1 = a0 + Math.PI / 10
    const dark = i % 2 === 0
    const wedge = (rIn: number, rOut: number, color: string) => {
      ctx.beginPath()
      ctx.arc(CX, CY, rOut, a0, a1)
      ctx.arc(CX, CY, rIn, a1, a0, true)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
    }
    wedge(R_BULL, R_TRIPLE_IN, dark ? '#15181e' : '#e8e2d0')
    wedge(R_TRIPLE_IN, R_TRIPLE_OUT, dark ? '#c23b45' : '#2f7d4f')
    wedge(R_TRIPLE_OUT, R_DOUBLE_IN, dark ? '#15181e' : '#e8e2d0')
    wedge(R_DOUBLE_IN, R_DOUBLE_OUT, dark ? '#c23b45' : '#2f7d4f')
    // nummer
    const mid = (a0 + a1) / 2
    ctx.font = 'bold 19px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(240,244,250,0.9)'
    ctx.fillText(String(SECTORS[i]), CX + Math.cos(mid) * (BOARD_R + 19), CY + Math.sin(mid) * (BOARD_R + 19))
  }
  ctx.textBaseline = 'alphabetic'
  // bull + bullseye
  ctx.beginPath()
  ctx.arc(CX, CY, R_BULL, 0, Math.PI * 2)
  ctx.fillStyle = '#2f7d4f'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(CX, CY, R_BULLSEYE, 0, Math.PI * 2)
  ctx.fillStyle = '#c23b45'
  ctx.fill()
  // spinnen-draad
  ctx.strokeStyle = 'rgba(200,210,225,0.35)'
  ctx.lineWidth = 1
  for (const r of [R_BULL, R_TRIPLE_IN, R_TRIPLE_OUT, R_DOUBLE_IN, R_DOUBLE_OUT]) {
    ctx.beginPath()
    ctx.arc(CX, CY, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 - Math.PI / 20 + i * (Math.PI / 10)
    ctx.beginPath()
    ctx.moveTo(CX + Math.cos(a) * R_BULL, CY + Math.sin(a) * R_BULL)
    ctx.lineTo(CX + Math.cos(a) * R_DOUBLE_OUT, CY + Math.sin(a) * R_DOUBLE_OUT)
    ctx.stroke()
  }
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

// Speler-kiezer: rijtje koppen (klik = kiezen, nogmaals = willekeurig).
function PlayerPicker({ label, pick, onPick, color }: { label: string; pick: number; onPick: (i: number) => void; color: string }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">
        {label} <span style={{ color }}>{pick >= 0 ? `— ${POOL_ALPHA[pick].name}` : '— willekeurig'}</span>
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {POOL_ALPHA.map((p, i) => (
          <button key={p.face} onClick={() => onPick(i)} title={p.name}
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
