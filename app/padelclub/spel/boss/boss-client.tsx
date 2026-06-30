'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'
import TeamsPopup from '../teams-popup'
import ImmersiveToggle from '../immersive-toggle'

const W = 380
const H = 600

// ── Sprites (Gothicvania, horizontale strips) ───────────────────────────────────
type Sheet = { src: string; frames: number; fw: number; fh: number }
const HERO_IDLE: Sheet = { src: '/spel/boss/hero-idle.png', frames: 4, fw: 128, fh: 96 }
const HERO_RUN: Sheet = { src: '/spel/boss/hero-run.png', frames: 12, fw: 128, fh: 96 }
const DAGGER = '/spel/boss/dagger.png'
const BG = '/spel/boss/bg.png'
const BOOM: Sheet = { src: '/spel/space/explosion.png', frames: 8, fw: 48, fh: 48 }  // hergebruik burst

type BossKey = 'eye' | 'ghost' | 'nightmare' | 'hellbeast' | 'demon' | 'face'
type BossDef = { key: BossKey; sheet?: Sheet; face?: string; tier?: number; hp: number; scale: number; name: string; y: number; r: number; speed: number; fps: number }
const BOSSES: BossDef[] = [
  { key: 'eye',       sheet: { src: '/spel/boss/eye.png',       frames: 8, fw: 48,  fh: 48  }, hp: 32,  scale: 1.5, name: 'Vliegend Oog', y: 92,  r: 34, speed: 70,  fps: 12 },
  { key: 'ghost',     sheet: { src: '/spel/boss/ghost.png',     frames: 7, fw: 64,  fh: 80  }, hp: 48,  scale: 1.3, name: 'Spook',        y: 96,  r: 40, speed: 55,  fps: 9  },
  { key: 'nightmare', sheet: { src: '/spel/boss/nightmare.png', frames: 4, fw: 160, fh: 96  }, hp: 72,  scale: 1.0, name: 'Nachtmerrie',  y: 100, r: 52, speed: 120, fps: 8  },
  { key: 'hellbeast', sheet: { src: '/spel/boss/hellbeast.png', frames: 6, fw: 80,  fh: 160 }, hp: 100, scale: 1.0, name: 'Hellebeest',   y: 120, r: 50, speed: 70,  fps: 9  },
  { key: 'demon',     sheet: { src: '/spel/boss/demon.png',     frames: 6, fw: 160, fh: 144 }, hp: 110, scale: 1.05, name: 'De Demon',    y: 124, r: 70, speed: 60,  fps: 7  },
]
// Extra "verrassingsbazen" ná de vaste 5: 4 willekeurige voetballerkoppen, oplopend taaier.
const FACE_POOL = ['/spelers/lukaku.png', '/spelers/bus.png', '/spelers/dejuul.png', '/spelers/ashi.png', '/spelers/trein.png', '/spelers/pimp.png', '/spelers/kim.png', '/spelers/vince.png', '/spelers/ho.png', '/rick.png']
const FACE_NAME: Record<string, string> = {
  '/spelers/lukaku.png': 'Beul Lukaku', '/spelers/bus.png': 'De Bus', '/spelers/dejuul.png': 'Generaal De Juul',
  '/spelers/ashi.png': 'Kapitein Ashi', '/spelers/trein.png': 'De Sneltrein', '/spelers/pimp.png': 'De Pimp',
  '/spelers/kim.png': 'Kommandant Kim', '/spelers/vince.png': 'Admiraal Vince', '/spelers/ho.png': 'Generaal Ho', '/rick.png': 'Reuze-Rick',
}
const FACE_HP = [120, 140, 160, 185]
const TOTAL_BOSSES = BOSSES.length + FACE_HP.length

type Img = HTMLImageElement
type Dagger = { x: number; y: number; vy: number }
type Fire = { x: number; y: number; vx: number; vy: number; r: number; col: string }
type Boom = { x: number; y: number; frame: number; ft: number; scale: number }
type BossState = { def: BossDef; x: number; y: number; vx: number; hp: number; max: number; t: number; frame: number; ft: number; fireCd: number; entering: boolean; fade: number; tele: number }

