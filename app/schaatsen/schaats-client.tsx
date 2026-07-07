'use client'

// De Elfkoppentocht — vrij 2D-schaatsen langs 11 steden over een kronkelende tocht.
// Je stuurt zélf met WASD (de baan slingert alle kanten op); tegen de boarding verlies je vaart.
// Sprint, slipstream, scheuren ontwijken, koek-en-zopie pakken, kluunzones ram-spatie.
// Jij tegen vijf AI-koppen; wie het eerst in Leeuwarden is wint het kruisje.

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  KLUUN_TAP_DIST, TRACK_HALF_W, aiSteer, generateTrack, inKluun, pointAt, stepRacer, worldPos,
  type Racer, type Track,
} from '@/lib/schaats/race'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile, isCoarsePointer } from '@/components/playground/mobile-play'
import { createSfx, type Sfx } from '@/components/playground/sfx'
import { TouchGamepad } from '@/components/playground/touch-gamepad'
import { FacePicker, POOL_ALPHA } from '@/components/playground/face-picker'

const FIXED_DT = 1 / 120
const RACERS = 6

const DIFFICULTY = [
  { label: 'Makkelijk', val: 0.25 },
  { label: 'Normaal', val: 0.55 },
  { label: 'Pittig', val: 0.85 },
]

type Game = {
  track: Track
  racers: Racer[]
  difficulty: number
  raceT: number
  countdown: number // >0 = aftellen voor de start
  mashTaps: number[] // spatie-taps (timestamps) voor het klunen
  over: boolean
}

