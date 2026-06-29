'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'
import TeamsPopup from '../teams-popup'

// ── Logisch speelveld (wordt geschaald naar de breedte van het scherm) ──────────
const W = 380
const H = 620

// Spritesheets uit de Legacy Collection (horizontale strips). fw/fh = framemaat.
const SHEET = {
  player: { src: '/spel/space/player.png', frames: 5, fw: 48, fh: 48 },
  enemy1: { src: '/spel/space/enemy1.png', frames: 5, fw: 64, fh: 64 },
  enemy2: { src: '/spel/space/enemy2.png', frames: 5, fw: 48, fh: 48 },
  enemy3: { src: '/spel/space/enemy3.png', frames: 5, fw: 48, fh: 48 },
  bolt:   { src: '/spel/space/bolt.png',   frames: 6, fw: 32, fh: 32 },
  pulse:  { src: '/spel/space/pulse.png',  frames: 4, fw: 63, fh: 32 },
  boom:   { src: '/spel/space/explosion.png', frames: 8, fw: 48, fh: 48 },
  bot1:   { src: '/spel/space/bot1.png', frames: 5, fw: 48, fh: 48 },
  bot2:   { src: '/spel/space/bot2.png', frames: 4, fw: 48, fh: 48 },
  bot3:   { src: '/spel/space/bot3.png', frames: 4, fw: 48, fh: 48 },
  midboss:{ src: '/spel/space/midboss.png', frames: 5, fw: 192, fh: 144 },
} as const
const STILL = {
  bg: '/spel/space/bg.png',
  planet: '/spel/space/planet.png',
  asteroid1: '/spel/space/asteroid1.png',
  asteroid2: '/spel/space/asteroid2.png',
  rick: '/rick.png',
}
// Onze eigen mannen als "ace"-vijanden (gepixeld, droppen gegarandeerd een power-up).
const ACE_FACES = ['/spelers/lukaku.png', '/spelers/bus.png', '/spelers/ho.png', '/spelers/kim.png', '/spelers/vince.png']

type EnemyKind = 'enemy1' | 'enemy2' | 'enemy3' | 'bot1' | 'bot2' | 'bot3'
const ENEMY_DEF: Record<EnemyKind, { hp: number; pts: number; r: number; scale: number }> = {
  enemy2: { hp: 1, pts: 10, r: 16, scale: 0.62 },
  enemy3: { hp: 2, pts: 15, r: 16, scale: 0.66 },
  enemy1: { hp: 3, pts: 25, r: 22, scale: 0.72 },
  bot1:   { hp: 1, pts: 12, r: 15, scale: 0.6 },
  bot2:   { hp: 2, pts: 16, r: 15, scale: 0.6 },
  bot3:   { hp: 2, pts: 18, r: 15, scale: 0.6 },
}

// Verloop: 3 golven → mid-boss (pixel-mech) → 2 golven → eindbaas Reuze-Rick.
const WAVES: { count: number; types: EnemyKind[]; speed: number; rocks: number; fire: number }[] = [
  { count: 6,  types: ['enemy2', 'bot1'],           speed: 1.0,  rocks: 0, fire: 0.5 },
  { count: 8,  types: ['bot1', 'enemy3', 'bot2'],    speed: 1.1,  rocks: 1, fire: 0.7 },
  { count: 9,  types: ['enemy3', 'bot2', 'enemy1'],  speed: 1.2,  rocks: 2, fire: 0.9 },
  { count: 11, types: ['bot1', 'bot3', 'enemy1'],    speed: 1.35, rocks: 2, fire: 1.1 },
  { count: 13, types: ['enemy1', 'bot3', 'enemy3'],  speed: 1.5,  rocks: 3, fire: 1.3 },
]
type Stage = { t: 'wave'; i: number } | { t: 'boss'; kind: 'mech' | 'rick' }
const STAGES: Stage[] = [
  { t: 'wave', i: 0 }, { t: 'wave', i: 1 }, { t: 'wave', i: 2 },
  { t: 'boss', kind: 'mech' },
  { t: 'wave', i: 3 }, { t: 'wave', i: 4 },
  { t: 'boss', kind: 'rick' },
]

type PowerKind = 'rapid' | 'spread' | 'shield' | 'bomb' | 'life'
const POWER: Record<PowerKind, { color: string; label: string }> = {
  rapid:  { color: '#F4B92E', label: 'R' },
  spread: { color: '#2EA84B', label: '3' },
  shield: { color: '#2D6BE5', label: 'S' },
  bomb:   { color: '#E63946', label: 'B' },
  life:   { color: '#FF6FB0', label: '♥' },
}