export default function BossClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [hud, setHud] = useState({ score: 0, hp: 3, idx: 0, bossHp: 0, bossMax: 0, bossName: '' })
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean; win: boolean; timeBonus?: number; secs?: number } | null>(null)
  const [ready, setReady] = useState(false)

  const phaseRef = useRef(phase); phaseRef.current = phase
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const imgs = useRef<Record<string, Img>>({})

  const player = useRef({ x: W / 2, y: H - 70, tx: W / 2, ty: H - 70, fireCd: 0, inv: 0, grow: 0, frame: 0, ft: 0, moving: false })
  const keys = useRef({ u: false, d: false, l: false, r: false })   // pijltjes/WASD (desktop)
  const runStart = useRef(0)   // starttijd voor de tijdbonus
  const bossList = useRef<BossDef[]>(BOSSES)   // vaste bazen + 4 willekeurige (opgebouwd in reset)
  const ricks = useRef<{ x: number; y: number; vy: number; rot: number; vr: number; size: number; kind: 'rick' | 'lukaku' }[]>([])   // willekeurig vallende hazards
  const rickTimer = useRef(5)
  const daggers = useRef<Dagger[]>([])
  const fires = useRef<Fire[]>([])
  const booms = useRef<Boom[]>([])
  const boss = useRef<BossState | null>(null)
  const idx = useRef(0)
  const hp = useRef(3)
  const score = useRef(0)
  const pending = useRef(1.0)
  const bgY = useRef(0)
  const flash = useRef(0)
  const flashCol = useRef('#ffffff')

  // ── assets laden ──
  useEffect(() => {
    let alive = true
    const srcs = [...new Set([HERO_IDLE.src, HERO_RUN.src, DAGGER, BG, BOOM.src, ...BOSSES.map((b) => b.sheet!.src), ...FACE_POOL])]
    let done = 0
    srcs.forEach((src) => {
      const im = new window.Image()
      const fin = () => { done++; if (done === srcs.length && alive) setReady(true) }
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
    const ctx = cv.getContext('2d')
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false }
  }, [])

  const drawSheet = (ctx: CanvasRenderingContext2D, sh: Sheet, frame: number, cx: number, cy: number, scale: number, flipX = false) => {
    const im = imgs.current[sh.src]; if (!im) return
    const f = ((frame % sh.frames) + sh.frames) % sh.frames
    ctx.save(); ctx.translate(cx, cy); ctx.scale(flipX ? -1 : 1, 1)
    ctx.drawImage(im, f * sh.fw, 0, sh.fw, sh.fh, -sh.fw * scale / 2, -sh.fh * scale / 2, sh.fw * scale, sh.fh * scale)
    ctx.restore()
  }

  const addBoom = (x: number, y: number, scale = 1) => booms.current.push({ x, y, frame: 0, ft: 0, scale })
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

  // ── vuren-helpers (vijand-projectielen) ──
  const fb = (x: number, y: number, ang: number, sp: number, col = '#F4801E', r = 7) =>
    fires.current.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r, col })
  const fan = (x: number, y: number, n: number, spread: number, sp: number, base = Math.PI / 2, col?: string) => {
    for (let i = 0; i < n; i++) fb(x, y, base + (i - (n - 1) / 2) * spread, sp, col)
  }
  const radial = (x: number, y: number, n: number, sp: number, off = 0, col?: string) => {
    for (let i = 0; i < n; i++) fb(x, y, off + (i * Math.PI * 2) / n, sp, col)
  }
  const aimAt = (x: number, y: number, px: number, py: number, sp: number, col?: string) => fb(x, y, Math.atan2(py - y, px - x), sp, col)

  const spawnBoss = useCallback((i: number) => {
    const def = bossList.current[i]
    boss.current = { def, x: W / 2, y: -120, vx: def.speed, hp: def.hp, max: def.hp, t: 0, frame: 0, ft: 0, fireCd: 1.6, entering: true, fade: 1, tele: 3 }
    setHud((h) => ({ ...h, idx: i + 1, bossHp: def.hp, bossMax: def.hp, bossName: def.name }))
  }, [])

  const reset = useCallback(() => {
    player.current = { x: W / 2, y: H - 70, tx: W / 2, ty: H - 70, fireCd: 0, inv: 0, grow: 0, frame: 0, ft: 0, moving: false }
    keys.current = { u: false, d: false, l: false, r: false }
    daggers.current = []; fires.current = []; booms.current = []; boss.current = null
    ricks.current = []; rickTimer.current = 4 + Math.random() * 4
    idx.current = 0; hp.current = 3; score.current = 0; pending.current = 1.0; flash.current = 0
    // 4 willekeurige voetballerkoppen ná de vaste bazen (oplopend taaier)
    const pool = [...FACE_POOL]
    const faces: BossDef[] = FACE_HP.map((fhp, t) => {
      const src = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      return { key: 'face', face: src, tier: t, hp: fhp, scale: 1, name: FACE_NAME[src] ?? 'Eindbaas', y: 110, r: 50, speed: 52 + t * 8, fps: 6 }
    })
    bossList.current = [...BOSSES, ...faces]
    setHud({ score: 0, hp: 3, idx: 0, bossHp: 0, bossMax: 0, bossName: '' })
  }, [])

  const endGame = useCallback((win: boolean) => {
    if (phaseRef.current === 'over') return
    phaseRef.current = 'over'; setPhase('over')
    // Tijdbonus bij uitspelen: hoe sneller alle bazen vallen, hoe meer punten
    const secs = Math.round((now() - runStart.current) / 1000)
    const timeBonus = win ? Math.max(0, Math.round(4500 - secs * 12)) : 0
    if (timeBonus > 0) score.current += timeBonus
    const final = score.current
    const prevBest = board.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest, win, timeBonus, secs })
    setBoard((prev) => prev.map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e)).sort((a, b) => b.best - a.best))
    void submitPadelScore('boss', final)
  }, [board, currentUserId])

  const hitPlayer = useCallback(() => {
    const p = player.current
    if (p.inv > 0) return
    hp.current -= 1; p.inv = 1.3
    addBoom(p.x, p.y, 0.9); flash.current = 0.35; flashCol.current = '#E63946'
    setHud((h) => ({ ...h, hp: hp.current }))
    if (hp.current <= 0) endGame(false)
  }, [endGame])

  // ── loop ──
  const loop = useCallback((t: number) => {
    const dt = Math.min(0.05, (t - last.current) / 1000); last.current = t
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) { raf.current = requestAnimationFrame(loop); return }
    const playing = phaseRef.current === 'playing'

    // achtergrond (donker kasteel, langzaam scrollend + vignet)
    ctx.fillStyle = '#070406'; ctx.fillRect(0, 0, W, H)
    const bg = imgs.current[BG]
    if (bg) {
      bgY.current = (bgY.current + dt * 12) % H
      const tw = W, th = (bg.height / bg.width) * W
      for (let y = (bgY.current % th) - th; y < H; y += th) ctx.drawImage(bg, 0, y, tw, th)
      ctx.fillStyle = 'rgba(7,4,6,0.45)'; ctx.fillRect(0, 0, W, H)
    }
    // grondlijn
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H - 34, W, 34)
    ctx.fillStyle = 'rgba(244,185,46,0.25)'; ctx.fillRect(0, H - 34, W, 2)

    if (playing) step(dt)
    drawWorld(ctx)

    if (flash.current > 0) { flash.current -= dt; ctx.globalAlpha = Math.max(0, flash.current * 1.4); ctx.fillStyle = flashCol.current; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1 }
    raf.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── simulatie ──
  const step = (dt: number) => {
    const p = player.current
    // toetsenbord (desktop): pijltjes/WASD verschuiven het mik-doel
    const kx = (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0)
    const ky = (keys.current.d ? 1 : 0) - (keys.current.u ? 1 : 0)
    if (kx || ky) {
      const KSPD = 360
      p.tx = Math.max(22, Math.min(W - 22, p.tx + kx * KSPD * dt))
      p.ty = Math.max(H * 0.45, Math.min(H - 40, p.ty + ky * KSPD * dt))
    }
    p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.y += (p.ty - p.y) * Math.min(1, dt * 12)
    p.x = Math.max(22, Math.min(W - 22, p.x)); p.y = Math.max(H * 0.45, Math.min(H - 40, p.y))
    p.moving = Math.abs(p.tx - p.x) > 2
    p.ft += dt; const fps = p.moving ? 16 : 6; if (p.ft > 1 / fps) { p.ft = 0; p.frame++ }
    if (p.inv > 0) p.inv -= dt
    if (p.grow > 0) p.grow -= dt   // tijdelijk 50% groter na een Lukaku-treffer

    // auto-werpen
    p.fireCd -= dt
    if (p.fireCd <= 0) { p.fireCd = 0.2; daggers.current.push({ x: p.x, y: p.y - 26, vy: -640 }) }
    for (const d of daggers.current) d.y += d.vy * dt
    daggers.current = daggers.current.filter((d) => d.y > -30)

    // vijand-projectielen
    for (const f of fires.current) { f.x += f.vx * dt; f.y += f.vy * dt }
    fires.current = fires.current.filter((f) => f.y < H + 30 && f.y > -40 && f.x > -40 && f.x < W + 40)

    for (const bm of booms.current) { bm.ft += dt; if (bm.ft > 0.05) { bm.ft = 0; bm.frame++ } }
    booms.current = booms.current.filter((bm) => bm.frame < BOOM.frames)

    // willekeurig vallende hazards: Rick (kost een leven) of Lukaku (maakt je tijdelijk 50% groter)
    rickTimer.current -= dt
    if (rickTimer.current <= 0) {
      rickTimer.current = 4.5 + Math.random() * 5
      const size = 56 + Math.random() * 28
      const kind = Math.random() < 0.55 ? 'rick' : 'lukaku'
      ricks.current.push({ x: 40 + Math.random() * (W - 80), y: -size, vy: 360 + Math.random() * 140, rot: 0, vr: (Math.random() - 0.5) * 6, size, kind })
    }
    for (const rk of ricks.current) { rk.y += rk.vy * dt; rk.rot += rk.vr * dt }
    const playerR = p.grow > 0 ? 16 : 10
    for (const rk of ricks.current) {
      if (rk.y <= 0) continue
      if (Math.abs(rk.x - p.x) < rk.size * 0.42 + (playerR - 10) && Math.abs(rk.y - p.y) < rk.size * 0.42 + (playerR - 10)) {
        rk.y = 99999; addBoom(rk.x, rk.y, 1.0)
        if (rk.kind === 'lukaku') { p.grow = 6; flash.current = 0.3; flashCol.current = '#2D6BE5' }   // groei-debuff (geen invuln-check)
        else hitPlayer()
        break
      }
    }
    ricks.current = ricks.current.filter((rk) => rk.y < H + 90)

    // boss
    const bs = boss.current
    if (bs) {
      bs.t += dt; bs.ft += dt; if (bs.ft > 1 / bs.def.fps) { bs.ft = 0; bs.frame++ }
      if (bs.entering) {
        bs.y += 70 * dt
        if (bs.y >= bs.def.y) { bs.y = bs.def.y; bs.entering = false }
      } else {
        bossBehaviour(bs, dt, p)
      }
      // dagger-treffers
      for (const d of daggers.current) {
        if (bs.fade < 0.6) continue
        if (Math.abs(d.x - bs.x) < bs.def.r && Math.abs(d.y - bs.y) < bs.def.r) {
          bs.hp -= 1; d.y = -999; if (Math.random() < 0.3) addBoom(d.x, d.y - 6, 0.4)
          score.current += 5; setHud((h) => ({ ...h, bossHp: Math.max(0, bs.hp) }))
          if (bs.hp <= 0) { defeatBoss(bs); break }
        }
      }
      // boss raakt speler aan
      if (!bs.entering && p.inv <= 0 && bs.fade > 0.6 && Math.abs(bs.x - p.x) < bs.def.r * 0.7 + (playerR - 10) && Math.abs(bs.y - p.y) < bs.def.r * 0.7 + (playerR - 10)) hitPlayer()
    }

    // projectiel raakt speler
    if (p.inv <= 0) for (const f of fires.current) { if (Math.abs(f.x - p.x) < f.r + playerR && Math.abs(f.y - p.y) < f.r + playerR) { f.y = 9999; hitPlayer(); break } }
    fires.current = fires.current.filter((f) => f.y < H + 30)

    // volgende boss
    if (!boss.current && phaseRef.current === 'playing') {
      pending.current -= dt
      if (pending.current <= 0) {
        if (idx.current < bossList.current.length) { spawnBoss(idx.current); idx.current += 1; pending.current = 99 }
        else endGame(true)
      }
    }
    setHud((h) => (h.score === score.current ? h : { ...h, score: score.current }))
  }

  const defeatBoss = (bs: BossState) => {
    for (let i = 0; i < 12; i++) setTimeout(() => addBoom(bs.x + (Math.random() - 0.5) * bs.def.r * 2, bs.y + (Math.random() - 0.5) * bs.def.r * 2, 1.1), i * 60)
    score.current += 500
    if (hp.current < 4) { hp.current += 1; setHud((h) => ({ ...h, hp: hp.current })) }   // heal tussen bosses
    flash.current = 0.4; flashCol.current = '#F4B92E'
    fires.current = []
    boss.current = null; pending.current = 1.4
    setHud((h) => ({ ...h, bossHp: 0 }))
  }

  // ── boss-gedrag per type ──
  const bossBehaviour = (bs: BossState, dt: number, p: { x: number; y: number }) => {
    bs.fireCd -= dt
    const k = bs.def.key
    if (k === 'ghost') {
      // zweeft, vervaagt periodiek en verschijnt elders (onkwetsbaar tijdens teleport)
      bs.y = bs.def.y + Math.sin(bs.t * 1.6) * 8
      bs.tele -= dt
      if (bs.tele > 0) {
        bs.fade = Math.min(1, bs.fade + dt * 3)
        const rage = bs.hp < bs.max * 0.5
        if (bs.fade >= 1 && bs.fireCd <= 0) { bs.fireCd = rage ? 1.2 : 1.7; fan(bs.x, bs.y + 24, rage ? 5 : 3, 0.32, 155, Math.PI / 2, '#9b7bd4'); aimAt(bs.x, bs.y, p.x, p.y, 175, '#cdb4ff') }
      } else {
        bs.fade -= dt * 2.5
        if (bs.fade <= 0) { bs.fade = 0; bs.x = 70 + Math.random() * (W - 140); bs.tele = 2.6 }
      }
      return
    }
    // standaard zweef-/loopbeweging
    bs.x += bs.vx * dt
    if (bs.x < 70 || bs.x > W - 70) { bs.vx *= -1; bs.x = Math.max(70, Math.min(W - 70, bs.x)) }
    bs.y = bs.def.y + Math.sin(bs.t * 1.3) * 7
    if (bs.fireCd > 0) return
    const rage = bs.hp < bs.max * 0.5
    if (k === 'eye') { bs.fireCd = rage ? 0.9 : 1.4; aimAt(bs.x, bs.y + 16, p.x, p.y, 180, '#E63946'); if (rage) fan(bs.x, bs.y + 16, 3, 0.3, 150) }
    else if (k === 'nightmare') { bs.fireCd = rage ? 1.0 : 1.5; fan(bs.x, bs.y + 24, rage ? 7 : 5, 0.26, 170, Math.PI / 2, '#43d4c4'); if (rage) aimAt(bs.x, bs.y, p.x, p.y, 220, '#7ff0e2') }
    else if (k === 'hellbeast') {
      bs.fireCd = rage ? 1.3 : 1.9
      if (Math.floor(bs.t) % 2 === 0) radial(bs.x, bs.y + 20, rage ? 14 : 10, 150, bs.t, '#F4801E')
      else { fan(bs.x, bs.y + 40, rage ? 9 : 6, 0.2, 200, Math.PI / 2, '#ff5a2e'); aimAt(bs.x, bs.y, p.x, p.y, 210) }
    }
    else if (k === 'demon') {
      bs.fireCd = rage ? 1.15 : 1.55
      radial(bs.x, bs.y + 30, rage ? 13 : 9, 145, bs.t * 0.7, '#b03a8f')
      fan(bs.x, bs.y + 30, 3, 0.22, 205, Math.atan2(p.y - bs.y, p.x - bs.x), '#ff7ad6')
    }
    else if (k === 'face') {
      const tier = bs.def.tier ?? 0
      bs.fireCd = rage ? Math.max(0.85, 1.3 - tier * 0.08) : Math.max(1.1, 1.7 - tier * 0.1)
      fan(bs.x, bs.y + 30, (rage ? 6 : 4) + tier, 0.24, 160 + tier * 10, Math.PI / 2, '#F4B92E')
      aimAt(bs.x, bs.y, p.x, p.y, 185 + tier * 10, '#ffd76a')
      if (rage && tier >= 2) radial(bs.x, bs.y + 20, 10, 150, bs.t, '#E8862E')
    }
  }

  // reuzenkop-baas: donkere schijf + voetballerkop + rode rage-gloed
  const drawFaceBoss = (ctx: CanvasRenderingContext2D, bs: BossState) => {
    const im = bs.def.face ? imgs.current[bs.def.face] : null
    const rage = bs.hp < bs.max * 0.5
    const s = bs.def.r * 2.3
    ctx.save(); ctx.translate(bs.x, bs.y)
    ctx.fillStyle = '#0b0e14'; ctx.beginPath(); ctx.arc(0, 0, s / 2 + 6, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = rage ? 'rgba(230,57,70,0.9)' : 'rgba(244,185,46,0.7)'; ctx.lineWidth = 3; ctx.stroke()
    if (im) ctx.drawImage(im, -s / 2, -s / 2, s, s)
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = `rgba(230,57,70,${0.22 + (rage ? 0.3 : 0)})`
    ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // ── tekenen ──
  const drawWorld = (ctx: CanvasRenderingContext2D) => {
    const p = player.current

    // boss
    const bs = boss.current
    if (bs) {
      ctx.save(); ctx.globalAlpha = bs.fade
      if (bs.def.face) drawFaceBoss(ctx, bs)
      else if (bs.def.sheet) drawSheet(ctx, bs.def.sheet, bs.frame, bs.x, bs.y, bs.def.scale)
      ctx.restore()
    }

    // vijand-projectielen (gloeiende vuurbollen)
    for (const f of fires.current) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.8)
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, f.col); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.8, 0, Math.PI * 2); ctx.fill()
    }

    // dolken (omhoog gericht)
    const dg = imgs.current[DAGGER]
    if (dg) for (const d of daggers.current) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(-Math.PI / 2); ctx.drawImage(dg, -16, -16, 32, 32); ctx.restore() }

    // vallende hazards (roterend): Rick = rode gloed, Lukaku = blauwe gloed
    for (const rk of ricks.current) {
      const im = imgs.current[rk.kind === 'lukaku' ? '/spelers/lukaku.png' : '/rick.png']
      ctx.save(); ctx.translate(rk.x, rk.y); ctx.rotate(rk.rot)
      ctx.shadowColor = rk.kind === 'lukaku' ? 'rgba(45,107,229,0.85)' : 'rgba(230,57,70,0.7)'; ctx.shadowBlur = 12
      if (im) ctx.drawImage(im, -rk.size / 2, -rk.size / 2, rk.size, rk.size)
      ctx.restore()
    }

    // explosies
    for (const bm of booms.current) drawSheet(ctx, BOOM, bm.frame, bm.x, bm.y, bm.scale)

    // held (knippert bij invuln)
    if (phaseRef.current !== 'over' && !(p.inv > 0 && Math.floor(p.inv * 16) % 2 === 0)) {
      const sh = p.moving ? HERO_RUN : HERO_IDLE
      const flip = p.tx < p.x - 2
      drawSheet(ctx, sh, p.frame, p.x, p.y - 4, 0.62 * (p.grow > 0 ? 1.5 : 1), flip)
    }
  }

  // ── start / input ──
  const start = useCallback(() => { if (!ready) return; reset(); setResult(null); runStart.current = now(); phaseRef.current = 'playing'; setPhase('playing') }, [ready, reset])

  useEffect(() => {
    setupCanvas(); last.current = now(); raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current) }
  }, [setupCanvas, loop])

  // Toetsenbord (desktop): pijltjes + WASD
  useEffect(() => {
    const set = (e: KeyboardEvent, on: boolean) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': keys.current.l = on; break
        case 'ArrowRight': case 'KeyD': keys.current.r = on; break
        case 'ArrowUp': case 'KeyW': keys.current.u = on; break
        case 'ArrowDown': case 'KeyS': keys.current.d = on; break
        default: return
      }
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => set(e, true)
    const up = (e: KeyboardEvent) => set(e, false)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const onPointer = (e: React.PointerEvent) => {
    if (phaseRef.current !== 'playing') return
    const cv = canvasRef.current; if (!cv) return
    const rect = cv.getBoundingClientRect()
    player.current.tx = ((e.clientX - rect.left) / rect.width) * W
    player.current.ty = ((e.clientY - rect.top) / rect.height) * H
  }

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
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Boss Rush</h1>
        </header>

        {phase === 'playing' && (
          <div className="flex items-center justify-between bg-wk-surface border border-white/10 rounded-xl px-4 py-2">
            <div><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Score</p><p className="font-score text-2xl leading-none text-wk-gold">{hud.score}</p></div>
            <div className="text-center"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Boss {hud.idx}/{TOTAL_BOSSES}</p><p className="font-score text-lg leading-none text-wk-text">{'❤'.repeat(Math.max(0, hud.hp))}</p></div>
            <div className="text-right"><p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">Levens</p><p className="font-score text-2xl leading-none text-wk-red">{hud.hp}</p></div>
          </div>
        )}

        <div className="gx-stage relative mx-auto w-full max-w-[380px] select-none touch-none" onPointerMove={onPointer} onPointerDown={onPointer}>
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }} />

          {phase === 'playing' && hud.bossMax > 0 && (
            <div className="absolute top-2 left-3 right-3 z-10">
              <p className="font-mono text-[9px] text-wk-red tracking-[0.2em] uppercase text-center mb-1 drop-shadow">{hud.bossName}</p>
              <div className="h-2 rounded-full bg-black/60 border border-wk-red/40 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-wk-red to-wk-gold transition-[width] duration-150" style={{ width: `${(hud.bossHp / hud.bossMax) * 100}%` }} />
              </div>
            </div>
          )}

          {phase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-wk-bg/55 backdrop-blur-[1px] rounded-2xl">
              <p className="text-5xl">🗡️</p>
              <p className="text-sm text-wk-soft leading-relaxed">
                Beweeg met je <b className="text-wk-gold">vinger of muis</b> (of de <b className="text-wk-gold">pijltjes</b>/WASD op desktop) — je held werpt <b>automatisch</b> dolken omhoog. Ontwijk het spervuur en de vallende koppen: <b className="text-wk-red">Rick</b> 💢 kost een leven, <b className="text-wk-blue">Lukaku</b> maakt je tijdelijk <b>50% groter</b> (lastiger ontwijken). Versla <b>{TOTAL_BOSSES} eindbazen</b> op rij — eindigend in een <b className="text-wk-red">verrassingsronde</b>. Elke verslagen boss heelt een hartje, en hoe sneller je klaart, hoe meer <b className="text-wk-gold">tijdbonus</b>.
              </p>
              <button onClick={(e) => { e.stopPropagation(); start() }} disabled={!ready} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer disabled:opacity-50">
                {ready ? 'Start' : 'Laden…'}
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/65 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: result.win ? 'var(--color-wk-green)' : 'var(--color-wk-red)' }}>{result.win ? '🏆 Alle bazen verslagen!' : 'Gevallen…'}</p>
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

        <div className="gx-hide"><GameLeaderboard entries={board} currentUserId={currentUserId} /></div>
      </div>
    </div>
  )
}
