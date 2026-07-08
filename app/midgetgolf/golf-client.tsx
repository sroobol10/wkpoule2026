'use client'

// Putjesscheppers — midgetgolf met random gegenereerde holes. Richten met ←/→,
// spatie vasthouden voor power, en vloeken bij de molenwiek. 1-4 spelers hotseat
// (om de beurt de hele hole), minste slagen na 9 holes wint.

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  BALL_R, CHARGE_TIME, CUP_R, MAX_STROKES, MILL_R, POWER_MAX, POWER_MIN, SINK_TIME, WORLD_H, WORLD_W,
  generateHole, stepBall, boulderPos, insideHole,
} from '@/lib/golf/sim'
import type { GolfPlayer, GolfTheme, Hole } from '@/lib/golf/types'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile } from '@/components/playground/mobile-play'
import { TouchGamepad } from '@/components/playground/touch-gamepad'
import { FacePicker, POOL_ALPHA } from '@/components/playground/face-picker'

const PLAYER_COLORS = ['#E63946', '#F4B92E', '#4FA8E0', '#5fbf6e'] as const
const HOLES = 9
const FIXED_DT = 1 / 120

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; c: string; grav: number }

type Game = {
  holes: Hole[]
  holeIdx: number
  players: GolfPlayer[]
  turn: number // wie er nu speelt (speelt z'n hele hole uit)
  phase: 'aim' | 'charge' | 'roll'
  angle: number
  chargeT: number
  curve: number // -1..1: effect voor de curve-bal (Q/E), toegepast als spin bij de slag
  mulliganLeft: boolean // 1 mulligan (opnieuw slaan) per speler per hole (R)
  simT: number // globale tijd (voor de molenwiek)
  mole: { x: number; y: number; pop: number } | null // molshoop-gimmick (whack-a-mole)
  moleArmed: boolean // mag de mol deze slag nog toeslaan?
  particles: Particle[] // stof/confetti/plons-deeltjes (juice)
  trailT: number // afteller voor de stofsliert achter de rollende bal
  cupGlow: number // >0 = net gescoord → glinstering + confetti-nagloed bij de cup
  shake: number // >0 = schermschud (bumper/molen/inhole)
  flash: number // >0 = witte flits (inhole-feest)
  bumpHitCd: number // korte cooldown zodat één bumper-tik één keer schud/vonkt
  lastBX: number // vorige bal-positie (teleport-detectie: grote sprong = wormgat)
  lastBY: number
  // UFO-ontvoering (client-only, tijdens 'aim'): scheert binnen, straalt de bal op en dropt 'm elders.
  ufo: { x: number; y: number; hx: number; hy: number; dropX: number; dropY: number; phase: 'in' | 'beam' | 'out'; t: number } | null
  ufoCd: number // seconden tot een volgende ontvoering mag
  // Bliksem (client-only): getelegrafeerde inslag; bal in de buurt = weggeblazen.
  bolt: { x: number; y: number; phase: 'warn' | 'strike'; t: number } | null
  boltCd: number
  // Reuzenhand (client-only, tijdens 'aim'): reikt in en flikt de bal een willekeurige kant op.
  hand: { x: number; y: number; hx: number; hy: number; phase: 'in' | 'flick' | 'out'; t: number } | null
  handCd: number
}

// Deeltjes bijspawnen (stof, confetti, plons, aarde).
function emit(g: Game, x: number, y: number, n: number, colors: string[], opts: { spd?: number; life?: number; r?: number; grav?: number; up?: number } = {}) {
  const { spd = 120, life = 0.5, r = 3, grav = 0, up = 0 } = opts
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const s = spd * (0.3 + Math.random() * 0.7)
    const lf = life * (0.6 + Math.random() * 0.6)
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life: lf, max: lf, r: r * (0.6 + Math.random() * 0.7), c: colors[Math.floor(Math.random() * colors.length)], grav })
  }
}

// Kies een molshoop-plek op de green (weg van tee/cup); ~45% van de holes heeft er één.
function pickMole(h: Hole): { x: number; y: number; pop: number } | null {
  if (Math.random() > 0.45) return null
  for (let i = 0; i < 20; i++) {
    const r = h.rects[Math.floor(Math.random() * h.rects.length)]
    const x = r.x + 30 + Math.random() * Math.max(1, r.w - 60)
    const y = r.y + 30 + Math.random() * Math.max(1, r.h - 60)
    if (Math.hypot(x - h.tee.x, y - h.tee.y) > 120 && Math.hypot(x - h.cup.x, y - h.cup.y) > 90) return { x, y, pop: 0 }
  }
  return null
}

const parTerm = (strokes: number, par: number): string => {
  const d = strokes - par
  if (strokes === 1) return 'HOLE-IN-ONE! 🤯'
  if (d <= -2) return 'eagle! 🦅'
  if (d === -1) return 'birdie! 🐦'
  if (d === 0) return 'par'
  if (d === 1) return 'bogey'
  if (d === 2) return 'dubbel-bogey'
  return 'avontuurlijk'
}

