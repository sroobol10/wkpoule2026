'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'
import TeamsPopup from '../teams-popup'

const W = 560, H = 320
const GROUND = 272          // voetlijn (wereld)
const LEN = 4200            // levellengte
const G = 1900, MOVE = 205, JUMP_V = 670

const RUN = Array.from({ length: 10 }, (_, i) => `/spel/gun/run${i}.png`)
const IDLE = Array.from({ length: 4 }, (_, i) => `/spel/gun/idle${i}.png`)
const WALK = Array.from({ length: 6 }, (_, i) => `/spel/gun/walk${i}.png`)
const FLY = Array.from({ length: 8 }, (_, i) => `/spel/gun/fly${i}.png`)
const TANK = Array.from({ length: 4 }, (_, i) => `/spel/gun/tank${i}.png`)
const JUMP = '/spel/gun/jump.png', BULLET = '/spel/gun/bullet.png', BG = '/spel/gun/bg.png'
// Onze mannen besturen de bazen (gepixeld erop getekend)
const BOSS_FACE: Record<BossKind, string> = { mech: '/lukaku.png', saucer: '/bus.png', tank: '/rick.png' }
// Onze overige mannen duiken zeldzaam op als vliegende "ace"-vijand
const ACE_FACES = ['/ho.png', '/kim.png', '/vince.png', '/dejuul.png', '/trein.png', '/ashi.png', '/pimp.png']
// Sheet-bosses/vijanden (horizontale strips) → via drawSheetFrame gesliced
type Sheet = { src: string; frames: number; fw: number; fh: number }
const MECH: Sheet    = { src: '/spel/gun/mech.png',    frames: 10, fw: 96,  fh: 80 }
const SAUCER: Sheet  = { src: '/spel/gun/saucer.png',  frames: 4,  fw: 106, fh: 77 }
const BIPEDAL: Sheet = { src: '/spel/gun/bipedal.png', frames: 7,  fw: 80,  fh: 64 }
const BOOM = { src: '/spel/space/explosion.png', frames: 8, fw: 48, fh: 48 }
const ALL = [...RUN, ...IDLE, ...WALK, ...FLY, ...TANK, JUMP, BULLET, BG, ...Object.values(BOSS_FACE), ...ACE_FACES, MECH.src, SAUCER.src, BIPEDAL.src, BOOM.src]

const PLATFORMS: { x: number; y: number; w: number }[] = [
  { x: 520, y: 212, w: 120 }, { x: 800, y: 168, w: 110 }, { x: 1150, y: 210, w: 130 },
  { x: 1650, y: 188, w: 120 }, { x: 2050, y: 150, w: 120 }, { x: 2480, y: 200, w: 140 },
  { x: 2950, y: 172, w: 120 }, { x: 3400, y: 205, w: 130 },
]

type Img = HTMLImageElement
type Bullet = { x: number; y: number; vx: number; vy: number; grav: boolean }
type Enemy = { x: number; y: number; vy: number; type: 'walk' | 'fly' | 'tough' | 'ace'; hp: number; frame: number; ft: number; grounded: boolean; fireCd: number; bob: number; face?: string }
type Boom = { x: number; y: number; frame: number; ft: number; scale: number }
type BossKind = 'mech' | 'saucer' | 'tank'
type Boss = { kind: BossKind; x: number; y: number; hp: number; max: number; fireCd: number; frame: number; ft: number; t: number; vx: number; entering: boolean }
type Pickup = { x: number; y: number }

// Camera-lock boss-arena's: zodra de speler een gate bereikt, stopt het scrollen
// en verschijnt de boss. Verslagen → door naar de volgende. Laatste = de Alien-Tank.
const BOSS_GATES: { x: number; kind: BossKind; hp: number; name: string }[] = [
  { x: 1150, kind: 'mech',   hp: 24, name: 'Mecha-Unit' },
  { x: 2450, kind: 'saucer', hp: 48, name: 'Alien-Schotel' },
  { x: 4050, kind: 'tank',   hp: 85, name: 'Alien-Tank' },
]

