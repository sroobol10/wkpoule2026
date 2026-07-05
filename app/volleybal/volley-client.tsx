'use client'

// Netwerk — 2v2 beachvolleybal in side-view. Bump 'm omhoog, spring bij het net en RAM
// de smash het zand in. Maximaal 3 aanrakingen, rallypunten, eerste tot 11.
// Vs computer (met AI-maatje), co-op of 1v1 — en ja, de naam is een agency-grapje.

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  BALL_R, FLOOR, H, NET_TOP, NET_X, W, WIN_SCORE, makeVState, serve, step,
  type VInput, type VSide, type VState,
} from '@/lib/volley/sim'
import { aiInput } from '@/lib/volley/ai'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile, isCoarsePointer } from '@/components/playground/mobile-play'
import { TouchGamepad } from '@/components/playground/touch-gamepad'

const TEAM_COLORS = ['#E63946', '#F4B92E'] as const
const TEAM_NAMES = ['Rood', 'Geel'] as const
type Mode = 'ai' | 'coop' | 'vs'
const FIXED_DT = 1 / 120

const DIFFICULTY = [
  { label: 'Makkelijk', val: 0.25 },
  { label: 'Normaal', val: 0.55 },
  { label: 'Pittig', val: 0.85 },
]

type Game = {
  mode: Mode
  difficulty: number
  state: VState
  score: [number, number]
  phase: 'serve' | 'rally' | 'point' | 'over'
  pointT: number
  aiServeT: number
}