type Img = HTMLImageElement
type Enemy = { x: number; y: number; ty: number; t: number; kind: EnemyKind; hp: number; frame: number; ft: number; fireCd: number; amp: number; phase: number; sx: number }
type Bullet = { x: number; y: number; vx: number; vy: number; frame: number; ft: number; r: number }
type Rock = { x: number; y: number; vy: number; vx: number; rot: number; vr: number; img: Img | null; size: number; hp: number }
type Pow = { x: number; y: number; vy: number; kind: PowerKind; t: number }
type Boom = { x: number; y: number; frame: number; ft: number; scale: number }
type Boss = { kind: 'mech' | 'rick'; x: number; y: number; vx: number; hp: number; max: number; t: number; fireCd: number; entering: boolean }
type Ace = { x: number; y: number; ty: number; vx: number; t: number; hp: number; max: number; face: string; fireCd: number }

export default function SpaceClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [hud, setHud] = useState({ score: 0, lives: 3, wave: 0, bossHp: 0, bossMax: 0, bossName: '' })
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean; win: boolean; timeBonus?: number; secs?: number } | null>(null)
  const [ready, setReady] = useState(false)

  const phaseRef = useRef(phase); phaseRef.current = phase
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const imgs = useRef<Record<string, Img>>({})
  const rickPix = useRef<HTMLCanvasElement | null>(null)   // gepixeleerde Rick voor de boss
  const facePix = useRef<Record<string, HTMLCanvasElement>>({})   // gepixelde footballers (aces)

  // Spelstaat (refs zodat de loop niet herstart)
  const player = useRef({ x: W / 2, y: H - 80, tx: W / 2, ty: H - 80, fireCd: 0, inv: 0, rapid: 0, spread: 0, shield: 0, frame: 2 })
  const bullets = useRef<Bullet[]>([])
  const ebullets = useRef<Bullet[]>([])
  const enemies = useRef<Enemy[]>([])
  const aces = useRef<Ace[]>([])
  const aceTimer = useRef(9)
  const rocks = useRef<Rock[]>([])
  const powers = useRef<Pow[]>([])
  const booms = useRef<Boom[]>([])
  const boss = useRef<Boss | null>(null)
  const stars = useRef<{ x: number; y: number; z: number }[]>([])
  const planetY = useRef(-140)
  const bgY = useRef(0)
  const score = useRef(0)
  const lives = useRef(3)
  const runStart = useRef(0)   // start-tijd (voor de tijdbonus bij uitspelen)
  const stage = useRef(0)          // index in STAGES
  const curWave = useRef(WAVES[0]) // huidige golf-config (snelheid/vuur)
  const pending = useRef(0)        // tijd tot volgende golf/boss
  const flash = useRef(0)          // schermflits (bom / hit)
  const flashCol = useRef('#ffffff')

  // ── Assets laden ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    const all = [...Object.values(SHEET).map((s) => s.src), ...Object.values(STILL), ...ACE_FACES]
    let done = 0
    const pixelate = (im: Img, size = 40) => { const c = document.createElement('canvas'); c.width = size; c.height = size; const cx = c.getContext('2d'); if (cx) cx.drawImage(im, 0, 0, size, size); return c }
    all.forEach((src) => {
      const im = new window.Image()
      im.onload = () => {
        imgs.current[src] = im
        if (src === STILL.rick) rickPix.current = pixelate(im, 44)
        else if (ACE_FACES.includes(src)) facePix.current[src] = pixelate(im, 38)
        done++; if (done === all.length && alive) setReady(true)
      }
      im.onerror = () => { done++; if (done === all.length && alive) setReady(true) }
      im.src = src
    })
    return () => { alive = false }
  }, [])

  const setupCanvas = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return
    const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    cv.width = W * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d')
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false }
  }, [])

  // ── Teken-helper voor spritesheets ───────────────────────────────────────────
  const drawSheet = (ctx: CanvasRenderingContext2D, key: keyof typeof SHEET, frame: number, cx: number, cy: number, scale: number, flipY = false, rot = 0) => {
    const sh = SHEET[key]; const im = imgs.current[sh.src]; if (!im) return
    const f = ((frame % sh.frames) + sh.frames) % sh.frames
    ctx.save(); ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.scale(flipY ? 1 : 1, flipY ? -1 : 1)
    ctx.drawImage(im, f * sh.fw, 0, sh.fw, sh.fh, -sh.fw * scale / 2, -sh.fh * scale / 2, sh.fw * scale, sh.fh * scale)
    ctx.restore()
  }

  const addBoom = (x: number, y: number, scale = 1) => booms.current.push({ x, y, frame: 0, ft: 0, scale })

  const spawnWave = useCallback((i: number) => {
    const w = WAVES[i]; if (!w) return
    curWave.current = w
    const cols = Math.min(6, w.count)
    for (let n = 0; n < w.count; n++) {
      const kind = w.types[n % w.types.length]
      const col = n % cols
      const row = Math.floor(n / cols)
      const x = (W / (cols + 1)) * (col + 1)
      enemies.current.push({
        x, y: -30 - row * 46, ty: 70 + row * 44, t: 0, kind, hp: ENEMY_DEF[kind].hp,
        frame: 0, ft: 0, fireCd: 1 + Math.random() * 2 / w.fire, amp: 18 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2, sx: x,
      })
    }
    for (let r = 0; r < w.rocks; r++) {
      const im = imgs.current[Math.random() < 0.5 ? STILL.asteroid1 : STILL.asteroid2] ?? null
      rocks.current.push({ x: 30 + Math.random() * (W - 60), y: -40 - Math.random() * 200, vy: 60 + Math.random() * 50 * w.speed, vx: (Math.random() - 0.5) * 30, rot: 0, vr: (Math.random() - 0.5) * 3, img: im, size: 1.4 + Math.random() * 1.6, hp: 2 })
    }
  }, [])

  const spawnBoss = useCallback((kind: 'mech' | 'rick') => {
    const hpv = kind === 'mech' ? 130 : 240
    boss.current = { kind, x: W / 2, y: -130, vx: kind === 'mech' ? 72 : 46, hp: hpv, max: hpv, t: 0, fireCd: 1.4, entering: true }
    setHud((h) => ({ ...h, bossHp: hpv, bossMax: hpv, bossName: kind === 'mech' ? 'Mecha-Tank' : 'Reuze-Rick' }))
  }, [])

  const reset = useCallback(() => {
    player.current = { x: W / 2, y: H - 80, tx: W / 2, ty: H - 80, fireCd: 0, inv: 0, rapid: 0, spread: 0, shield: 0, frame: 2 }
    bullets.current = []; ebullets.current = []; enemies.current = []; aces.current = []; rocks.current = []
    powers.current = []; booms.current = []; boss.current = null
    score.current = 0; lives.current = 3; stage.current = 0; aceTimer.current = 9; pending.current = 1.2; flash.current = 0
    if (!stars.current.length) stars.current = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 1.4 }))
    setHud({ score: 0, lives: 3, wave: 0, bossHp: 0, bossMax: 0, bossName: '' })
  }, [])

  const endGame = useCallback((win: boolean) => {
    if (phaseRef.current === 'over') return
    phaseRef.current = 'over'; setPhase('over')
    // Tijdbonus bij uitspelen: hoe sneller je Reuze-Rick verslaat, hoe meer punten
    const secs = Math.max(0, Math.round((performanceNow() - runStart.current) / 1000))
    const timeBonus = win ? Math.max(0, Math.round(5000 - secs * 15)) : 0
    if (timeBonus > 0) score.current += timeBonus
    const final = score.current
    const prevBest = board.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest, win, timeBonus, secs })
    setBoard((prev) => prev.map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e)).sort((a, b) => b.best - a.best))
    void submitPadelScore('space', final)
  }, [board, currentUserId])

  const hitPlayer = useCallback(() => {
    const p = player.current
    if (p.inv > 0) return
    if (p.shield > 0) { p.shield = 0; p.inv = 1.0; flash.current = 0.25; flashCol.current = '#2D6BE5'; return }
    lives.current -= 1
    addBoom(p.x, p.y, 1.2)
    flash.current = 0.35; flashCol.current = '#E63946'
    setHud((h) => ({ ...h, lives: lives.current }))
    if (lives.current <= 0) { endGame(false); return }
    p.inv = 1.4; p.rapid = 0; p.spread = 0
  }, [endGame])

  const rollPower = (): PowerKind => { const r = Math.random(); return r < 0.05 ? 'life' : r < 0.2 ? 'bomb' : r < 0.45 ? 'shield' : r < 0.72 ? 'spread' : 'rapid' }
  const dropPower = (x: number, y: number) => { if (Math.random() > 0.20) return; powers.current.push({ x, y, vy: 90, kind: rollPower(), t: 0 }) }
  const dropPowerForce = (x: number, y: number) => powers.current.push({ x, y, vy: 90, kind: rollPower(), t: 0 })

  const spawnAce = () => {
    const face = ACE_FACES[Math.floor(Math.random() * ACE_FACES.length)]
    aces.current.push({ x: 40 + Math.random() * (W - 80), y: -40, ty: 120 + Math.random() * 50, vx: (Math.random() < 0.5 ? -1 : 1) * 95, t: 0, hp: 7, max: 7, face, fireCd: 1.2 })
  }

  // ── Hoofd-loop ────────────────────────────────────────────────────────────────
  const loop = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - last.current) / 1000); last.current = t
    const cv = canvasRef.current; const ctx = cv?.getContext('2d')
    if (!ctx) { raf.current = requestAnimationFrame(loop); return }
    const playing = phaseRef.current === 'playing'

    // ── achtergrond ──
    bgY.current = (bgY.current + dt * 40) % H
    const bg = imgs.current[STILL.bg]
    ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, W, H)
    if (bg) {
      const tw = W, th = (bg.height / bg.width) * W
      for (let y = (bgY.current % th) - th; y < H; y += th) ctx.drawImage(bg, 0, y, tw, th)
    }
    // sterren-parallax
    ctx.fillStyle = '#cdd6ff'
    for (const s of stars.current) {
      if (playing) { s.y += dt * 30 * s.z; if (s.y > H) { s.y = 0; s.x = Math.random() * W } }
      ctx.globalAlpha = 0.3 + s.z * 0.35; ctx.fillRect(s.x, s.y, s.z < 0.8 ? 1 : 2, s.z < 0.8 ? 1 : 2)
    }
    ctx.globalAlpha = 1
    // drijvende planeet
    const planet = imgs.current[STILL.planet]
    if (planet) {
      planetY.current += dt * 14
      if (planetY.current > H + 80) planetY.current = -160
      ctx.globalAlpha = 0.7; ctx.drawImage(planet, W - 96, planetY.current, 120, 120); ctx.globalAlpha = 1
    }

    if (playing) step(dt)

    // ── tekenen ──
    drawWorld(ctx)

    // schermflits
    if (flash.current > 0) {
      flash.current -= dt
      ctx.globalAlpha = Math.max(0, flash.current * 1.4); ctx.fillStyle = flashCol.current; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1
    }
    raf.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Simulatie-stap ───────────────────────────────────────────────────────────
  const step = (dt: number) => {
    const p = player.current
    // speler volgt vinger/muis (lerp)
    p.x += (p.tx - p.x) * Math.min(1, dt * 12)
    p.y += (p.ty - p.y) * Math.min(1, dt * 12)
    p.x = Math.max(20, Math.min(W - 20, p.x)); p.y = Math.max(H * 0.4, Math.min(H - 30, p.y))
    p.frame = p.tx > p.x + 6 ? 4 : p.tx > p.x + 2 ? 3 : p.tx < p.x - 6 ? 0 : p.tx < p.x - 2 ? 1 : 2
    if (p.inv > 0) p.inv -= dt
    if (p.rapid > 0) p.rapid -= dt
    if (p.spread > 0) p.spread -= dt
    if (p.shield > 0) p.shield -= dt

    // auto-vuren
    p.fireCd -= dt
    if (p.fireCd <= 0) {
      p.fireCd = p.rapid > 0 ? 0.11 : 0.2
      const mk = (vx: number) => bullets.current.push({ x: p.x, y: p.y - 22, vx, vy: -560, frame: 0, ft: 0, r: 6 })
      mk(0)
      if (p.spread > 0) { mk(-170); mk(170) }
    }

    // player-bullets
    for (const b of bullets.current) { b.x += b.vx * dt; b.y += b.vy * dt; b.ft += dt; if (b.ft > 0.05) { b.ft = 0; b.frame++ } }
    bullets.current = bullets.current.filter((b) => b.y > -20 && b.x > -10 && b.x < W + 10)

    // enemy-bullets
    for (const b of ebullets.current) { b.x += b.vx * dt; b.y += b.vy * dt; b.ft += dt; if (b.ft > 0.07) { b.ft = 0; b.frame++ } }
    ebullets.current = ebullets.current.filter((b) => b.y < H + 20 && b.y > -20 && b.x > -20 && b.x < W + 20)

    // vijanden
    const wv = curWave.current
    for (const e of enemies.current) {
      e.t += dt; e.ft += dt; if (e.ft > 0.12) { e.ft = 0; e.frame = (e.frame + 1) % 2 }
      if (e.y < e.ty) e.y += 60 * dt * wv.speed
      else { e.x = e.sx + Math.sin(e.t * 1.2 + e.phase) * e.amp; e.y = e.ty + Math.sin(e.t * 0.8) * 6 }
      e.fireCd -= dt
      if (e.fireCd <= 0 && e.y > 0) {
        e.fireCd = (1.4 + Math.random() * 2.2) / wv.fire
        const ang = Math.atan2(p.y - e.y, p.x - e.x)
        const sp = 150
        ebullets.current.push({ x: e.x, y: e.y + 16, vx: Math.cos(ang) * sp, vy: Math.max(80, Math.sin(ang) * sp), frame: 0, ft: 0, r: 7 })
      }
    }

    // aces (onze eigen mannen): verschijnen alleen tijdens golven, niet tijdens een boss
    if (!boss.current && aces.current.length === 0) {
      aceTimer.current -= dt
      if (aceTimer.current <= 0) { spawnAce(); aceTimer.current = 13 + Math.random() * 6 }
    }
    for (const a of aces.current) {
      a.t += dt
      if (a.y < a.ty) a.y += 70 * dt
      else { a.x += a.vx * dt; if (a.x < 44 || a.x > W - 44) a.vx *= -1; a.x = Math.max(44, Math.min(W - 44, a.x)); a.y = a.ty + Math.sin(a.t * 1.5) * 14 }
      a.fireCd -= dt
      if (a.fireCd <= 0 && a.y > 0) {
        a.fireCd = 1.5
        const ang = Math.atan2(p.y - a.y, p.x - a.x)
        for (const off of [-0.28, 0, 0.28]) ebullets.current.push({ x: a.x, y: a.y + 14, vx: Math.cos(ang + off) * 185, vy: Math.max(70, Math.sin(ang + off) * 185), frame: 0, ft: 0, r: 7 })
      }
    }

    // asteroïden
    for (const r of rocks.current) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt }
    rocks.current = rocks.current.filter((r) => r.y < H + 60)

    // power-ups
    for (const pw of powers.current) { pw.y += pw.vy * dt; pw.t += dt }
    powers.current = powers.current.filter((pw) => pw.y < H + 30)

    // booms
    for (const bm of booms.current) { bm.ft += dt; if (bm.ft > 0.05) { bm.ft = 0; bm.frame++ } }
    booms.current = booms.current.filter((bm) => bm.frame < SHEET.boom.frames)

    // ── botsingen: player-bullets × vijanden ──
    for (const b of bullets.current) {
      for (const e of enemies.current) {
        if (e.hp <= 0) continue
        const rr = ENEMY_DEF[e.kind].r
        if (Math.abs(b.x - e.x) < rr && Math.abs(b.y - e.y) < rr) {
          e.hp -= 1; b.y = -999
          if (e.hp <= 0) { score.current += ENEMY_DEF[e.kind].pts; addBoom(e.x, e.y, ENEMY_DEF[e.kind].scale + 0.4); dropPower(e.x, e.y) }
          break
        }
      }
      // bullets × rocks
      for (const r of rocks.current) {
        if (r.hp <= 0) continue
        const rr = 9 * r.size
        if (Math.abs(b.x - r.x) < rr && Math.abs(b.y - r.y) < rr) { r.hp -= 1; b.y = -999; if (r.hp <= 0) { score.current += 5; addBoom(r.x, r.y, r.size * 0.6) } break }
      }
      // bullets × aces (onze mannen)
      for (const a of aces.current) {
        if (a.hp <= 0) continue
        if (Math.abs(b.x - a.x) < 21 && Math.abs(b.y - a.y) < 21) {
          a.hp -= 1; b.y = -999; if (Math.random() < 0.4) addBoom(b.x, b.y, 0.4)
          if (a.hp <= 0) { score.current += 70; addBoom(a.x, a.y, 1.1); dropPowerForce(a.x, a.y); flash.current = 0.2; flashCol.current = '#F4B92E' }
          break
        }
      }
      // bullets × boss
      const bs = boss.current
      if (bs && !bs.entering && b.y > 0) {
        const hw = bs.kind === 'mech' ? 82 : 92, hh = 56
        if (Math.abs(b.x - bs.x) < hw && Math.abs(b.y - bs.y) < hh) {
          bs.hp -= 1; b.y = -999
          if (Math.random() < 0.5) addBoom(b.x, b.y, 0.5)
          setHud((h) => ({ ...h, bossHp: Math.max(0, bs.hp) }))
          if (bs.hp <= 0) {
            const big = bs.kind === 'rick'
            for (let i = 0; i < (big ? 16 : 11); i++) setTimeout(() => addBoom(bs.x + (Math.random() - 0.5) * (big ? 180 : 150), bs.y + (Math.random() - 0.5) * 120, big ? 1.5 : 1.1), i * 65)
            score.current += big ? 1000 : 500
            flash.current = 0.55; flashCol.current = big ? '#F4B92E' : '#E8862E'
            boss.current = null
            setHud((h) => ({ ...h, bossHp: 0, bossMax: 0 }))
          }
        }
      }
    }
    enemies.current = enemies.current.filter((e) => e.hp > 0)
    aces.current = aces.current.filter((a) => a.hp > 0)
    rocks.current = rocks.current.filter((r) => r.hp > 0)

    // ── botsingen tegen de speler ──
    if (p.inv <= 0) {
      for (const b of ebullets.current) { if (Math.abs(b.x - p.x) < 13 && Math.abs(b.y - p.y) < 13) { b.y = 9999; hitPlayer(); break } }
    }
    for (const e of enemies.current) { if (Math.abs(e.x - p.x) < 22 && Math.abs(e.y - p.y) < 22) { e.hp = 0; addBoom(e.x, e.y, 0.6); hitPlayer(); break } }
    for (const a of aces.current) { if (Math.abs(a.x - p.x) < 24 && Math.abs(a.y - p.y) < 24) { a.hp = 0; addBoom(a.x, a.y, 0.8); dropPowerForce(a.x, a.y); hitPlayer(); break } }
    for (const r of rocks.current) { const rr = 9 * r.size + 12; if (Math.abs(r.x - p.x) < rr && Math.abs(r.y - p.y) < rr) { r.hp = 0; addBoom(r.x, r.y, r.size * 0.6); hitPlayer(); break } }

    // ── power-up oppakken ──
    for (const pw of powers.current) {
      if (Math.abs(pw.x - p.x) < 20 && Math.abs(pw.y - p.y) < 20) {
        pw.y = 9999; score.current += 20
        if (pw.kind === 'rapid') p.rapid = 8
        else if (pw.kind === 'spread') p.spread = 8
        else if (pw.kind === 'shield') p.shield = 6
        else if (pw.kind === 'life') { lives.current = Math.min(5, lives.current + 1); setHud((h) => ({ ...h, lives: lives.current })) }
        else if (pw.kind === 'bomb') {
          for (const e of enemies.current) { score.current += ENEMY_DEF[e.kind].pts; addBoom(e.x, e.y, 0.6); e.hp = 0 }
          for (const a of aces.current) { score.current += 40; addBoom(a.x, a.y, 0.8); a.hp = 0 }
          ebullets.current = []; flash.current = 0.4; flashCol.current = '#ffffff'
        }
      }
    }
    powers.current = powers.current.filter((pw) => pw.y < H + 30)

    // ── boss-gedrag (per type) ──
    const bs = boss.current
    if (bs) {
      bs.t += dt
      const homeY = bs.kind === 'mech' ? 100 : 110
      if (bs.entering) { bs.y += 55 * dt; if (bs.y >= homeY) { bs.y = homeY; bs.entering = false } }
      else {
        bs.x += bs.vx * dt
        if (bs.x < 90 || bs.x > W - 90) bs.vx *= -1
        bs.x = Math.max(90, Math.min(W - 90, bs.x))
        bs.fireCd -= dt
        const rage = bs.hp < bs.max * 0.45
        if (bs.fireCd <= 0) {
          if (bs.kind === 'mech') {
            // twin-kanonnen: twee gerichte schoten + kleine waaier
            bs.fireCd = rage ? 0.7 : 1.05
            const aim = Math.atan2(p.y - bs.y, p.x - bs.x)
            for (const off of [-30, 30]) ebullets.current.push({ x: bs.x + off, y: bs.y + 30, vx: Math.cos(aim) * 210, vy: Math.max(80, Math.sin(aim) * 210), frame: 0, ft: 0, r: 7 })
            const n = rage ? 5 : 3
            for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.3; ebullets.current.push({ x: bs.x, y: bs.y + 30, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, frame: 0, ft: 0, r: 7 }) }
          } else {
            bs.fireCd = rage ? 0.85 : 1.25
            const n = rage ? 9 : 6
            for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.26; const sp = rage ? 200 : 165; ebullets.current.push({ x: bs.x, y: bs.y + 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, frame: 0, ft: 0, r: 8 }) }
            if (rage) { const ang = Math.atan2(p.y - bs.y, p.x - bs.x); ebullets.current.push({ x: bs.x, y: bs.y + 40, vx: Math.cos(ang) * 240, vy: Math.sin(ang) * 240, frame: 0, ft: 0, r: 8 }) }
          }
        }
      }
    }

    // ── golf-/boss-progressie (volgt STAGES) ──
    if (!boss.current && enemies.current.length === 0 && aces.current.length === 0 && rocks.current.filter((r) => r.hp > 0).length === 0) {
      pending.current -= dt
      if (pending.current <= 0) {
        const st = STAGES[stage.current]
        if (!st) { endGame(true); return }
        if (st.t === 'wave') { spawnWave(st.i); setHud((h) => ({ ...h, wave: st.i + 1 })) }
        else { spawnBoss(st.kind); setHud((h) => ({ ...h, wave: WAVES.length + 1 })) }
        stage.current += 1
        pending.current = 99
      }
    } else {
      pending.current = 1.1   // korte pauze tussen stages zodra leeg
    }

    setHud((h) => (h.score === score.current ? h : { ...h, score: score.current }))
  }

  // ── Wereld tekenen ───────────────────────────────────────────────────────────
  const drawWorld = (ctx: CanvasRenderingContext2D) => {
    const p = player.current

    // asteroïden
    for (const r of rocks.current) {
      if (!r.img) continue
      ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot)
      const w = r.img.width * r.size, h = r.img.height * r.size
      ctx.drawImage(r.img, -w / 2, -h / 2, w, h); ctx.restore()
    }

    // power-ups (gem-look)
    for (const pw of powers.current) {
      const d = POWER[pw.kind]; const s = 9 + Math.sin(pw.t * 6) * 1.2
      ctx.save(); ctx.translate(pw.x, pw.y); ctx.rotate(Math.PI / 4)
      ctx.shadowColor = d.color; ctx.shadowBlur = 10
      ctx.fillStyle = d.color; ctx.fillRect(-s, -s, s * 2, s * 2)
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-s, -s, s * 0.7, s * 0.7)
      ctx.restore()
      ctx.fillStyle = '#0b0e14'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(d.label, pw.x, pw.y + 0.5)
    }

    // enemy-bullets (pulse, naar beneden)
    for (const b of ebullets.current) drawSheet(ctx, 'pulse', b.frame, b.x, b.y, 0.6, false, Math.atan2(b.vy, b.vx) - Math.PI / 2)

    // vijanden (gespiegeld → wijzen naar beneden)
    for (const e of enemies.current) drawSheet(ctx, e.kind, e.frame, e.x, e.y, ENEMY_DEF[e.kind].scale, true)

    // aces (onze mannen in een vliegende schotel)
    for (const a of aces.current) {
      const lowFlick = a.hp <= 2 && Math.floor(a.t * 14) % 2 === 0
      ctx.save(); ctx.translate(a.x, a.y)
      // schotel-romp
      ctx.fillStyle = '#1a1f2e'; ctx.beginPath(); ctx.ellipse(0, 8, 28, 11, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#2d3550'; ctx.beginPath(); ctx.ellipse(0, 6, 24, 8, 0, 0, Math.PI * 2); ctx.fill()
      // motor-gloed
      ctx.fillStyle = 'rgba(244,185,46,0.5)'; for (const sx of [-16, 0, 16]) { ctx.beginPath(); ctx.arc(sx, 14, 2.5, 0, Math.PI * 2); ctx.fill() }
      // gepixeld gezicht in een koepel
      const f = facePix.current[a.face]
      ctx.fillStyle = 'rgba(120,200,255,0.18)'; ctx.beginPath(); ctx.arc(0, -6, 21, Math.PI, 0); ctx.fill()
      if (f && !lowFlick) ctx.drawImage(f, -17, -24, 34, 34)
      ctx.strokeStyle = '#F4B92E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -6, 19, Math.PI, 0); ctx.stroke()
      ctx.restore()
    }

    // boss
    if (boss.current) drawBoss(ctx, boss.current)

    // player-bullets (bolt)
    for (const b of bullets.current) drawSheet(ctx, 'bolt', b.frame, b.x, b.y, 0.7, false, Math.atan2(b.vy, b.vx) + Math.PI / 2)

    // explosies
    for (const bm of booms.current) drawSheet(ctx, 'boom', bm.frame, bm.x, bm.y, bm.scale)

    // speler (knippert bij invuln)
    if (phaseRef.current !== 'over' && !(p.inv > 0 && Math.floor(p.inv * 16) % 2 === 0)) {
      if (p.shield > 0) {
        ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(performanceNow() / 120) * 0.12
        ctx.strokeStyle = '#2D6BE5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
      }
      drawSheet(ctx, 'player', p.frame, p.x, p.y, 0.85)
    }
  }

  const drawBoss = (ctx: CanvasRenderingContext2D, bs: Boss) => {
    // Mid-boss: de echte pixel-mech uit de bundel
    if (bs.kind === 'mech') {
      const rage = bs.hp < bs.max * 0.45
      drawSheet(ctx, 'midboss', Math.floor(bs.t * 8) % SHEET.midboss.frames, bs.x, bs.y, 0.92)
      if (rage) { ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = 'rgba(230,57,70,0.3)'; ctx.beginPath(); ctx.ellipse(bs.x, bs.y, 92, 64, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
      return
    }
    const bw = 190, bh = 120
    ctx.save(); ctx.translate(bs.x, bs.y)
    // metalen romp
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
    g.addColorStop(0, '#5a6072'); g.addColorStop(0.5, '#2c3140'); g.addColorStop(1, '#15181f')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 18); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke()
    // kanon-pods
    ctx.fillStyle = '#3a4050'
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect(sx * (bw / 2 - 14) - 14, bh / 2 - 8, 28, 22, 5); ctx.fill() }
    // klinknagels
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 26, -bh / 2 + 8, 2, 0, Math.PI * 2); ctx.fill() }
    // gepixeleerde Rick als "gezicht" in een venster
    const rp = rickPix.current
    const fs = 78
    ctx.fillStyle = '#0b0e14'; ctx.beginPath(); ctx.roundRect(-fs / 2 - 4, -fs / 2 - 2, fs + 8, fs + 8, 8); ctx.fill()
    if (rp) ctx.drawImage(rp, -fs / 2, -fs / 2, fs, fs)
    // boze rode gloed-ogen-overlay
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = `rgba(230,57,70,${0.25 + (bs.hp < bs.max * 0.45 ? 0.3 : 0)})`
    ctx.beginPath(); ctx.roundRect(-fs / 2, -fs / 2, fs, fs, 6); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    // kern-licht onderaan
    ctx.fillStyle = bs.hp < bs.max * 0.45 ? '#E63946' : '#F4B92E'
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14
    ctx.beginPath(); ctx.arc(0, bh / 2 - 6, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
    ctx.restore()
  }

  const performanceNow = () => (typeof performance !== 'undefined' ? performance.now() : 0)

  // ── Start / input ──────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!ready) return
    reset(); setResult(null)
    runStart.current = performanceNow()
    phaseRef.current = 'playing'; setPhase('playing')
  }, [ready, reset])

  useEffect(() => {
    setupCanvas()
    last.current = performanceNow()
    raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current) }
  }, [setupCanvas, loop])

  const onPointer = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'playing') return
    const cv = canvasRef.current; if (!cv) return
    const rect = cv.getBoundingClientRect()
    player.current.tx = ((e.clientX - rect.left) / rect.width) * W
    player.current.ty = ((e.clientY - rect.top) / rect.height) * H
  }

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <TeamsPopup />
      <Link
        href="/padelclub/spel" aria-label="Sluiten"
        onClick={(e) => { e.preventDefault(); close() }}
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-md mx-auto px-4 py-8 sm:py-12 space-y-5">
        <header className="text-center animate-fade-up">
          <Link href="/padelclub/spel" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.2em] uppercase mb-2 inline-block">← Spellen</Link>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Space Strikers</h1>
        </header>

        {/* HUD */}
        {phase === 'playing' && (
          <div className="flex items-center justify-between bg-wk-surface border border-white/10 rounded-xl px-4 py-2">
            <div><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Score</p><p className="font-score text-2xl leading-none text-wk-gold">{hud.score}</p></div>
            <div className="text-center"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">{hud.wave > WAVES.length ? 'BOSS' : `Golf ${hud.wave}/${WAVES.length}`}</p><p className="font-score text-lg leading-none text-wk-text">{'★'.repeat(Math.max(0, hud.lives))}</p></div>
            <div className="text-right"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Levens</p><p className="font-score text-2xl leading-none text-wk-text">{hud.lives}</p></div>
          </div>
        )}

        <div className="relative mx-auto w-full max-w-[380px] select-none touch-none" onPointerMove={onPointer} onPointerDown={onPointer}>
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }} />

          {/* boss-HP-balk */}
          {phase === 'playing' && hud.bossMax > 0 && (
            <div className="absolute top-2 left-3 right-3 z-10">
              <p className="font-mono text-[9px] text-wk-red tracking-[0.2em] uppercase text-center mb-1 drop-shadow">⚠ {hud.bossName}</p>
              <div className="h-2 rounded-full bg-black/60 border border-wk-red/40 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-wk-red to-wk-gold transition-[width] duration-150" style={{ width: `${(hud.bossHp / hud.bossMax) * 100}%` }} />
              </div>
            </div>
          )}

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-wk-bg/55 backdrop-blur-[1px] rounded-2xl">
              <p className="text-5xl">🚀</p>
              <p className="text-sm text-wk-soft leading-relaxed">
                Beweeg je <b className="text-wk-gold">vinger of muis</b> — je schip volgt en vuurt <b>automatisch</b>. Sloop de golven, pak <b className="text-wk-green">power-ups</b> (💎) en knal de <b className="text-wk-gold">ace-schotels</b> van de mannen (zekere power-up!) uit de lucht. Eerst de <b>Mecha-Tank</b>, dan eindbaas <b className="text-wk-red">Reuze-Rick</b>.
              </p>
              <button onClick={(e) => { e.stopPropagation(); start() }} disabled={!ready} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50">
                {ready ? 'Start' : 'Laden…'}
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/65 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: result.win ? 'var(--color-wk-green)' : 'var(--color-wk-red)' }}>{result.win ? '🏆 Reuze-Rick verslagen!' : 'Game over'}</p>
              <p className="font-score text-5xl text-wk-gold leading-none">{result.score}</p>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">punten</p>
              {result.win && (result.timeBonus ?? 0) > 0 && (
                <p className="font-mono text-[10px] text-wk-green tracking-[0.12em] uppercase">⚡ {Math.floor((result.secs ?? 0) / 60)}:{String((result.secs ?? 0) % 60).padStart(2, '0')} · tijdbonus +{result.timeBonus}</p>
              )}
              {result.record && <p className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase">Nieuw record!</p>}
              <button onClick={(e) => { e.stopPropagation(); start() }} className="mt-1 font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Opnieuw
              </button>
            </div>
          )}
        </div>

        <GameLeaderboard entries={board} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