export default function GolfClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const keysRef = useRef<Set<string>>(new Set())
  const advanceRef = useRef(false) // "volgende hole"-knop → de game-loop doet de reset

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [playerCount, setPlayerCount] = useState(2)
  const [picks, setPicks] = useState<number[]>([-1, -1, -1, -1]) // gekozen speler per slot (-1 = willekeurig)
  const [popup, setPopup] = useState<{ text: string; color: string; n: number } | null>(null)
  // Snapshot voor de scorekaart-overlay (render mag niet in gameRef kijken → react-hooks/refs).
  const [scorecard, setScorecard] = useState<{
    final: boolean
    holePars: number[]
    rows: { name: string; strokes: (number | undefined)[]; total: number }[]
  } | null>(null)
  const popupN = useRef(0)
  const emoRef = useRef<HTMLAudioElement | null>(null) // emotional damage bij een plons

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
    const a = new window.Audio('/sfx/emotional-damage.mp3')
    a.preload = 'auto'
    emoRef.current = a
  }, [])

  const startMatch = useCallback(() => {
    const pool = [...PLAYER_POOL].sort(() => Math.random() - 0.5)
    const faces = PLAYER_POOL.map((p) => p.face)
    const holes = Array.from({ length: HOLES }, (_, i) => generateHole(i, faces))
    // Gekozen speler per slot (-1 = willekeurig), zonder dubbelen.
    const used = new Set<string>()
    const chosen = Array.from({ length: playerCount }, (_, i) => {
      let pick = picks[i] >= 0 ? POOL_ALPHA[picks[i]] : null
      if (pick && used.has(pick.face)) pick = null
      if (!pick) pick = pool.find((p) => !used.has(p.face)) ?? pool[i]
      used.add(pick.face)
      return pick
    })
    const players: GolfPlayer[] = chosen.map((pk) => ({
      face: pk.face,
      name: pk.name,
      strokes: [],
      ball: { x: holes[0].tee.x, y: holes[0].tee.y, vx: 0, vy: 0, spin: 0, sinking: 0 },
      holed: false,
      preShot: { ...holes[0].tee },
    }))
    gameRef.current = {
      holes, holeIdx: 0, players, turn: 0,
      phase: 'aim',
      angle: Math.atan2(holes[0].cup.y - holes[0].tee.y, holes[0].cup.x - holes[0].tee.x),
      chargeT: 0, curve: 0, mulliganLeft: true, simT: 0,
      mole: pickMole(holes[0]), moleArmed: true,
      particles: [], trailT: 0, cupGlow: 0,
      shake: 0, flash: 0, bumpHitCd: 0, lastBX: holes[0].tee.x, lastBY: holes[0].tee.y,
      ufo: null, ufoCd: 8 + Math.random() * 8,
      bolt: null, boltCd: 10 + Math.random() * 10,
      hand: null, handCd: 14 + Math.random() * 10,
    }
    setPopup(null)
    setScorecard(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [playerCount, picks])

  // De reset zelf gebeurt in de game-loop (refs muteren mag daar wél van de linter).
  const nextHole = () => {
    advanceRef.current = true
    setScorecard(null)
  }

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

    // Geldige drop-plek voor de UFO: ergens op de baan, weg van de cup.
    const pickDrop = (hole: Hole): { x: number; y: number } => {
      for (let i = 0; i < 30; i++) {
        const r = hole.rects[Math.floor(Math.random() * hole.rects.length)]
        const x = r.x + 30 + Math.random() * Math.max(1, r.w - 60)
        const y = r.y + 30 + Math.random() * Math.max(1, r.h - 60)
        if (insideHole(hole, x, y, 12) && Math.hypot(x - hole.cup.x, y - hole.cup.y) > 80) return { x, y }
      }
      return { x: hole.tee.x, y: hole.tee.y }
    }

    // Huidige speler klaar (in de cup of max slagen) → volgende speler of hole-einde.
    const finishRun = (g: Game, strokes: number) => {
      const p = g.players[g.turn]
      p.strokes[g.holeIdx] = strokes
      p.holed = true
      const nxt = g.players.findIndex((q, i) => i > g.turn && !q.holed)
      if (nxt >= 0) {
        g.turn = nxt
        const h = g.holes[g.holeIdx]
        g.phase = 'aim'
        g.angle = Math.atan2(h.cup.y - g.players[nxt].ball.y, h.cup.x - g.players[nxt].ball.x)
        g.curve = 0
        g.mulliganLeft = true // elke speler krijgt 1 mulligan per hole
      } else {
        setScorecard({
          final: g.holeIdx >= HOLES - 1,
          holePars: g.holes.slice(0, g.holeIdx + 1).map((hh) => hh.par),
          rows: g.players.map((q) => ({
            name: q.name,
            strokes: q.strokes.slice(0, g.holeIdx + 1),
            total: q.strokes.slice(0, g.holeIdx + 1).reduce((sum, v) => sum + (v ?? 0), 0),
          })),
        })
      }
    }

    const update = (g: Game, dt: number) => {
      // "Volgende hole" aangeklikt → baan resetten voor alle spelers.
      if (advanceRef.current) {
        advanceRef.current = false
        if (g.holeIdx < HOLES - 1) {
          g.holeIdx += 1
          const nh = g.holes[g.holeIdx]
          g.turn = 0
          for (const q of g.players) {
            q.ball = { x: nh.tee.x, y: nh.tee.y, vx: 0, vy: 0, spin: 0, sinking: 0 }
            q.holed = false
            q.preShot = { ...nh.tee }
          }
          g.phase = 'aim'
          g.angle = Math.atan2(nh.cup.y - nh.tee.y, nh.cup.x - nh.tee.x)
          g.curve = 0
          g.mulliganLeft = true
          g.mole = pickMole(nh)
          g.moleArmed = true
          g.particles = []
          g.cupGlow = 0
          g.ufo = null
          g.ufoCd = 8 + Math.random() * 8
          g.bolt = null
          g.boltCd = 10 + Math.random() * 10
          g.hand = null
          g.handCd = 14 + Math.random() * 10
          g.lastBX = nh.tee.x
          g.lastBY = nh.tee.y
        }
      }
      g.simT += dt
      if (g.cupGlow > 0) g.cupGlow = Math.max(0, g.cupGlow - dt)
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 2.4)
      if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.8)
      if (g.bumpHitCd > 0) g.bumpHitCd = Math.max(0, g.bumpHitCd - dt)
      // Deeltjes updaten (stof/confetti/plons).
      for (const pt of g.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += pt.grav * dt; pt.vx *= 0.97; pt.life -= dt }
      if (g.particles.length) g.particles = g.particles.filter((pt) => pt.life > 0)
      // Mol zakt langzaam terug na een pop.
      if (g.mole && g.mole.pop > 0) g.mole.pop = Math.max(0, g.mole.pop - dt * 1.6)
      const h = g.holes[g.holeIdx]
      const p = g.players[g.turn]
      const strokesNow = p.strokes[g.holeIdx] ?? 0

      if (g.phase === 'aim') {
        const rot = 1.6 * dt
        if (keys.has('ArrowLeft') || keys.has('KeyA')) g.angle -= rot
        if (keys.has('ArrowRight') || keys.has('KeyD')) g.angle += rot
        // Curve-bal instellen met Q/E (effect naar links / rechts).
        if (keys.has('KeyQ')) g.curve = Math.max(-1, g.curve - 1.4 * dt)
        if (keys.has('KeyE')) g.curve = Math.min(1, g.curve + 1.4 * dt)
      } else if (g.phase === 'charge') {
        g.chargeT = Math.min(CHARGE_TIME, g.chargeT + dt)
      } else if (g.phase === 'roll') {
        const ev = stepBall(h, p.ball, g.simT, dt)
        // Wormgat-teleport gedetecteerd (grote sprong in één tick) → swirl-deeltjes op beide plekken.
        const jump = Math.hypot(p.ball.x - g.lastBX, p.ball.y - g.lastBY)
        if (jump > 120 && ev === null) {
          const rainbow = ['#E63946', '#F4B92E', '#5fbf6e', '#4FA8E0', '#b06ae0', '#ff7ac0']
          emit(g, g.lastBX, g.lastBY, 16, rainbow, { spd: 200, life: 0.6, r: 3, up: 20 })
          emit(g, p.ball.x, p.ball.y, 16, rainbow, { spd: 200, life: 0.6, r: 3, up: 20 })
          g.shake = Math.max(g.shake, 0.5)
        }
        g.lastBX = p.ball.x; g.lastBY = p.ball.y
        // Regenboog-stofsliert achter de rollende bal (juice).
        const rollSp = Math.hypot(p.ball.vx, p.ball.vy)
        g.trailT -= dt
        if (rollSp > 60 && g.trailT <= 0) {
          g.trailT = 0.024
          const hue = `hsl(${Math.round((g.simT * 200) % 360)},90%,65%)`
          emit(g, p.ball.x, p.ball.y, 1, [hue], { spd: 26, life: 0.4, r: 2.6, grav: -20 })
        }
        // Bumper-tik: schermschud + vonken (client-side gedetecteerd, één keer per tik).
        if (g.bumpHitCd <= 0 && rollSp > 90) {
          for (const bp of h.bumpers) {
            if (Math.hypot(p.ball.x - bp.x, p.ball.y - bp.y) < bp.r + BALL_R + 3) {
              g.shake = Math.max(g.shake, 0.6)
              g.bumpHitCd = 0.12
              emit(g, p.ball.x, p.ball.y, 10, ['#F4B92E', '#fff3c4', '#ffd24a'], { spd: 220, life: 0.4, r: 2.6, grav: 200 })
              break
            }
          }
        }
        // Trampoline-fling: groene boing-vonken wanneer je eroverheen schiet.
        if (g.bumpHitCd <= 0 && rollSp > 40) {
          for (const tr of h.tramps) {
            if (Math.hypot(p.ball.x - tr.x, p.ball.y - tr.y) < tr.r) {
              g.shake = Math.max(g.shake, 0.5)
              g.bumpHitCd = 0.16
              emit(g, tr.x, tr.y, 14, ['#5fbf6e', '#b6f0c4', '#eafff0'], { spd: 250, up: 40, life: 0.5, r: 3, grav: 140 })
              break
            }
          }
        }
        // Reuzenkop denderde de bal weg → stofwolk + flinke schud.
        if (g.bumpHitCd <= 0 && h.boulder && rollSp > 120) {
          const bp = boulderPos(h.boulder, g.simT)
          if (Math.hypot(p.ball.x - bp.x, p.ball.y - bp.y) < h.boulder.r + BALL_R + 8) {
            g.shake = Math.max(g.shake, 0.95)
            g.bumpHitCd = 0.16
            emit(g, p.ball.x, p.ball.y, 16, ['#8a6a4a', '#b5936a', '#d9c07a'], { spd: 270, up: 40, life: 0.55, r: 3.2, grav: 320 })
          }
        }
        // Whack-a-mole: rolt de bal langs de molshoop, dan popt de mol en mept 'm weg.
        if (g.mole && g.moleArmed) {
          const b = p.ball
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > 45 && Math.hypot(b.x - g.mole.x, b.y - g.mole.y) < 30) {
            const a = Math.atan2(b.vy, b.vx) + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.7)
            b.vx = Math.cos(a) * sp * 0.95
            b.vy = Math.sin(a) * sp * 0.95
            g.mole.pop = 1
            g.moleArmed = false
            emit(g, g.mole.x, g.mole.y, 12, ['#6b4a2a', '#8a5a34', '#4e3620'], { spd: 150, up: 70, grav: 520, r: 3, life: 0.6 })
            show('🐹 MOL! Die tikt \'m lekker weg.', '#a06a3a')
          }
        }
        if (ev === 'cup') {
          const s = strokesNow
          g.cupGlow = 1.5
          g.flash = 0.5
          g.shake = Math.max(g.shake, 0.7)
          emit(g, h.cup.x, h.cup.y, 40, ['#F4B92E', '#E63946', '#4FA8E0', '#5fbf6e', '#ffffff'], { spd: 260, up: 150, grav: 440, r: 4, life: 1.1 })
          show(`🕳️ In! ${p.name}: ${s} ${s === 1 ? 'slag' : 'slagen'} — ${parTerm(s, h.par)}`, PLAYER_COLORS[g.turn])
          finishRun(g, s)
        } else if (ev === 'water') {
          emit(g, p.ball.x, p.ball.y, 16, ['#4FA8E0', '#7db8e8', '#eafcff'], { spd: 170, up: 90, grav: 560, r: 3, life: 0.6 })
          p.strokes[g.holeIdx] = strokesNow + 1 // strafslag
          p.ball = { x: p.preShot.x, y: p.preShot.y, vx: 0, vy: 0, spin: 0, sinking: 0 }
          const a = emoRef.current
          if (a) { try { a.currentTime = 0; void a.play() } catch { /* autoplay geweigerd → stil */ } }
          show('💦 Plons! Strafslag en terugleggen.', '#4FA8E0')
          g.phase = 'aim'
        } else if (ev === 'rest') {
          if (strokesNow >= MAX_STROKES) {
            show(`😅 Oppakken maar, ${p.name} — max ${MAX_STROKES}.`, '#7d8aa0')
            finishRun(g, MAX_STROKES)
          } else {
            g.phase = 'aim'
            g.angle = Math.atan2(h.cup.y - p.ball.y, h.cup.x - p.ball.x)
          }
        }
      }

      // ── UFO-ontvoering (bizar): tijdens het richten scheert soms een schotel binnen, straalt de
      //    bal op en dropt 'm ergens anders op de baan. Puur client-side; blokkeert even het slaan. ──
      if (g.ufoCd > 0 && !g.ufo) g.ufoCd = Math.max(0, g.ufoCd - dt)
      if (g.ufo) {
        const u = g.ufo
        u.t += dt
        if (u.phase === 'in') {
          u.x += (u.hx - u.x) * Math.min(1, 3 * dt)
          u.y += (u.hy - u.y) * Math.min(1, 3 * dt)
          if (Math.hypot(u.x - u.hx, u.y - u.hy) < 8) { u.phase = 'beam'; u.t = 0 }
        } else if (u.phase === 'beam') {
          if (u.t > 0.9) {
            emit(g, p.ball.x, p.ball.y, 16, ['#9be8ff', '#d8f6ff', '#7ad0ff'], { spd: 180, life: 0.5, r: 3, up: 30 })
            p.ball.x = u.dropX; p.ball.y = u.dropY; p.ball.vx = 0; p.ball.vy = 0
            p.preShot = { x: u.dropX, y: u.dropY }
            g.lastBX = u.dropX; g.lastBY = u.dropY
            g.angle = Math.atan2(h.cup.y - u.dropY, h.cup.x - u.dropX)
            emit(g, u.dropX, u.dropY, 18, ['#9be8ff', '#d8f6ff', '#7ad0ff'], { spd: 190, life: 0.55, r: 3, up: 40 })
            g.shake = Math.max(g.shake, 0.55)
            show('🛸 ONTVOERD! Ergens anders gedropt…', '#9be8ff')
            u.phase = 'out'; u.t = 0; u.hy = -180
          }
        } else { // out: wegscheren naar boven
          u.x += (u.hx - u.x) * Math.min(1, 2 * dt) + 30 * dt
          u.y += (u.hy - u.y) * Math.min(1, 2.6 * dt)
          if (u.y < -140) { g.ufo = null; g.ufoCd = 12 + Math.random() * 10 }
        }
      } else if (g.phase === 'aim' && !g.hand && g.ufoCd <= 0 && Math.hypot(p.ball.x - h.cup.x, p.ball.y - h.cup.y) > 150 && Math.random() < dt * 0.25) {
        const drop = pickDrop(h)
        g.ufo = { x: Math.random() < 0.5 ? -120 : WORLD_W + 120, y: 40, hx: p.ball.x, hy: Math.max(60, p.ball.y - 130), dropX: drop.x, dropY: drop.y, phase: 'in', t: 0 }
      }

      // ── Bliksem (bizar): getelegrafeerde inslag. Sta je te dichtbij als-ie inslaat → weggeblazen. ──
      if (g.boltCd > 0 && !g.bolt) g.boltCd = Math.max(0, g.boltCd - dt)
      if (g.bolt) {
        g.bolt.t += dt
        if (g.bolt.phase === 'warn' && g.bolt.t > 0.9) {
          g.bolt.phase = 'strike'; g.bolt.t = 0
          g.flash = 0.6; g.shake = Math.max(g.shake, 0.9)
          emit(g, g.bolt.x, g.bolt.y, 22, ['#fff7c4', '#9be8ff', '#ffffff'], { spd: 300, life: 0.5, r: 3, up: 60, grav: 300 })
          if (Math.hypot(p.ball.x - g.bolt.x, p.ball.y - g.bolt.y) < 60) {
            const a = Math.atan2(p.ball.y - g.bolt.y, p.ball.x - g.bolt.x) + (Math.random() - 0.5)
            const pw = 420 + Math.random() * 160
            p.ball.vx = Math.cos(a) * pw; p.ball.vy = Math.sin(a) * pw
            if (g.phase === 'aim') { g.lastBX = p.ball.x; g.lastBY = p.ball.y; g.phase = 'roll' }
            show('⚡ ZAP! Weggeblazen!', '#9be8ff')
          }
        } else if (g.bolt.phase === 'strike' && g.bolt.t > 0.22) {
          g.bolt = null; g.boltCd = 11 + Math.random() * 10
        }
      } else if (g.boltCd <= 0 && Math.random() < dt * 0.3) {
        const spot = Math.random() < 0.6 ? { x: p.ball.x + (Math.random() - 0.5) * 120, y: p.ball.y + (Math.random() - 0.5) * 120 } : pickDrop(h)
        g.bolt = { x: spot.x, y: spot.y, phase: 'warn', t: 0 }
      }

      // ── Reuzenhand (bizar): reikt van onderen in en flikt de bal een willekeurige kant op. ──
      if (g.handCd > 0 && !g.hand) g.handCd = Math.max(0, g.handCd - dt)
      if (g.hand) {
        const hd = g.hand
        hd.t += dt
        if (hd.phase === 'in') {
          hd.x += (hd.hx - hd.x) * Math.min(1, 3.2 * dt)
          hd.y += (hd.hy - hd.y) * Math.min(1, 3.2 * dt)
          if (Math.hypot(hd.x - hd.hx, hd.y - hd.hy) < 10) { hd.phase = 'flick'; hd.t = 0 }
        } else if (hd.phase === 'flick') {
          if (hd.t > 0.18) {
            const a = Math.random() * Math.PI * 2
            const pw = 300 + Math.random() * 220
            p.ball.vx = Math.cos(a) * pw; p.ball.vy = Math.sin(a) * pw
            g.lastBX = p.ball.x; g.lastBY = p.ball.y
            if (g.phase === 'aim') g.phase = 'roll'
            g.shake = Math.max(g.shake, 0.5)
            emit(g, p.ball.x, p.ball.y, 12, ['#ffd24a', '#fff3c4'], { spd: 200, life: 0.4, r: 3 })
            show('✋ FLIP! De reuzenhand flikt \'m weg!', '#ffd24a')
            hd.phase = 'out'; hd.t = 0
          }
        } else {
          hd.y += 380 * dt
          if (hd.y > WORLD_H + 220) { g.hand = null; g.handCd = 16 + Math.random() * 10 }
        }
      } else if (g.phase === 'aim' && !g.ufo && g.handCd <= 0 && Math.random() < dt * 0.18) {
        g.hand = { x: p.ball.x, y: WORLD_H + 220, hx: p.ball.x, hy: p.ball.y + 4, phase: 'in', t: 0 }
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
      draw(ctx, canvas, g, facesRef.current)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
      if (e.code === 'Escape') { setStage('menu'); return }
      const g = gameRef.current
      if (!g || e.repeat) return
      if (g.phase === 'aim' && e.code === 'Space' && !g.ufo && !g.hand) {
        g.phase = 'charge'
        g.chargeT = 0
      }
      // Mulligan (R): leg de bal terug en trek de slag terug — 1× per speler per hole.
      if (g.phase === 'aim' && e.code === 'KeyR' && g.mulliganLeft && (g.players[g.turn].strokes[g.holeIdx] ?? 0) > 0) {
        const p = g.players[g.turn]
        p.ball = { x: p.preShot.x, y: p.preShot.y, vx: 0, vy: 0, spin: 0, sinking: 0 }
        p.strokes[g.holeIdx] = Math.max(0, (p.strokes[g.holeIdx] ?? 0) - 1)
        g.mulliganLeft = false
        g.curve = 0
        g.angle = Math.atan2(g.holes[g.holeIdx].cup.y - p.ball.y, g.holes[g.holeIdx].cup.x - p.ball.x)
        show('↩️ Mulligan — slag terug!', '#7db8e8')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code)
      const g = gameRef.current
      if (!g) return
      if (g.phase === 'charge' && e.code === 'Space') {
        const p = g.players[g.turn]
        const power = POWER_MIN + (POWER_MAX - POWER_MIN) * (g.chargeT / CHARGE_TIME)
        p.preShot = { x: p.ball.x, y: p.ball.y }
        p.ball.vx = Math.cos(g.angle) * power
        p.ball.vy = Math.sin(g.angle) * power
        p.ball.spin = g.curve // curve-bal → zijwaartse drift tijdens het rollen
        p.strokes[g.holeIdx] = (p.strokes[g.holeIdx] ?? 0) + 1
        g.moleArmed = true // de mol mag deze slag weer één keer toeslaan
        g.lastBX = p.ball.x; g.lastBY = p.ball.y // baseline voor de teleport-detectie
        g.phase = 'roll'
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keys.clear()
    }
  }, [stage])

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/putjesscheppers.png" alt="Putjesscheppers" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Spelers">
              <Seg options={['1 (vs par)', '2', '3', '4']} value={playerCount - 1} onChange={(i) => setPlayerCount(i + 1)} />
            </MenuRow>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {Array.from({ length: playerCount }, (_, i) => (
                <div key={i} className={i % 2 === 0 ? 'sm:border-r sm:border-white/10 sm:pr-5' : ''}>
                  <FacePicker label={`Speler ${i + 1}`} pick={picks[i]} color={PLAYER_COLORS[i]}
                    onPick={(v) => setPicks((prev) => { const n = [...prev]; n[i] = v; return n })} />
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
              9 random gegenereerde holes — elke ronde een nieuwe baan. Om de beurt speel je de hele hole uit; minste slagen wint.
            </p>
            <button onClick={startMatch}
              className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
              Afslaan ⛳
            </button>
          </div>

          <div className="max-w-md text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            ←/→ richten · spatie vasthouden = power · Q/E = curve-bal (↺/↻) · R = mulligan (slag terug, 1×/hole)<br />
            pijl-tegels geven een boost · water = strafslag · max {MAX_STROKES} slagen p.h. · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          {isTouch && !portrait && (
            <TouchGamepad dir="lr" buttons={[
              { code: 'KeyQ', label: 'Krul◄', color: 'border-sky-300/40 bg-sky-500/25' },
              { code: 'KeyE', label: 'Krul►', color: 'border-sky-300/40 bg-sky-500/25' },
              { code: 'KeyR', label: 'Mull', color: 'border-white/25 bg-white/10' },
              { code: 'Space', label: 'Slag', color: 'border-emerald-300/50 bg-emerald-500/30', big: true },
            ]} />
          )}
          {isTouch && portrait && <RotateNotice game="Putjesscheppers" />}
          <button onClick={() => setStage('menu')}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[10%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-4xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: popup.color }}>
                {popup.text}
              </h2>
            </div>
          )}

          {scorecard && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-white/10 bg-wk-surface p-8 text-center animate-fade-up">
                <h2 className="font-score text-4xl uppercase text-wk-gold">
                  {scorecard.final ? 'Eindstand 🏆' : `Scorekaart · hole ${scorecard.holePars.length}/${HOLES}`}
                </h2>
                <table className="font-mono text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-wk-muted">
                      <th className="px-2 py-1 text-left">Speler</th>
                      {scorecard.holePars.map((par, i) => (
                        <th key={i} className="px-1.5 py-1">{i + 1}<span className="text-wk-muted/60">·p{par}</span></th>
                      ))}
                      <th className="px-2 py-1">Tot.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecard.rows.map((row) => {
                      const best = Math.min(...scorecard.rows.map((r) => r.total))
                      return (
                        <tr key={row.name} className={row.total === best && scorecard.final ? 'text-wk-gold' : 'text-wk-text'}>
                          <td className="px-2 py-1 text-left">{row.name}</td>
                          {row.strokes.map((v, i) => (
                            <td key={i} className="px-1.5 py-1">{v ?? '–'}</td>
                          ))}
                          <td className="px-2 py-1 font-bold">{row.total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="flex gap-3 pt-1">
                  {scorecard.final ? (
                    <>
                      <button onClick={startMatch} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">Nieuwe baan</button>
                      <button onClick={() => setStage('menu')} className="rounded-xl border border-white/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-soft hover:border-white/35">Menu</button>
                    </>
                  ) : (
                    <button onClick={nextHole} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">
                      Volgende hole →
                    </button>
                  )}
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
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, faces: Record<string, HTMLImageElement>) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawBackdrop(ctx, cw, ch, g.holes[g.holeIdx].theme, g.simT)

  const sc = Math.min(cw / (WORLD_W + 60), (ch - 80) / (WORLD_H + 40))
  const ox = (cw - WORLD_W * sc) / 2
  const oy = 58 + ((ch - 80) - WORLD_H * sc) / 2
  const shx = g.shake > 0 ? (Math.random() - 0.5) * 24 * g.shake : 0
  const shy = g.shake > 0 ? (Math.random() - 0.5) * 24 * g.shake : 0
  ctx.save()
  ctx.translate(ox + shx, oy + shy)
  ctx.scale(sc, sc)

  const h = g.holes[g.holeIdx]
  const p = g.players[g.turn]

  // Muren (rects iets uitvergroot) + de baan er bovenop — kleuren uit het hole-thema.
  const th = h.theme
  for (const r of h.rects) {
    ctx.fillStyle = th.wall
    ctx.fillRect(r.x - 9, r.y - 9, r.w + 18, r.h + 18)
  }
  for (const r of h.rects) {
    ctx.fillStyle = th.fairway
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
  // maaibanen in de tweede thema-kleur
  for (let i = 0; i < WORLD_W; i += 56) {
    ctx.fillStyle = th.fairway2
    for (const r of h.rects) {
      const x0 = Math.max(r.x, i)
      const x1 = Math.min(r.x + r.w, i + 28)
      if (x1 > x0) ctx.fillRect(x0, r.y, x1 - x0, r.h)
    }
  }

  // Zand, water.
  for (const s of h.sand) {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = '#d9c07a'
    ctx.fill()
  }
  for (const w of h.water) {
    ctx.beginPath()
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2)
    ctx.fillStyle = '#3d7dc2'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(w.x, w.y, w.r * 0.55, 0.4, 2.2)
    ctx.stroke()
  }

  // Boost-tegels: cyaan cirkel met een pijl in de zet-richting.
  for (const bo of h.boost) {
    ctx.beginPath()
    ctx.arc(bo.x, bo.y, bo.r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(63,224,200,0.28)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(63,224,200,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.save()
    ctx.translate(bo.x, bo.y)
    ctx.rotate(bo.ang)
    ctx.strokeStyle = '#eafffb'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-10, 0); ctx.lineTo(8, 0)
    ctx.moveTo(2, -6); ctx.lineTo(10, 0); ctx.lineTo(2, 6)
    ctx.stroke()
    ctx.restore()
  }

  // Trampolines: veerkrachtige groene matten (pulserend).
  for (const tr of h.tramps) {
    ctx.save()
    ctx.translate(tr.x, tr.y)
    const pulse = 1 + 0.06 * Math.sin(g.simT * 6 + tr.x)
    ctx.scale(pulse, pulse)
    ctx.fillStyle = '#2f9e54'
    ctx.beginPath(); ctx.arc(0, 0, tr.r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#7ff0a0'; ctx.lineWidth = 3; ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, 0, tr.r * 0.62, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(0, 0, tr.r * 0.3, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }

  // Wormgaten: draaikolken (paar A cyaan ↔ B magenta).
  for (let i = 0; i < h.portals.length; i++) {
    const pt = h.portals[i]
    const col = i % 2 === 0 ? '#3fe0e0' : '#e05ac0'
    ctx.save()
    ctx.translate(pt.x, pt.y)
    const pg = ctx.createRadialGradient(0, 0, 2, 0, 0, pt.r)
    pg.addColorStop(0, '#000'); pg.addColorStop(0.7, col + '55'); pg.addColorStop(1, col + '00')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.arc(0, 0, pt.r, 0, Math.PI * 2); ctx.fill()
    ctx.rotate(g.simT * (i % 2 === 0 ? 3 : -3))
    ctx.strokeStyle = col; ctx.lineWidth = 3
    for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.arc(0, 0, pt.r - 4, a * 2.1, a * 2.1 + 1.3); ctx.stroke() }
    ctx.restore()
  }

  // Zwart gat: donkere draaikolk met paarse accretieschijf.
  if (h.blackhole) {
    const bh = h.blackhole
    ctx.save()
    ctx.translate(bh.x, bh.y)
    const bg = ctx.createRadialGradient(0, 0, 2, 0, 0, bh.r)
    bg.addColorStop(0, '#000'); bg.addColorStop(0.28, '#000'); bg.addColorStop(0.62, 'rgba(120,60,200,0.32)'); bg.addColorStop(1, 'rgba(120,60,200,0)')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.arc(0, 0, bh.r, 0, Math.PI * 2); ctx.fill()
    ctx.rotate(g.simT * 2)
    ctx.strokeStyle = 'rgba(200,150,255,0.85)'; ctx.lineWidth = 3
    for (let a = 0; a < 4; a++) { ctx.beginPath(); ctx.arc(0, 0, 18 + a * 4, a * 1.6, a * 1.6 + 1.4); ctx.stroke() }
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // Tee + cup (met wapperende vlag).
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(h.tee.x - 13, h.tee.y - 13, 26, 26)
  // Glinsterring bij een net gemaakte hole.
  if (g.cupGlow > 0) {
    const k = g.cupGlow / 1.5
    ctx.beginPath()
    ctx.arc(h.cup.x, h.cup.y, CUP_R + 6 + (1 - k) * 30, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(244,185,46,${0.65 * k})`
    ctx.lineWidth = 3.5
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(h.cup.x, h.cup.y, CUP_R, 0, Math.PI * 2)
  ctx.fillStyle = '#10321c'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 2
  ctx.stroke()
  // vlaggenstok
  ctx.strokeStyle = '#e8e2d0'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(h.cup.x, h.cup.y)
  ctx.lineTo(h.cup.x, h.cup.y - 48)
  ctx.stroke()
  // wapperende pennant (sinus-golf)
  const wv = Math.sin(g.simT * 4 + h.cup.x * 0.05)
  ctx.fillStyle = '#E63946'
  ctx.beginPath()
  ctx.moveTo(h.cup.x, h.cup.y - 48)
  ctx.quadraticCurveTo(h.cup.x + 15, h.cup.y - 45 + wv * 3, h.cup.x + 30, h.cup.y - 41 + wv * 6)
  ctx.quadraticCurveTo(h.cup.x + 16, h.cup.y - 39 - wv * 2, h.cup.x, h.cup.y - 33)
  ctx.closePath()
  ctx.fill()

  // Bumpers: de koppen.
  for (const bp of h.bumpers) {
    const img = faces[bp.face]
    ctx.beginPath()
    ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2)
    ctx.fillStyle = '#1c2431'
    ctx.fill()
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(bp.x, bp.y, bp.r - 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, bp.x - bp.r, bp.y - bp.r, bp.r * 2, bp.r * 2)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2)
    ctx.strokeStyle = '#F4B92E'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }

  // Molenwiek.
  if (h.mill) {
    const a = g.simT * h.mill.speed
    ctx.strokeStyle = '#8a5a2b'
    ctx.lineWidth = MILL_R * 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(h.mill.x - Math.cos(a) * h.mill.len, h.mill.y - Math.sin(a) * h.mill.len)
    ctx.lineTo(h.mill.x + Math.cos(a) * h.mill.len, h.mill.y + Math.sin(a) * h.mill.len)
    ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.arc(h.mill.x, h.mill.y, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#5b4630'
    ctx.fill()
  }

  // Molshoop + de mol (popt omhoog bij het meppen).
  if (g.mole) {
    const mx = g.mole.x
    const my = g.mole.y
    // hoopje aarde
    ctx.fillStyle = '#6b4a2a'
    ctx.beginPath()
    ctx.ellipse(mx, my + 6, 20, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    const rise = g.mole.pop * 16
    if (g.mole.pop > 0.02) {
      // mol-kopje (bruin met snuit + oogjes) dat uit de hoop piept
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(mx, my + 4, 20, 9, 0, 0, Math.PI * 2) // clip binnen de hoop-opening
      ctx.rect(mx - 20, my + 4 - 40, 40, 40)
      ctx.clip()
      ctx.fillStyle = '#8a5a34'
      ctx.beginPath()
      ctx.arc(mx, my + 2 - rise, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3a2416'
      ctx.beginPath(); ctx.arc(mx - 4, my - 2 - rise, 1.8, 0, Math.PI * 2); ctx.arc(mx + 4, my - 2 - rise, 1.8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e59ac0'
      ctx.beginPath(); ctx.arc(mx, my + 2 - rise, 2.4, 0, Math.PI * 2); ctx.fill() // snuitje
      ctx.restore()
    }
  }

  // Richtlijn + power — gebogen preview als er curve op zit (Q/E).
  if (g.phase === 'aim' || g.phase === 'charge') {
    ctx.save()
    ctx.setLineDash([10, 9])
    ctx.strokeStyle = PLAYER_COLORS[g.turn]
    ctx.lineWidth = 3
    const len = 90 + (g.phase === 'charge' ? (g.chargeT / CHARGE_TIME) * 150 : 0)
    const steps = 16
    let px = p.ball.x
    let py = p.ball.y
    let ang = g.angle
    ctx.beginPath()
    ctx.moveTo(px, py)
    for (let i = 0; i < steps; i++) {
      ang += g.curve * 0.055
      px += Math.cos(ang) * (len / steps)
      py += Math.sin(ang) * (len / steps)
      ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.restore()
    if (Math.abs(g.curve) > 0.05) {
      ctx.font = 'bold 13px monospace'
      ctx.fillStyle = PLAYER_COLORS[g.turn]
      ctx.textAlign = 'center'
      ctx.fillText(g.curve < 0 ? '↺ curve' : '↻ curve', p.ball.x, p.ball.y - 16)
    }
  }

  // De bal — krimpt zichtbaar in de cup als-ie zinkt.
  const sinkK = p.ball.sinking > 0 ? Math.max(0.1, p.ball.sinking / SINK_TIME) : 1
  ctx.beginPath()
  ctx.ellipse(p.ball.x + 2, p.ball.y + 4, BALL_R * sinkK, BALL_R * 0.5 * sinkK, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(p.ball.x, p.ball.y, BALL_R * sinkK, 0, Math.PI * 2)
  ctx.fillStyle = '#f4f6f9'
  ctx.fill()
  ctx.strokeStyle = PLAYER_COLORS[g.turn]
  ctx.lineWidth = 2.5
  ctx.stroke()

  // Rollende reuzenkop (Indiana Jones): grote tuimelende collega-kop, dendert over de baan.
  if (h.boulder) {
    const bp = boulderPos(h.boulder, g.simT)
    const r = h.boulder.r
    ctx.save()
    ctx.translate(bp.x, bp.y + 5)
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath(); ctx.ellipse(3, 4, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.translate(bp.x, bp.y)
    ctx.rotate(g.simT * h.boulder.speed * 6)
    const bimg = faces[h.boulder.face]
    if (bimg && bimg.complete && bimg.naturalWidth > 0) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip()
      ctx.drawImage(bimg, -r, -r, r * 2, r * 2); ctx.restore()
    } else {
      ctx.fillStyle = '#8b8f96'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 4; ctx.stroke()
    ctx.restore()
  }

  // UFO-ontvoering: schotel + tractorstraal.
  if (g.ufo) {
    const u = g.ufo
    if (u.phase !== 'out') {
      const beamA = u.phase === 'beam' ? 0.35 + 0.2 * Math.sin(g.simT * 20) : 0.16
      ctx.fillStyle = `rgba(150,235,255,${beamA})`
      ctx.beginPath()
      ctx.moveTo(u.x - 12, u.y + 8)
      ctx.lineTo(u.x + 12, u.y + 8)
      ctx.lineTo(u.hx + 48, u.hy + 150)
      ctx.lineTo(u.hx - 48, u.hy + 150)
      ctx.closePath(); ctx.fill()
    }
    ctx.save()
    ctx.translate(u.x, u.y)
    ctx.fillStyle = '#9aa6b5'; ctx.beginPath(); ctx.ellipse(0, 0, 52, 20, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#c7d2df'; ctx.beginPath(); ctx.ellipse(0, -4, 24, 15, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(180,240,255,0.85)'; ctx.beginPath(); ctx.arc(0, -8, 15, Math.PI, 0); ctx.fill()
    for (let i = 0; i < 5; i++) { ctx.fillStyle = Math.sin(g.simT * 10 + i) > 0 ? '#ffd24a' : '#e0517a'; ctx.beginPath(); ctx.arc(-40 + i * 20, 7, 3.2, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }

  // Bliksem: waarschuwingsring (warn) → gekartelde flits van bovenaf (strike).
  if (g.bolt) {
    const bo = g.bolt
    if (bo.phase === 'warn') {
      const k = 0.4 + 0.4 * Math.sin(g.simT * 18)
      ctx.strokeStyle = `rgba(150,220,255,${k})`; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(bo.x, bo.y, 34, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(bo.x, bo.y, 20, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = `rgba(150,220,255,${k})`; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'
      ctx.fillText('⚡', bo.x, bo.y + 8)
    } else {
      ctx.beginPath()
      let ly = 0, lx = bo.x
      ctx.moveTo(lx, ly)
      while (ly < bo.y) { ly += 28; lx = bo.x + (Math.random() - 0.5) * 46; ctx.lineTo(lx, Math.min(ly, bo.y)) }
      ctx.lineTo(bo.x, bo.y)
      ctx.strokeStyle = 'rgba(180,230,255,0.6)'; ctx.lineWidth = 9; ctx.stroke()
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke()
    }
  }

  // Reuzenhand: reikt van onderen in en flikt de bal weg.
  if (g.hand) {
    const hd = g.hand
    ctx.save()
    ctx.translate(hd.x, hd.y)
    ctx.fillStyle = '#e8b48c'
    ctx.fillRect(-16, 0, 32, WORLD_H) // arm naar beneden uit beeld
    ctx.beginPath(); ctx.ellipse(0, -6, 27, 31, 0, 0, Math.PI * 2); ctx.fill() // palm
    ctx.fillStyle = '#f0c29c'
    for (let i = 0; i < 4; i++) ctx.fillRect(-18 + i * 11 - 3, -48, 8, 28) // vingers
    ctx.beginPath(); ctx.ellipse(-25, -10, 8, 15, 0.5, 0, Math.PI * 2); ctx.fill() // duim
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(0, -6, 27, 31, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }

  // Deeltjes (stof/confetti/plons) — in wereldcoördinaten, bovenop de baan.
  for (const pt of g.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.max))
    ctx.fillStyle = pt.c
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.restore()

  // ── HUD ───────────────────────────────────────────────────────────────────
  const hudW = 320, hudX = cw / 2 - hudW / 2
  roundRect(ctx, hudX, 8, hudW, 46, 14)
  ctx.fillStyle = 'rgba(10,16,26,0.72)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 17px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(`HOLE ${g.holeIdx + 1}/${HOLES} · PAR ${h.par}`, cw / 2, 28)
  const strokes = p.strokes[g.holeIdx] ?? 0
  ctx.font = '13px monospace'
  ctx.fillStyle = PLAYER_COLORS[g.turn]
  ctx.fillText(`${p.name} · slag ${strokes + (g.phase === 'roll' ? 0 : 1)}`, cw / 2, 48)
  const img = faces[p.face]
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cw / 2 - 130, 34, 18, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, cw / 2 - 148, 16, 36, 36)
    ctx.restore()
  }
  if (g.phase === 'charge') {
    const f = g.chargeT / CHARGE_TIME
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(cw / 2 - 90, 56, 180, 10)
    ctx.fillStyle = f > 0.85 ? '#E63946' : '#F4B92E'
    ctx.fillRect(cw / 2 - 90, 56, 180 * f, 10)
  }

  // Inhole-flits (feest).
  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.6})`
    ctx.fillRect(0, 0, cw, ch)
  }
}

// Wolkje (drie bollen) voor de gras/strand-lucht.
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.arc(x + r, y + 6, r * 0.8, 0, Math.PI * 2)
  ctx.arc(x - r, y + 6, r * 0.8, 0, Math.PI * 2)
  ctx.fill()
}

// Levendige, geanimeerde achtergrond per hole-thema (zon+wolken, disco-bundels, sneeuw, lava-vonken…).
function drawBackdrop(ctx: CanvasRenderingContext2D, cw: number, ch: number, theme: GolfTheme, t: number) {
  const name = theme.name
  const sky: Record<string, [string, string]> = {
    Gras: ['#7ec8f0', '#cdeafe'], Woestijn: ['#f2c766', '#f7e2a8'], Nachtclub: ['#140a2e', '#2a1550'],
    Winter: ['#a9c8e0', '#e8f3fb'], Strand: ['#ff9e5e', '#ffd89b'], Lava: ['#2a0a06', '#5a140a'],
    Neon: ['#05060f', '#0a1430'], Herfst: ['#e08a3a', '#f6d59a'], Klei: ['#c97a5a', '#f0c8b0'],
  }
  const [c0, c1] = sky[name] ?? ['#0c1420', '#1a2740']
  const grd = ctx.createLinearGradient(0, 0, 0, ch)
  grd.addColorStop(0, c0); grd.addColorStop(1, c1)
  ctx.fillStyle = grd; ctx.fillRect(0, 0, cw, ch)

  if (name === 'Gras' || name === 'Strand' || name === 'Woestijn') { // draaiende zon + drijvende wolken
    const sx = cw * 0.82, sy = ch * 0.2
    ctx.strokeStyle = 'rgba(255,240,150,0.4)'; ctx.lineWidth = 3
    for (let i = 0; i < 12; i++) { const a = t * 0.3 + i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * 54, sy + Math.sin(a) * 54); ctx.lineTo(sx + Math.cos(a) * 72, sy + Math.sin(a) * 72); ctx.stroke() }
    ctx.fillStyle = 'rgba(255,240,150,0.95)'; ctx.beginPath(); ctx.arc(sx, sy, 46, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    for (let i = 0; i < 3; i++) cloud(ctx, ((t * 20 + i * cw / 3) % (cw + 160)) - 80, ch * (0.14 + 0.12 * i), 34)
  } else if (name === 'Nachtclub' || name === 'Neon') { // strobende lichtbundels + fonkelende sterren
    for (let i = 0; i < 5; i++) {
      const a = Math.sin(t * 1.4 + i) * 0.5
      ctx.save(); ctx.translate(cw * (0.14 + 0.18 * i), 0); ctx.rotate(a)
      const hue = (t * 80 + i * 70) % 360
      const b = ctx.createLinearGradient(0, 0, 0, ch)
      b.addColorStop(0, `hsla(${hue},90%,60%,0.3)`); b.addColorStop(1, `hsla(${hue},90%,60%,0)`)
      ctx.fillStyle = b; ctx.fillRect(-32, 0, 64, ch); ctx.restore()
    }
    for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i)); ctx.fillStyle = '#fff'; ctx.fillRect((i * 97.3) % cw, ((i * 53.7) % ch) * 0.6, 2, 2) }
    ctx.globalAlpha = 1
  } else if (name === 'Winter') { // sneeuwval
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 60; i++) { const x = (i * 89.7 + Math.sin(t + i) * 20) % cw; const y = (i * 63.1 + t * 40) % ch; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill() }
  } else if (name === 'Lava') { // gloed-puls + opstijgende vonken
    ctx.fillStyle = `rgba(255,90,20,${0.15 + 0.1 * Math.sin(t * 2)})`; ctx.fillRect(0, ch * 0.6, cw, ch * 0.4)
    ctx.fillStyle = 'rgba(255,150,40,0.9)'
    for (let i = 0; i < 30; i++) { const y = ch - ((i * 40 + t * 90) % ch); ctx.globalAlpha = Math.max(0, 1 - y / ch); ctx.beginPath(); ctx.arc((i * 77.7) % cw, y, 2, 0, Math.PI * 2); ctx.fill() }
    ctx.globalAlpha = 1
  } else if (name === 'Herfst') { // dwarrelende blaadjes
    const cols = ['#e8842a', '#c94a2a', '#f0b429', '#8a5a2a']
    for (let i = 0; i < 24; i++) { const x = (i * 91.3 + Math.sin(t * 1.3 + i) * 40) % cw; const y = (i * 70 + t * 55) % ch; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + i); ctx.fillStyle = cols[i % 4]; ctx.fillRect(-4, -3, 8, 6); ctx.restore() }
  }
}

// Afgeronde-rechthoek pad (voor de HUD-balk).
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
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