export default function VolleyClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const keysRef = useRef<Set<string>>(new Set())

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [mode, setMode] = useState<Mode>('ai')
  const [difficulty, setDifficulty] = useState(0.55)
  const [popup, setPopup] = useState<{ text: string; color: string; n: number } | null>(null)
  const [matchOver, setMatchOver] = useState<{ winner: VSide; score: [number, number] } | null>(null)
  const popupN = useRef(0)

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
  }, [])

  const startMatch = useCallback(() => {
    const pool = [...PLAYER_POOL].sort(() => Math.random() - 0.5).slice(0, 4)
    gameRef.current = {
      mode, difficulty,
      state: makeVState(pool.map((p) => ({ face: p.face, name: p.name }))),
      score: [0, 0],
      phase: 'serve', pointT: 0, aiServeT: 1.2,
    }
    setPopup(null)
    setMatchOver(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [mode, difficulty])

  useEffect(() => {
    if (stage !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const keys = keysRef.current

    const has = (c: string) => keys.has(c)
    const p1Keys = (merged: boolean): VInput => ({
      moveX: ((has('KeyD') || (merged && has('ArrowRight'))) ? 1 : 0) - ((has('KeyA') || (merged && has('ArrowLeft'))) ? 1 : 0),
      jump: has('KeyW') || (merged && has('ArrowUp')),
      hit: has('Space') || (merged && has('Enter')),
      dink: has('KeyQ') || (merged && has('Comma')),
      dive: has('KeyE') || (merged && has('Period')),
      block: has('KeyR') || (merged && has('Slash')),
    })
    const p2Keys = (): VInput => ({
      moveX: (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0),
      jump: has('ArrowUp'),
      hit: has('Enter'),
      dink: has('Comma'),
      dive: has('Period'),
      block: has('Slash'),
    })

    // Wie bestuurt de mens binnen een team? Vs AI/1v1: de speler het dichtst bij de bal
    // (auto-switch, met markertje); co-op: vast — P1 achter, P2 aan het net.
    const controlledOf = (g: Game, team: VSide): number => {
      if (g.mode === 'coop' && team === 0) return -2 // speciale marker: beide vast
      const ids = team === 0 ? [0, 1] : [2, 3]
      const b = g.state.ball
      return Math.abs(g.state.players[ids[0]].x - b.x) <= Math.abs(g.state.players[ids[1]].x - b.x) ? ids[0] : ids[1]
    }

    const buildInputs = (g: Game): VInput[] => {
      const merged = g.mode === 'ai'
      const inputs: VInput[] = []
      const ctrl0 = controlledOf(g, 0)
      const ctrl1 = g.mode === 'vs' ? controlledOf(g, 1) : -1
      for (const p of g.state.players) {
        if (p.team === 0) {
          if (g.mode === 'coop') inputs.push(p.id === 0 ? p1Keys(false) : p2Keys())
          else inputs.push(p.id === ctrl0 ? p1Keys(merged) : aiInput(g.state, p.id, 0.7))
        } else {
          if (g.mode === 'vs') inputs.push(p.id === ctrl1 ? p2Keys() : aiInput(g.state, p.id, 0.7))
          else inputs.push(aiInput(g.state, p.id, g.difficulty))
        }
      }
      return inputs
    }

    const show = (text: string, color: string) => {
      popupN.current++
      setPopup({ text, color, n: popupN.current })
    }

    const update = (g: Game, dt: number) => {
      const s = g.state
      if (g.phase === 'serve') {
        const humanServes = s.serving === 0 || g.mode === 'vs'
        if (humanServes) {
          const input = s.serving === 0 ? p1Keys(g.mode === 'ai') : p2Keys()
          if (input.hit) {
            serve(s, s.serving, input.moveX)
            g.phase = 'rally'
          }
        } else {
          g.aiServeT -= dt
          if (g.aiServeT <= 0) {
            serve(s, s.serving, Math.random() * 2 - 1)
            g.phase = 'rally'
            g.aiServeT = 1.2
          }
        }
        // spelers mogen alvast bewegen
        step(s, buildInputs(g).map((i) => ({ ...i, hit: false })), dt)
        return
      }
      if (g.phase === 'rally') {
        const ev = step(s, buildInputs(g), dt)
        if (ev) {
          g.score[ev.to] += 1
          show(`🏐 Punt ${TEAM_NAMES[ev.to]} — ${ev.reason}`, TEAM_COLORS[ev.to])
          if (g.score[ev.to] >= WIN_SCORE) {
            g.phase = 'over'
            setMatchOver({ winner: ev.to, score: [g.score[0], g.score[1]] })
            return
          }
          g.phase = 'point'
          g.pointT = 1.5
          s.serving = ev.to // rallywinnaar serveert
        }
        return
      }
      if (g.phase === 'point') {
        g.pointT -= dt
        if (g.pointT <= 0) {
          const s2 = g.state
          s2.live = false
          s2.touches = 0
          s2.lastTeam = -1
          s2.ball.x = s2.serving === 0 ? 180 : W - 180
          s2.ball.y = FLOOR - 240
          s2.ball.vx = 0
          s2.ball.vy = 0
          for (const p of s2.players) {
            p.x = [180, 360, W - 360, W - 180][p.id]
            p.y = FLOOR
            p.vy = 0
          }
          g.phase = 'serve'
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
        update(g, FIXED_DT)
        acc -= FIXED_DT
      }
      draw(ctx, canvas, g, facesRef.current, now, controlledOf)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) e.preventDefault()
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
    }
  }, [stage])

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/netwerk.png" alt="Netwerk" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Modus">
              <Seg options={['Vs computer', 'Co-op', '1 vs 1']} value={mode === 'ai' ? 0 : mode === 'coop' ? 1 : 2}
                onChange={(i) => setMode(i === 0 ? 'ai' : i === 1 ? 'coop' : 'vs')} />
            </MenuRow>
            {mode !== 'vs' && (
              <MenuRow label="Moeilijkheid">
                <Seg options={DIFFICULTY.map((d) => d.label)} value={DIFFICULTY.findIndex((d) => d.val === difficulty)} onChange={(i) => setDifficulty(DIFFICULTY[i].val)} />
              </MenuRow>
            )}
            <button onClick={startMatch}
              className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
              Serveren 🏐
            </button>
          </div>

          <div className="max-w-lg text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            P1: A/D lopen · W springen · spatie slaan · Q dink · E duik · R blok — P2: pijltjes · ↑ · enter · , · . · /<br />
            in de lucht bij het net slaan = SMASH · gewoon bij het net SPRINGEN = blok · dink = zacht net over · duik = reddende lunge<br />
            max 3 aanrakingen · eerste tot {WIN_SCORE} · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          {isTouch && !portrait && mode === 'ai' && (
            <TouchGamepad dir="lr" buttons={[
              { code: 'KeyR', label: 'Blok', color: 'border-white/25 bg-white/10' },
              { code: 'KeyE', label: 'Duik', color: 'border-orange-300/40 bg-orange-500/25' },
              { code: 'KeyQ', label: 'Dink', color: 'border-sky-300/40 bg-sky-500/25' },
              { code: 'KeyW', label: 'Spring', color: 'border-cyan-300/40 bg-cyan-500/25' },
              { code: 'Space', label: 'Slaan', color: 'border-amber-300/50 bg-amber-500/30', big: true },
            ]} />
          )}
          {isTouch && portrait && <RotateNotice game="Netwerk" />}
          <button onClick={() => setStage('menu')}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[14%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-4xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: popup.color }}>
                {popup.text}
              </h2>
            </div>
          )}

          {matchOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex flex-col items-center gap-4 text-center animate-fade-up">
                <h2 className="font-score text-7xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: TEAM_COLORS[matchOver.winner] }}>
                  {TEAM_NAMES[matchOver.winner]} wint! 🏆
                </h2>
                <p className="font-score text-5xl text-white">{matchOver.score[0]} <span className="text-white/40">:</span> {matchOver.score[1]}</p>
                <div className="flex gap-3 pt-2">
                  <button onClick={startMatch} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">Opnieuw</button>
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
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, faces: Record<string, HTMLImageElement>, now: number, controlledOf: (g: Game, team: VSide) => number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const sc = Math.min(cw / W, ch / H) * (isCoarsePointer() ? 1.12 : 1) // mobiel: iets ingezoomd
  const ox = (cw - W * sc) / 2
  const oy = (ch - H * sc) / 2
  // avondlucht buiten het speelvlak
  ctx.fillStyle = '#141b2b'
  ctx.fillRect(0, 0, cw, ch)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(sc, sc)

  // Lucht → zee → zand.
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR)
  sky.addColorStop(0, '#1c2a4a')
  sky.addColorStop(0.62, '#7a4a63')
  sky.addColorStop(1, '#d97b4f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, FLOOR)
  ctx.beginPath()
  ctx.arc(W * 0.78, FLOOR - 118, 34, 0, Math.PI * 2)
  ctx.fillStyle = '#ffd98a'
  ctx.fill()
  ctx.fillStyle = '#2d4a66'
  ctx.fillRect(0, FLOOR - 96, W, 26)
  ctx.fillStyle = '#e2c184'
  ctx.fillRect(0, FLOOR - 70, W, H - (FLOOR - 70))
  ctx.fillStyle = 'rgba(120,90,40,0.12)'
  for (let i = 0; i < 14; i++) ctx.fillRect((i * 79) % W, FLOOR - 60 + ((i * 37) % 120), 46, 5)

  // Krab: scharrelt heen en weer over het voorste zand (puur voor de gein).
  {
    const span = W - 120
    const tri = Math.abs(((now * 0.00006) % 2) - 1) // 0→1→0 zaagtand
    const cx = 60 + tri * span
    const cy = H - 26
    const facing = ((now * 0.00006) % 2) < 1 ? 1 : -1
    const legw = Math.sin(now * 0.02) * 3
    ctx.strokeStyle = '#c0392b'
    ctx.lineWidth = 2
    for (const sgn of [-1, 1]) {
      for (let l = 0; l < 3; l++) {
        ctx.beginPath()
        ctx.moveTo(cx + sgn * 6, cy)
        ctx.lineTo(cx + sgn * (16 + l * 4), cy + 6 + legw * (l % 2 ? 1 : -1))
        ctx.stroke()
      }
    }
    ctx.fillStyle = '#e04b3a'
    ctx.beginPath()
    ctx.ellipse(cx, cy, 12, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    // scharen + oogsteeltjes
    ctx.strokeStyle = '#c0392b'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(cx + facing * 8, cy - 3); ctx.lineTo(cx + facing * 20, cy - 8); ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.beginPath(); ctx.arc(cx - 4, cy - 9, 1.6, 0, Math.PI * 2); ctx.arc(cx + 4, cy - 9, 1.6, 0, Math.PI * 2); ctx.fill()
  }

  // Net.
  ctx.fillStyle = '#5b4630'
  ctx.fillRect(NET_X - 5, NET_TOP - 6, 10, FLOOR - NET_TOP + 6)
  ctx.fillStyle = '#f2f4f8'
  ctx.fillRect(NET_X - 7, NET_TOP - 6, 14, 8)
  ctx.strokeStyle = 'rgba(240,244,250,0.5)'
  ctx.lineWidth = 1
  for (let y = NET_TOP + 10; y < FLOOR - 6; y += 14) {
    ctx.beginPath()
    ctx.moveTo(NET_X - 5, y)
    ctx.lineTo(NET_X + 5, y)
    ctx.stroke()
  }

  // Spelers.
  const ctrl0 = g.mode !== 'coop' ? controlledOf(g, 0) : -2
  const ctrl1 = g.mode === 'vs' ? controlledOf(g, 1) : -1
  for (const p of g.state.players) {
    const airborne = p.y < FLOOR - 1
    // schaduw
    ctx.beginPath()
    ctx.ellipse(p.x, FLOOR + 8, 26 * (1 - (FLOOR - p.y) / 500), 7, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fill()
    // benen
    ctx.fillStyle = '#1d2430'
    ctx.fillRect(p.x - 12, p.y - 26, 9, 26)
    ctx.fillRect(p.x + 3, p.y - 26, 9, 26)
    // hemd
    ctx.fillStyle = TEAM_COLORS[p.team]
    ctx.beginPath()
    ctx.ellipse(p.x, p.y - 44, 17, 22, 0, 0, Math.PI * 2)
    ctx.fill()
    // armen: recht omhoog bij een blok, hoog bij springen/slaan, zijwaarts bij een duik.
    ctx.strokeStyle = '#e8b48c'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    const up = airborne || p.swingT > 0.12
    const diving = p.diveT > 0
    const blocking = p.blockT > 0
    ctx.beginPath()
    if (blocking) {
      // beide handen strak omhoog (muurtje)
      ctx.moveTo(p.x - 8, p.y - 52); ctx.lineTo(p.x - 8, p.y - 92)
      ctx.moveTo(p.x + 8, p.y - 52); ctx.lineTo(p.x + 8, p.y - 92)
    } else if (diving) {
      // languit naar de bal: armen gestrekt opzij
      const dd = Math.sign(g.state.ball.x - p.x) || 1
      ctx.moveTo(p.x, p.y - 48); ctx.lineTo(p.x + dd * 34, p.y - 40)
      ctx.moveTo(p.x, p.y - 46); ctx.lineTo(p.x - dd * 14, p.y - 30)
    } else {
      ctx.moveTo(p.x - 14, p.y - 52); ctx.lineTo(p.x - 24, up ? p.y - 84 : p.y - 34)
      ctx.moveTo(p.x + 14, p.y - 52); ctx.lineTo(p.x + 24, up ? p.y - 84 : p.y - 34)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
    // kop
    const hr = 24
    const hy = p.y - 78 + Math.sin(now * 0.003 + p.id) * 2
    const img = faces[p.face]
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(p.x, hy, hr, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, p.x - hr, hy - hr, hr * 2, hr * 2)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(p.x, hy, hr, 0, Math.PI * 2)
    ctx.strokeStyle = TEAM_COLORS[p.team]
    ctx.lineWidth = 2.5
    ctx.stroke()
    // besturings-marker
    if (p.id === ctrl0 || p.id === ctrl1 || (g.mode === 'coop' && p.team === 0)) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(p.x, hy - hr - 18)
      ctx.lineTo(p.x - 7, hy - hr - 28)
      ctx.lineTo(p.x + 7, hy - hr - 28)
      ctx.closePath()
      ctx.fill()
    }
  }

  // Bal.
  const b = g.state.ball
  ctx.beginPath()
  ctx.ellipse(b.x, FLOOR + 8, BALL_R * (1 - (FLOOR - b.y) / 900), 5, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
  ctx.fillStyle = '#f6e8c8'
  ctx.fill()
  ctx.strokeStyle = 'rgba(180,120,40,0.7)'
  ctx.lineWidth = 1.6
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(b.x, b.y, BALL_R * 0.85, 0.5, 2.4)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(b.x, b.y, BALL_R * 0.85, Math.PI + 0.5, Math.PI + 2.4)
  ctx.stroke()

  // Serve-hint.
  if (g.phase === 'serve') {
    ctx.textAlign = 'center'
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    const humanServes = g.state.serving === 0 || g.mode === 'vs'
    ctx.fillText(humanServes ? `${TEAM_NAMES[g.state.serving]} serveert — druk op je slag-knop` : `${TEAM_NAMES[g.state.serving]} (computer) serveert…`, W / 2, 120)
  }

  ctx.restore()

  // HUD.
  ctx.textAlign = 'center'
  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = TEAM_COLORS[0]
  ctx.fillText(`${TEAM_NAMES[0]} ${g.score[0]}`, cw / 2 - 90, 34)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText('—', cw / 2, 34)
  ctx.fillStyle = TEAM_COLORS[1]
  ctx.fillText(`${g.score[1]} ${TEAM_NAMES[1]}`, cw / 2 + 90, 34)
  ctx.font = '11px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText(`eerste tot ${WIN_SCORE} · aanrakingen: ${g.state.touches}/3`, cw / 2, 52)
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