export default function GunClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [hud, setHud] = useState({ score: 0, hp: 3, bossHp: 0, bossMax: 0, progress: 0, bossName: '' })
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean; win: boolean } | null>(null)
  const [ready, setReady] = useState(false)

  const phaseRef = useRef(phase); phaseRef.current = phase
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const imgs = useRef<Record<string, Img>>({})

  const player = useRef({ x: 60, y: GROUND, vy: 0, face: 1, grounded: true, jumps: 0, frame: 0, ft: 0, fireCd: 0, hp: 3, inv: 0 })
  const inL = useRef(false); const inR = useRef(false)
  const bullets = useRef<Bullet[]>([])
  const ebullets = useRef<Bullet[]>([])
  const enemies = useRef<Enemy[]>([])
  const booms = useRef<Boom[]>([])
  const boss = useRef<Boss | null>(null)
  const pickups = useRef<Pickup[]>([])
  const camX = useRef(0)
  const camLock = useRef<number | null>(null)   // bevroren camX tijdens een boss-arena
  const nextGate = useRef(0)
  const score = useRef(0)
  const spawnCd = useRef(1.5)
  const facePix = useRef<Record<string, HTMLCanvasElement>>({})   // gepixelde bestuurders per baas

  useEffect(() => {
    let alive = true; let done = 0
    ALL.forEach((src) => {
      const im = new window.Image()
      const fin = () => { done++; if (done === ALL.length && alive) setReady(true) }
      im.onload = () => {
        imgs.current[src] = im
        if (Object.values(BOSS_FACE).includes(src) || ACE_FACES.includes(src)) { const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.getContext('2d')?.drawImage(im, 0, 0, 32, 32); facePix.current[src] = c }
        fin()
      }
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
  const addBoom = (x: number, y: number, scale = 1) => booms.current.push({ x, y, frame: 0, ft: 0, scale })
  const drawImg = (ctx: CanvasRenderingContext2D, src: string, cx: number, feetY: number, dh: number, flip = false) => {
    const im = imgs.current[src]; if (!im) return
    const dw = (im.width / im.height) * dh
    ctx.save(); ctx.translate(cx, feetY); ctx.scale(flip ? -1 : 1, 1); ctx.drawImage(im, -dw / 2, -dh, dw, dh); ctx.restore()
  }
  // Eén frame uit een horizontale sheet (anker = onder-midden)
  const drawSheetFrame = (ctx: CanvasRenderingContext2D, sh: Sheet, frame: number, cx: number, feetY: number, dh: number, flip = false) => {
    const im = imgs.current[sh.src]; if (!im) return
    const f = ((frame % sh.frames) + sh.frames) % sh.frames
    const dw = (sh.fw / sh.fh) * dh
    ctx.save(); ctx.translate(cx, feetY); ctx.scale(flip ? -1 : 1, 1)
    ctx.drawImage(im, f * sh.fw, 0, sh.fw, sh.fh, -dw / 2, -dh, dw, dh)
    ctx.restore()
  }

  const reset = useCallback(() => {
    player.current = { x: 60, y: GROUND, vy: 0, face: 1, grounded: true, jumps: 0, frame: 0, ft: 0, fireCd: 0, hp: 3, inv: 0 }
    bullets.current = []; ebullets.current = []; enemies.current = []; booms.current = []; pickups.current = []; boss.current = null
    camX.current = 0; camLock.current = null; nextGate.current = 0; score.current = 0; spawnCd.current = 1.4
    inL.current = false; inR.current = false
    setHud({ score: 0, hp: 3, bossHp: 0, bossMax: 0, progress: 0, bossName: '' })
  }, [])

  const endGame = useCallback((win: boolean) => {
    if (phaseRef.current === 'over') return
    phaseRef.current = 'over'; setPhase('over')
    const final = Math.round(score.current)
    const prevBest = board.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest, win })
    setBoard((prev) => prev.map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e)).sort((a, b) => b.best - a.best))
    void submitPadelScore('gun', final)
  }, [board, currentUserId])

  const startOrJump = useCallback(() => {
    if (phaseRef.current === 'idle') { reset(); setResult(null); phaseRef.current = 'playing'; setPhase('playing'); return }
  }, [reset])
  const doJump = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    const p = player.current; if (p.jumps < 2) { p.vy = -JUMP_V; p.grounded = false; p.jumps++ }   // dubbele sprong
  }, [])

  const hitPlayer = useCallback(() => {
    const p = player.current; if (p.inv > 0) return
    p.hp -= 1; p.inv = 1.4; addBoom(p.x, p.y - 22, 0.9)
    setHud((h) => ({ ...h, hp: p.hp }))
    if (p.hp <= 0) endGame(false)
  }, [endGame])

  // Boss verslagen → explosies, punten, camera vrij, volgende gate (laatste = win)
  const defeatBoss = useCallback((bs: Boss) => {
    const big = bs.kind === 'tank'
    const cy = bs.kind === 'saucer' ? bs.y : bs.y - 36
    for (let i = 0; i < (big ? 18 : 13); i++) {
      setTimeout(() => addBoom(bs.x + (Math.random() - 0.5) * (big ? 130 : 100), cy + (Math.random() - 0.5) * 70, big ? 1.4 : 1.1), i * 60)
    }
    score.current += big ? 1000 : 500
    boss.current = null
    camLock.current = null
    nextGate.current += 1
    pickups.current.push({ x: bs.x, y: GROUND - 24 })   // hartje als beloning
    setHud((h) => ({ ...h, bossHp: 0, bossMax: 0 }))
    if (big) setTimeout(() => endGame(true), 1100)
  }, [endGame])

  // ── loop ──
  const loop = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - last.current) / 1000); last.current = t
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) { raf.current = requestAnimationFrame(loop); return }
    const playing = phaseRef.current === 'playing'
    if (playing) step(dt)

    // camera — bevroren tijdens een boss-arena, anders volgt 'ie de speler
    camX.current = camLock.current != null
      ? camLock.current
      : Math.max(0, Math.min(LEN - W, player.current.x - 180))
    const cx = camX.current

    // ── achtergrond (parallax) ──
    const bg = imgs.current[BG]
    ctx.fillStyle = '#1f6b4a'; ctx.fillRect(0, 0, W, H)
    if (bg) { const bw = (bg.width / bg.height) * H; const off = (cx * 0.4) % bw; for (let x = -off - bw; x < W + bw; x += bw) ctx.drawImage(bg, x, 0, bw, H) }

    ctx.save(); ctx.translate(-cx, 0)
    // grond
    ctx.fillStyle = '#2a2018'; ctx.fillRect(cx, GROUND, W, H - GROUND)
    ctx.fillStyle = '#6b8f3a'; ctx.fillRect(cx, GROUND, W, 5)
    // platforms
    for (const pl of PLATFORMS) {
      if (pl.x + pl.w < cx || pl.x > cx + W) continue
      ctx.fillStyle = '#2a2018'; ctx.fillRect(pl.x, pl.y, pl.w, 12)
      ctx.fillStyle = '#6b8f3a'; ctx.fillRect(pl.x, pl.y, pl.w, 4)
    }
    drawWorld(ctx)
    ctx.restore()

    raf.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── landing-helper ──
  const landY = (x: number, feet: number, prevFeet: number) => {
    let g = GROUND
    for (const pl of PLATFORMS) {
      if (x > pl.x && x < pl.x + pl.w && prevFeet <= pl.y + 2 && feet >= pl.y && pl.y < g) g = pl.y
    }
    return g
  }

  // ── simulatie ──
  const step = (dt: number) => {
    const p = player.current
    const dir = (inR.current ? 1 : 0) - (inL.current ? 1 : 0)
    if (dir !== 0) p.face = dir
    p.x += dir * MOVE * dt
    p.x = Math.max(24, Math.min(LEN - 24, p.x))
    // Tijdens een boss-arena zit je opgesloten in het scherm
    if (camLock.current != null) p.x = Math.max(camLock.current + 24, Math.min(camLock.current + W - 24, p.x))

    const prevFeet = p.y
    p.vy += G * dt; p.y += p.vy * dt
    const gy = landY(p.x, p.y, prevFeet)
    if (p.y >= gy) { p.y = gy; p.vy = 0; p.grounded = true; p.jumps = 0 } else p.grounded = false
    if (p.inv > 0) p.inv -= dt
    if (p.grounded && dir !== 0) { p.ft += dt; if (p.ft > 0.05) { p.ft = 0; p.frame = (p.frame + 1) % RUN.length } }

    // auto-vuren naar voren
    p.fireCd -= dt
    if (p.fireCd <= 0) { p.fireCd = 0.2; bullets.current.push({ x: p.x + p.face * 24, y: p.y - 26, vx: p.face * 720, vy: 0, grav: false }) }
    for (const b of bullets.current) { b.x += b.vx * dt }
    bullets.current = bullets.current.filter((b) => b.x > camX.current - 40 && b.x < camX.current + W + 60)

    // Boss-gate bereikt? → camera vergrendelen + boss laten verschijnen
    if (!boss.current && nextGate.current < BOSS_GATES.length) {
      const gate = BOSS_GATES[nextGate.current]
      if (p.x >= gate.x) {
        camLock.current = Math.max(0, Math.min(LEN - W, p.x - 180))
        const by = gate.kind === 'saucer' ? 116 : GROUND
        boss.current = { kind: gate.kind, x: camLock.current + W + 60, y: by, hp: gate.hp, max: gate.hp, fireCd: 1.6, frame: 0, ft: 0, t: 0, vx: -42, entering: true }
        enemies.current = []
        setHud((h) => ({ ...h, bossHp: gate.hp, bossMax: gate.hp, bossName: gate.name }))
      }
    }
    // Gewone vijand-spawns (alleen buiten een boss-arena)
    if (!boss.current && camLock.current == null) {
      spawnCd.current -= dt
      if (spawnCd.current <= 0 && enemies.current.length < 9) {
        const r = Math.random()
        const sx = camX.current + W + 30
        const noAce = enemies.current.some((e) => e.type === 'ace')   // hooguit één ace tegelijk
        if (!noAce && r < 0.07) enemies.current.push({ x: sx, y: 100 + Math.random() * 60, vy: 0, type: 'ace', hp: 5, frame: 0, ft: 0, grounded: false, fireCd: 1.2, bob: Math.random() * 6, face: ACE_FACES[Math.floor(Math.random() * ACE_FACES.length)] })
        else if (r < 0.38) enemies.current.push({ x: sx, y: 90 + Math.random() * 80, vy: 0, type: 'fly', hp: 2, frame: 0, ft: 0, grounded: false, fireCd: 1.5, bob: Math.random() * 6 })
        else if (r < 0.56) enemies.current.push({ x: sx, y: GROUND, vy: 0, type: 'tough', hp: 4, frame: 0, ft: 0, grounded: true, fireCd: 2, bob: 0 })
        else enemies.current.push({ x: sx, y: GROUND, vy: 0, type: 'walk', hp: 2, frame: 0, ft: 0, grounded: true, fireCd: 0, bob: 0 })
        spawnCd.current = Math.max(0.7, 1.7 - p.x / 3200) + Math.random() * 0.6
      }
    }

    // vijanden updaten
    for (const e of enemies.current) {
      e.ft += dt; if (e.ft > 0.1) { e.ft = 0; e.frame++ }
      if (e.type === 'ace') {
        // vliegende voetballer: zweeft mee, vuurt een gerichte burst van 2
        e.bob += dt; e.x += Math.sign(p.x - e.x) * 36 * dt; e.y += Math.sin(e.bob * 1.8) * 16 * dt
        e.fireCd -= dt
        if (e.fireCd <= 0 && Math.abs(e.x - p.x) < 420) {
          e.fireCd = 1.5
          for (const off of [-0.12, 0.12]) { const a = Math.atan2((p.y - 24) - e.y, p.x - e.x) + off; ebullets.current.push({ x: e.x, y: e.y + 6, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, grav: false }) }
        }
      } else if (e.type === 'fly') {
        e.bob += dt; e.x += Math.sign(p.x - e.x) * 42 * dt; e.y += Math.sin(e.bob * 2) * 18 * dt
        e.fireCd -= dt
        if (e.fireCd <= 0 && Math.abs(e.x - p.x) < 360) { e.fireCd = 1.8; const a = Math.atan2(p.y - 24 - e.y, p.x - e.x); ebullets.current.push({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, grav: false }) }
      } else {
        // walk + tough (zwaarder, trager, schiet af en toe)
        e.x += Math.sign(p.x - e.x) * (e.type === 'tough' ? 40 : 64) * dt; e.y = GROUND
        if (e.type === 'tough') {
          e.fireCd -= dt
          if (e.fireCd <= 0 && Math.abs(e.x - p.x) < 380) { e.fireCd = 2.2; const a = Math.atan2((p.y - 24) - (e.y - 24), p.x - e.x); ebullets.current.push({ x: e.x, y: e.y - 24, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, grav: false }) }
        }
      }
    }
    // boss
    const bs = boss.current
    if (bs) {
      bs.t += dt; bs.ft += dt
      const fps = bs.kind === 'tank' ? 0.16 : 0.12
      if (bs.ft > fps) { bs.ft = 0; bs.frame++ }
      const base = camLock.current ?? 0
      if (bs.entering) {
        bs.x -= 90 * dt
        if (bs.x <= base + W - 110) bs.entering = false
      } else {
        bs.x += bs.vx * dt
        if (bs.x < base + 90 || bs.x > base + W - 70) bs.vx *= -1
        if (bs.kind === 'saucer') bs.y = 116 + Math.sin(bs.t * 1.6) * 26
        bs.fireCd -= dt
        if (bs.fireCd <= 0) {
          const rage = bs.hp < bs.max * 0.5
          if (bs.kind === 'mech') {
            bs.fireCd = rage ? 1.3 : 1.9
            const aim = Math.atan2((p.y - 26) - (bs.y - 44), p.x - bs.x)
            for (const off of rage ? [-0.24, 0, 0.24] : [-0.14, 0.14]) ebullets.current.push({ x: bs.x, y: bs.y - 44, vx: Math.cos(aim + off) * 185, vy: Math.sin(aim + off) * 185, grav: false })
          } else if (bs.kind === 'saucer') {
            bs.fireCd = rage ? 0.7 : 1.05
            for (const dx of [-24, 0, 24]) ebullets.current.push({ x: bs.x + dx, y: bs.y + 20, vx: 0, vy: 150, grav: true })
            if (rage) { const a = Math.atan2((p.y - 24) - bs.y, p.x - bs.x); ebullets.current.push({ x: bs.x, y: bs.y + 16, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, grav: false }) }
          } else {
            bs.fireCd = rage ? 0.95 : 1.4
            for (const off of rage ? [-0.25, 0, 0.25] : [-0.18, 0.18]) {
              const a = Math.atan2((p.y - 30) - (bs.y - 30), p.x - bs.x) + off
              ebullets.current.push({ x: bs.x - 30, y: bs.y - 30, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250 - 60, grav: true })
            }
          }
        }
      }
    }
    // pickups (drijvende harten) verzamelen
    for (const pk of pickups.current) {
      if (Math.abs(pk.x - p.x) < 26 && Math.abs(pk.y - (p.y - 22)) < 40) {
        pk.x = -9999
        if (p.hp < 3) { p.hp += 1; setHud((h) => ({ ...h, hp: p.hp })) }
        addBoom(p.x, p.y - 22, 0.5)
      }
    }
    pickups.current = pickups.current.filter((pk) => pk.x !== -9999)

    // enemy-bullets
    for (const b of ebullets.current) { if (b.grav) b.vy += 520 * dt; b.x += b.vx * dt; b.y += b.vy * dt }
    ebullets.current = ebullets.current.filter((b) => b.y < H + 40 && b.x > camX.current - 60 && b.x < camX.current + W + 80)

    // booms
    for (const bm of booms.current) { bm.ft += dt; if (bm.ft > 0.05) { bm.ft = 0; bm.frame++ } }
    booms.current = booms.current.filter((bm) => bm.frame < BOOM.frames)

    // ── botsingen: bullets × vijanden / tank ──
    for (const b of bullets.current) {
      for (const e of enemies.current) {
        if (e.hp <= 0) continue
        const rw = e.type === 'fly' || e.type === 'ace' ? 26 : 24, rh = e.type === 'fly' ? 22 : e.type === 'tough' ? 40 : e.type === 'ace' ? 26 : 30
        if (Math.abs(b.x - e.x) < rw && Math.abs(b.y - (e.y - rh / 2)) < rh) {
          e.hp -= 1; b.x = -9999
          if (e.hp <= 0) {
            score.current += e.type === 'fly' ? 20 : e.type === 'tough' ? 30 : e.type === 'ace' ? 70 : 15
            addBoom(e.x, e.y - 18, e.type === 'ace' || e.type === 'tough' ? 1 : 0.8)
            if (e.type === 'ace') pickups.current.push({ x: e.x, y: GROUND - 24 })   // ace dropt een hartje
          }
          break
        }
      }
      if (bs && !bs.entering && b.x !== -9999) {
        const hw = bs.kind === 'saucer' ? 56 : bs.kind === 'mech' ? 46 : 60
        const top = bs.kind === 'saucer' ? bs.y - 40 : bs.y - 70
        const bot = bs.kind === 'saucer' ? bs.y + 30 : bs.y
        if (Math.abs(b.x - bs.x) < hw && b.y > top && b.y < bot) {
          bs.hp -= 1; b.x = -9999; if (Math.random() < 0.4) addBoom(b.x, b.y, 0.5)
          setHud((h) => ({ ...h, bossHp: Math.max(0, bs.hp) }))
          if (bs.hp <= 0) defeatBoss(bs)
        }
      }
    }
    enemies.current = enemies.current.filter((e) => e.hp > 0 && e.x > camX.current - 120)

    // ── schade aan de speler ──
    // Compactere speler-hitbox (eerlijker): smal lijf, midden iets boven de voeten
    const PX = 9, PYC = p.y - 22, PYH = 18
    if (p.inv <= 0) {
      for (const e of enemies.current) { const rw = e.type === 'fly' || e.type === 'ace' ? 20 : e.type === 'tough' ? 22 : 16; if (Math.abs(e.x - p.x) < rw && Math.abs((e.y - 18) - PYC) < 28) { hitPlayer(); break } }
      // boss raakt de speler aan (contactschade)
      if (p.inv <= 0 && bs && !bs.entering) { const bw = bs.kind === 'saucer' ? 44 : 40; if (Math.abs(bs.x - p.x) < bw && Math.abs((bs.kind === 'saucer' ? bs.y : bs.y - 30) - PYC) < 42) hitPlayer() }
    }
    if (p.inv <= 0) for (const b of ebullets.current) { if (Math.abs(b.x - p.x) < PX && Math.abs(b.y - PYC) < PYH) { b.x = -9999; hitPlayer(); break } }
    ebullets.current = ebullets.current.filter((b) => b.x !== -9999)

    score.current += dt * 4   // beetje voortgang-score
    setHud((h) => { const s = Math.floor(score.current), pr = Math.min(100, Math.floor((p.x / (LEN - 120)) * 100)); return (h.score === s && h.progress === pr) ? h : { ...h, score: s, progress: pr } })
  }

  // ── tekenen (in wereld-coördinaten) ──
  const drawWorld = (ctx: CanvasRenderingContext2D) => {
    const p = player.current

    // munten? nee — kogels speler
    ctx.fillStyle = '#ffe27a'
    for (const b of bullets.current) { ctx.save(); ctx.shadowColor = '#F4B92E'; ctx.shadowBlur = 6; ctx.fillRect(b.x - 5, b.y - 2, 10, 4); ctx.restore() }

    // enemy-bullets
    ctx.fillStyle = '#9be83a'
    for (const b of ebullets.current) { ctx.save(); ctx.shadowColor = '#9be83a'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore() }

    // pickups (drijvende harten)
    for (const pk of pickups.current) {
      ctx.save(); ctx.translate(pk.x, pk.y + Math.sin(performanceFrame() / 6) * 3)
      ctx.fillStyle = '#E63946'; ctx.shadowColor = '#E63946'; ctx.shadowBlur = 8
      ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('❤', 0, 0); ctx.restore()
    }

    // vijanden
    for (const e of enemies.current) {
      const flip = p.x < e.x
      if (e.type === 'ace') {
        // voetballer in een vliegende schotel
        ctx.save(); ctx.translate(e.x, e.y)
        ctx.fillStyle = '#1a1f2e'; ctx.beginPath(); ctx.ellipse(0, 16, 26, 10, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#2d3550'; ctx.beginPath(); ctx.ellipse(0, 14, 22, 7, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(244,185,46,0.5)'; for (const sx of [-15, 0, 15]) { ctx.beginPath(); ctx.arc(sx, 21, 2.3, 0, Math.PI * 2); ctx.fill() }
        const af = e.face ? facePix.current[e.face] : null
        if (af) ctx.drawImage(af, -16, -22, 32, 32)
        ctx.strokeStyle = '#E63946'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -6, 18, Math.PI, 0); ctx.stroke()
        ctx.restore()
      }
      else if (e.type === 'fly') drawImg(ctx, FLY[e.frame % FLY.length], e.x, e.y + 30, 40, flip)
      else if (e.type === 'tough') drawSheetFrame(ctx, BIPEDAL, e.frame, e.x, e.y, 52, flip)
      else drawImg(ctx, WALK[e.frame % WALK.length], e.x, e.y, 38, flip)
    }

    // boss (mecha / schotel / tank) — elk met een gepixelde voetballer-bestuurder
    const bs = boss.current
    if (bs) {
      const flip = bs.x > p.x   // kijkt naar de speler
      let faceY = bs.y - 70
      if (bs.kind === 'mech') { drawSheetFrame(ctx, MECH, bs.frame, bs.x, bs.y, 96, flip); faceY = bs.y - 86 }
      else if (bs.kind === 'saucer') { drawSheetFrame(ctx, SAUCER, bs.frame, bs.x, bs.y + 36, 64, flip); faceY = bs.y - 8 }
      else drawImg(ctx, TANK[bs.frame % TANK.length], bs.x, bs.y, 70, true)
      const f = facePix.current[BOSS_FACE[bs.kind]]
      if (f) { const s = bs.kind === 'tank' ? 26 : 22; ctx.drawImage(f, bs.x - s / 2, faceY, s, s) }
    }

    // explosies
    for (const bm of booms.current) {
      const im = imgs.current[BOOM.src]; if (!im) continue
      const f = bm.frame % BOOM.frames; const s = 48 * bm.scale
      ctx.drawImage(im, f * BOOM.fw, 0, BOOM.fw, BOOM.fh, bm.x - s / 2, bm.y - s / 2, s, s)
    }

    // speler
    if (phaseRef.current !== 'over' && !(p.inv > 0 && Math.floor(p.inv * 16) % 2 === 0)) {
      const src = !p.grounded ? JUMP : (inL.current || inR.current) ? RUN[p.frame] : IDLE[Math.floor(performanceFrame() / 8) % IDLE.length]
      drawImg(ctx, src, p.x, p.y, 48, p.face < 0)
    }
  }
  const performanceFrame = () => Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) / 16)

  useEffect(() => {
    setupCanvas(); last.current = now(); raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current) }
  }, [setupCanvas, loop])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') inL.current = true
      else if (e.code === 'ArrowRight') inR.current = true
      else if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); doJump() }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'ArrowLeft') inL.current = false; else if (e.code === 'ArrowRight') inR.current = false }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [doJump])

  const hold = (ref: React.RefObject<boolean>) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); ref.current = true },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); ref.current = false },
    onPointerLeave: () => { ref.current = false },
    onPointerCancel: () => { ref.current = false },
  })

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
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Alien Assault</h1>
        </header>

        {phase === 'playing' && (
          <div className="flex items-center justify-between bg-wk-surface border border-white/10 rounded-xl px-4 py-2">
            <div><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Score</p><p className="font-score text-2xl leading-none text-wk-gold">{hud.score}</p></div>
            <div className="text-center"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">{hud.bossMax > 0 ? 'Boss' : `${hud.progress}%`}</p><p className="font-score text-lg leading-none text-wk-text">{'❤'.repeat(Math.max(0, hud.hp))}</p></div>
            <div className="text-right"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Levens</p><p className="font-score text-2xl leading-none text-wk-red">{hud.hp}</p></div>
          </div>
        )}

        <div className="relative mx-auto w-full max-w-[460px] select-none touch-none">
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }} />

          {phase === 'playing' && hud.bossMax > 0 && (
            <div className="absolute top-2 left-3 right-3 z-10">
              <p className="font-mono text-[9px] text-wk-red tracking-[0.2em] uppercase text-center mb-1 drop-shadow">⚠ {hud.bossName}</p>
              <div className="h-2 rounded-full bg-black/60 border border-wk-red/40 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-wk-red to-wk-gold transition-[width] duration-150" style={{ width: `${(hud.bossHp / hud.bossMax) * 100}%` }} />
              </div>
            </div>
          )}

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-wk-bg/60 backdrop-blur-[1px] rounded-2xl">
              <p className="text-5xl">🔫</p>
              <p className="text-sm text-wk-soft leading-relaxed">
                <b className="text-wk-gold">◀ ▶</b> om te lopen, <b className="text-wk-gold">JUMP</b> om te springen (nogmaals = <b>dubbelsprong</b>) — je <b>schiet automatisch</b> vooruit. Maai je door de aliens, verover de arena's en versla <b className="text-wk-red">3 bazen</b>: de Mecha-Unit, de Alien-Schotel en de Alien-Tank. <span className="text-wk-muted">(Desktop: pijltjes + spatie)</span>
              </p>
              <button onClick={(e) => { e.stopPropagation(); startOrJump() }} disabled={!ready} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50">
                {ready ? 'Start' : 'Laden…'}
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/65 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: result.win ? 'var(--color-wk-green)' : 'var(--color-wk-red)' }}>{result.win ? '🏆 Alien-Tank vernietigd!' : 'Gevallen…'}</p>
              <p className="font-score text-5xl text-wk-gold leading-none">{result.score}</p>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">punten</p>
              {result.record && <p className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase">Nieuw record!</p>}
              <button onClick={(e) => { e.stopPropagation(); reset(); setResult(null); phaseRef.current = 'playing'; setPhase('playing') }} className="mt-1 font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Opnieuw
              </button>
            </div>
          )}
        </div>

        {/* Besturing onder het speelveld — overlapt nooit het scherm (fijn op mobiel) */}
        {phase === 'playing' && (
          <div className="flex items-center justify-between gap-3 max-w-[460px] mx-auto select-none touch-none">
            <div className="flex gap-3">
              <button {...hold(inL)} className="w-16 h-16 rounded-2xl bg-wk-surface border border-white/15 text-wk-text text-2xl flex items-center justify-center active:bg-white/10" aria-label="Links">◀</button>
              <button {...hold(inR)} className="w-16 h-16 rounded-2xl bg-wk-surface border border-white/15 text-wk-text text-2xl flex items-center justify-center active:bg-white/10" aria-label="Rechts">▶</button>
            </div>
            <button onPointerDown={(e) => { e.preventDefault(); doJump() }} className="w-24 h-16 rounded-2xl bg-wk-gold/90 border border-white/20 text-wk-bg text-lg font-display uppercase tracking-wide flex items-center justify-center active:scale-95" aria-label="Springen">Jump</button>
          </div>
        )}

        <GameLeaderboard entries={board} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