export default function SchaatsClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const keysRef = useRef<Set<string>>(new Set())

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [difficulty, setDifficulty] = useState(0.55)
  const [youPick, setYouPick] = useState(-1)
  const [popup, setPopup] = useState<{ text: string; color: string; n: number } | null>(null)
  const [standings, setStandings] = useState<{ rows: { name: string; time: number | null }[] } | null>(null)
  const popupN = useRef(0)
  const tuTuRef = useRef<HTMLAudioElement | null>(null) // boost-geluid
  const sfxRef = useRef<Sfx | null>(null)

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
    const a = new window.Audio('/sfx/tu-tu.mp3')
    a.preload = 'auto'
    tuTuRef.current = a
    sfxRef.current = createSfx(['crack', 'fall', 'finish'])
  }, [])

  const startMatch = useCallback(() => {
    // Jouw schaatser (index 0) = de gekozen collega; de rest willekeurig eromheen.
    const you = youPick >= 0 ? POOL_ALPHA[youPick] : null
    const others = [...PLAYER_POOL].filter((p) => !you || p.face !== you.face).sort(() => Math.random() - 0.5)
    const pool = (you ? [you, ...others] : others).slice(0, RACERS)
    const track = generateTrack()
    const racers: Racer[] = pool.map((p, i) => {
      // Startgrid: net achter de start, in 2 rijtjes, lateraal verspreid over de baan.
      const startPos = worldPos(track, -30 - Math.floor(i / 3) * 30, (i % 3 - 1) * 34)
      return {
        face: p.face,
        name: i === 0 ? `${p.name} (jij)` : p.name,
        isHuman: i === 0,
        x: startPos.x, y: startPos.y, vx: 0, vy: 0, seg: 0, s: -30,
        speed: 0, stamina: 1, stumbleT: 0, boostT: 0, lastZopie: -1, gates: 0, finishT: null,
      }
    })
    gameRef.current = { track, racers, difficulty, raceT: 0, countdown: 3.2, mashTaps: [], over: false }
    setPopup(null)
    setStandings(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [difficulty, youPick])

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

    const update = (g: Game, dt: number) => {
      if (g.countdown > 0) {
        g.countdown -= dt
        return
      }
      g.raceT += dt
      const human = g.racers[0]

      // Mens-invoer: vrije 2D-duwrichting met WASD/pijltjes (zelf mikken).
      const ax = ((keys.has('ArrowRight') || keys.has('KeyD')) ? 1 : 0) - ((keys.has('ArrowLeft') || keys.has('KeyA')) ? 1 : 0)
      const ay = ((keys.has('ArrowDown') || keys.has('KeyS')) ? 1 : 0) - ((keys.has('ArrowUp') || keys.has('KeyW')) ? 1 : 0)
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
      // Kluun-afstand uit de spatie-taps van de afgelopen tick (edge-gebaseerd, zie keydown).
      let kluunDist = 0
      if (inKluun(g.track, human.s) && g.mashTaps.length) {
        kluunDist = g.mashTaps.length * KLUUN_TAP_DIST
        g.mashTaps = []
      }

      for (const r of g.racers) {
        const events = r.isHuman
          ? stepRacer(g.track, r, g.racers, ax, ay, sprint, kluunDist, dt, g.raceT)
          : (() => {
              const a = aiSteer(g.track, r, g.racers, g.difficulty)
              return stepRacer(g.track, r, g.racers, a.ax, a.ay, a.sprint, inKluun(g.track, r.s) ? a.kluunDist : 0, dt, g.raceT)
            })()
        for (const ev of events) {
          if (!r.isHuman && ev.type !== 'finish') continue
          if (ev.type === 'city') show(`📍 ${ev.name}! (${ev.n}/11)`, '#7db8e8')
          else if (ev.type === 'stumble') { if (r.isHuman) { sfxRef.current?.play('crack'); sfxRef.current?.play('fall') } show('😬 Scheur in het ijs!', '#ff5a4d') }
          else if (ev.type === 'zopie' && r.isHuman) {
            const a = tuTuRef.current
            if (a) { try { a.currentTime = 0; void a.play() } catch { /* autoplay geweigerd → stil */ } }
            show('☕ Koek-en-zopie! Warme chocomel → BOOST!', '#e8a34d')
          }
          else if (ev.type === 'finish' && r.isHuman) {
            sfxRef.current?.play('finish')
            const pos = g.racers.filter((q) => q.finishT !== null).length
            show(pos === 1 ? '🏆 Het kruisje — als eerste binnen!' : `🏁 Binnen! (${pos}e)`, '#F4B92E')
          }
        }
      }

      // Klaar? (mens binnen + iedereen binnen, of 12s na de mens)
      if (!g.over && human.finishT !== null) {
        const allDone = g.racers.every((r) => r.finishT !== null)
        if (allDone || g.raceT > human.finishT + 12) {
          g.over = true
          const rows = [...g.racers]
            .sort((a, b) => (a.finishT ?? 1e9) - (b.finishT ?? 1e9))
            .map((r) => ({ name: r.name, time: r.finishT }))
          setStandings({ rows })
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
      draw(ctx, canvas, g, facesRef.current, now)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      if (e.code === 'Space' && !e.repeat) gameRef.current?.mashTaps.push(1) // kluun-tap (edge)
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

  const fmt = (t: number | null) => t === null ? 'DNF' : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/elfstedentocht.png" alt="De Elfkoppentocht" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Moeilijkheid">
              <Seg options={DIFFICULTY.map((d) => d.label)} value={DIFFICULTY.findIndex((d) => d.val === difficulty)} onChange={(i) => setDifficulty(DIFFICULTY[i].val)} />
            </MenuRow>
            <FacePicker label="Jouw schaatser" pick={youPick} onPick={setYouPick} color="#9FC4E8" />
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
              Een random gegenereerde tocht langs 11 steden, tegen vijf collega&apos;s. Slipstream, scheuren en twee kluunzones onderweg.
            </p>
            <button onClick={startMatch}
              className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
              It giet oan! ⛸️
            </button>
          </div>

          <div className="max-w-md text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            WASD / pijltjes = zelf schaatsen (alle kanten op) · shift = sprint · blijf op het ijs (rand = snelheidsverlies)<br />
            vlak achter iemand = slipstream · ⛄ scheuren ontwijken · ☕ koek-en-zopie = boost · kluunzone: RAM spatie · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          {isTouch && !portrait && (
            <TouchGamepad dir="full" buttons={[
              { code: 'ShiftLeft', label: 'Sprint', color: 'border-cyan-300/40 bg-cyan-500/25' },
              { code: 'Space', label: 'Kluun', color: 'border-amber-300/50 bg-amber-500/30', big: true },
            ]} />
          )}
          {isTouch && portrait && <RotateNotice game="De Elfkoppentocht" />}
          <button onClick={() => setStage('menu')}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[12%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-4xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: popup.color }}>
                {popup.text}
              </h2>
            </div>
          )}

          {standings && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-wk-surface p-8 text-center animate-fade-up">
                <h2 className="font-score text-4xl uppercase text-wk-gold">Uitslag 🏁</h2>
                <table className="font-mono text-sm">
                  <tbody>
                    {standings.rows.map((r, i) => (
                      <tr key={r.name} className={i === 0 ? 'text-wk-gold' : 'text-wk-text'}>
                        <td className="px-3 py-1 text-right">{i + 1}.</td>
                        <td className="px-3 py-1 text-left">{i === 0 ? '🏆 ' : ''}{r.name}</td>
                        <td className="px-3 py-1">{fmt(r.time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-3 pt-1">
                  <button onClick={startMatch} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">Nieuwe tocht</button>
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
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game, faces: Record<string, HTMLImageElement>, now: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // winterlucht
  ctx.fillStyle = '#dfe8f2'
  ctx.fillRect(0, 0, cw, ch)

  const t = g.track
  const human = g.racers[0]
  const ZOOM = 1.7 * (isCoarsePointer() ? 1.4 : 1) // flink ingezoomd (mobiel: extra)
  const cam = { x: human.x, y: human.y }

  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.scale(ZOOM, ZOOM)
  ctx.translate(-cam.x, -cam.y)
  const view = Math.max(cw, ch) / ZOOM // ruwe zichtstraal voor culling

  // Sneeuwvlakte-stippen (deterministisch op wereldgrid).
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  const gx0 = Math.floor((cam.x - view) / 90) * 90
  const gy0 = Math.floor((cam.y - view) / 90) * 90
  for (let x = gx0; x < cam.x + view; x += 90) {
    for (let y = gy0; y < cam.y + view; y += 90) {
      const hsh = ((x * 2654435761 + y * 40503) >>> 0) % 100
      if (hsh < 22) ctx.fillRect(x + (hsh % 9) * 6, y + hsh, 3, 3)
    }
  }

  // De tocht: donkere oever + ijs er bovenop.
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(t.pts[0].x, t.pts[0].y)
    for (const p of t.pts) ctx.lineTo(p.x, p.y)
  }
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  path()
  ctx.strokeStyle = '#9fb08c'
  ctx.lineWidth = TRACK_HALF_W * 2 + 28
  ctx.stroke()
  path()
  ctx.strokeStyle = '#cfe3f0'
  ctx.lineWidth = TRACK_HALF_W * 2
  ctx.stroke()
  path()
  ctx.strokeStyle = 'rgba(160,190,215,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Kluunzones: landstroken dwars over de tocht.
  for (const z of t.kluun) {
    for (let s = z.s0; s <= z.s1; s += 26) {
      const { p, tx, ty } = pointAt(t, s)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(Math.atan2(ty, tx))
      ctx.fillStyle = '#c2a068'
      ctx.fillRect(-13, -TRACK_HALF_W - 8, 26, TRACK_HALF_W * 2 + 16)
      ctx.restore()
    }
    const mid = pointAt(t, (z.s0 + z.s1) / 2)
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#5b4630'
    ctx.fillText('KLUNEN! 🥾', mid.p.x, mid.p.y - TRACK_HALF_W - 18)
  }

  // Steden-poorten.
  for (let i = 0; i < t.gates.length; i++) {
    const gt = t.gates[i]
    const a = Math.atan2(gt.ty, gt.tx)
    ctx.save()
    ctx.translate(gt.x, gt.y)
    ctx.rotate(a)
    ctx.fillStyle = '#8a5a2b'
    ctx.fillRect(-4, -TRACK_HALF_W - 26, 8, 26)
    ctx.fillRect(-4, TRACK_HALF_W, 8, 26)
    ctx.strokeStyle = i === t.gates.length - 1 ? '#E63946' : '#F4B92E'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(0, -TRACK_HALF_W - 20)
    ctx.lineTo(0, TRACK_HALF_W + 20)
    ctx.stroke()
    ctx.rotate(-a)
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#22344a'
    ctx.fillText(`${gt.name}${i === t.gates.length - 1 ? ' 🏁' : ''}`, 0, -TRACK_HALF_W - 34)
    ctx.restore()
  }

  // Scheuren (obstakel) — donkere spleet met schaduwrand, duidelijk zichtbaar.
  for (const c of t.cracks) {
    ctx.beginPath()
    ctx.ellipse(c.x, c.y + 3, 20, 7, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(20,30,45,0.25)'
    ctx.fill()
    ctx.strokeStyle = '#0e1a28'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(c.x - 18, c.y - 5)
    ctx.lineTo(c.x - 5, c.y + 5)
    ctx.lineTo(c.x + 6, c.y - 6)
    ctx.lineTo(c.x + 18, c.y + 4)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(120,170,215,0.5)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Koek-en-zopie (booster): zweeft met een schaduw eronder + gloed, duidelijk oppikbaar.
  for (const z of t.zopie) {
    const bob = Math.sin(now * 0.004 + z.x * 0.01) * 6
    // schaduw op het ijs
    ctx.beginPath()
    ctx.ellipse(z.x, z.y + 20, 20, 6, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fill()
    // gloed
    const glow = ctx.createRadialGradient(z.x, z.y - bob, 4, z.x, z.y - bob, 34)
    glow.addColorStop(0, 'rgba(255,210,120,0.5)')
    glow.addColorStop(1, 'rgba(255,210,120,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(z.x, z.y - bob, 34, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(z.x, z.y - bob)
    ctx.fillStyle = '#b23b45'
    ctx.fillRect(-18, -20, 36, 15) // luifel
    ctx.fillStyle = '#f2f4f8'
    for (let k = 0; k < 5; k++) ctx.fillRect(-18 + k * 8, -20, 4, 15)
    ctx.fillStyle = '#6b4a2a'
    ctx.fillRect(-14, -6, 28, 13) // toonbank
    ctx.font = '16px serif'
    ctx.textAlign = 'center'
    ctx.fillText('☕', 0, -24)
    ctx.restore()
  }

  // Schaatsers (achterste in de race eerst → leider bovenop).
  const sorted = [...g.racers].sort((a, b) => a.s - b.s)
  for (const r of sorted) {
    const head = Math.atan2(r.vy, r.vx)
    const moving = r.speed > 30
    const stride = moving ? Math.sin(now * 0.012 + r.x * 0.05) : 0
    // schaduw
    ctx.beginPath()
    ctx.ellipse(r.x, r.y + 8, 17, 6, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fill()
    ctx.save()
    ctx.translate(r.x, r.y)
    ctx.rotate(head + (r.stumbleT > 0 ? Math.sin(now * 0.03) * 0.5 : stride * 0.1))
    ctx.strokeStyle = '#1d2430'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-4, -5); ctx.lineTo(-14 - stride * 5, -8 - stride * 3)
    ctx.moveTo(-4, 5); ctx.lineTo(-14 + stride * 5, 8 - stride * 3)
    ctx.stroke()
    ctx.fillStyle = r.isHuman ? '#F4B92E' : '#4a6fa5'
    ctx.beginPath()
    ctx.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // boost-sliert
    if (r.boostT > 0) {
      ctx.strokeStyle = 'rgba(255,200,90,0.6)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(r.x - r.vx * 0.06, r.y - r.vy * 0.06)
      ctx.lineTo(r.x - r.vx * 0.16, r.y - r.vy * 0.16)
      ctx.stroke()
    }
    // kop (niet mee-geroteerd → gezicht blijft leesbaar)
    const img = faces[r.face]
    const hr = 17
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(r.x, r.y - 16, hr, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, r.x - hr, r.y - 16 - hr, hr * 2, hr * 2)
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(r.x, r.y - 16, hr, 0, Math.PI * 2)
    ctx.strokeStyle = r.isHuman ? '#F4B92E' : 'rgba(30,40,60,0.5)'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }

  ctx.restore()

  // Sneeuw: dwarrelende vlokjes over het hele scherm (cosmetisch, deterministisch per vlok).
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  for (let i = 0; i < 70; i++) {
    const seed = i * 9301 + 49297
    const speed = 22 + (seed % 30)
    const drift = Math.sin(now * 0.0008 + i) * 22
    const x = ((seed % cw) + drift + cw) % cw
    const y = ((seed % ch) + now * 0.001 * speed * 40) % ch
    const r = 1.4 + (i % 3) * 0.9
    ctx.globalAlpha = 0.35 + (i % 4) * 0.16
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // ── HUD ───────────────────────────────────────────────────────────────────
  const rank = [...g.racers].sort((a, b) => b.s - a.s).findIndex((r) => r.isHuman) + 1
  ctx.textAlign = 'center'
  ctx.font = 'bold 20px monospace'
  ctx.fillStyle = '#1c2a3a'
  const mm = Math.floor(g.raceT / 60)
  const ss = (g.raceT % 60).toFixed(1).padStart(4, '0')
  ctx.fillText(`${rank}e / ${RACERS} · ${human.gates}/11 steden · ${mm}:${ss}`, cw / 2, 34)
  // stamina
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(cw / 2 - 90, 46, 180, 9)
  ctx.fillStyle = human.stamina < 0.25 ? '#E63946' : '#4FA8E0'
  ctx.fillRect(cw / 2 - 90, 46, 180 * human.stamina, 9)
  if (inKluun(t, human.s)) {
    ctx.font = 'bold 24px monospace'
    ctx.fillStyle = '#8a4a1d'
    ctx.fillText('🥾 KLUNEN — RAM SPATIE!', cw / 2, ch - 44)
  }

  // Minimap rechtsonder.
  const mmW = 190
  const mmH = 130
  const pad = 14
  const xs = t.pts.map((p) => p.x)
  const ys = t.pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const mscale = Math.min((mmW - 20) / Math.max(1, maxX - minX), (mmH - 20) / Math.max(1, maxY - minY))
  const mx = (x: number) => cw - mmW - pad + 10 + (x - minX) * mscale
  const my = (y: number) => ch - mmH - pad + 10 + (y - minY) * mscale
  ctx.fillStyle = 'rgba(20,30,45,0.75)'
  ctx.fillRect(cw - mmW - pad, ch - mmH - pad, mmW, mmH)
  ctx.strokeStyle = 'rgba(160,200,235,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(mx(t.pts[0].x), my(t.pts[0].y))
  for (const p of t.pts) ctx.lineTo(mx(p.x), my(p.y))
  ctx.stroke()
  for (const r of g.racers) {
    ctx.beginPath()
    ctx.arc(mx(r.x), my(r.y), r.isHuman ? 4 : 3, 0, Math.PI * 2)
    ctx.fillStyle = r.isHuman ? '#F4B92E' : '#9fc4e8'
    ctx.fill()
  }

  // Countdown.
  if (g.countdown > 0) {
    const n = Math.ceil(g.countdown)
    ctx.font = '900 110px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(30,42,58,0.9)'
    ctx.fillText(g.countdown > 3 ? 'Klaar…' : String(n), cw / 2, ch / 2 - 40)
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
