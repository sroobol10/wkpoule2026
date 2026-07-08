'use client'

// Tafelkoppen — 3D tafeltennis. De bal leeft in 3D (x/hoogte/diepte) en wordt perspectivisch
// op het canvas geprojecteerd → de tafel loopt als een trapezium weg. Jij bestuurt je rode bat
// onderaan met de MUIS (of A/D); de tegenstander bovenaan toont z'n bat mét z'n kop erboven.
// Positioneer je bat op tijd bij de bal → hij slaat automatisch terug richting de overkant.

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  BALL_R, HW, L, NET_H, NET_Z, PADDLE_REACH, SWING_DUR, CHARGE_MAX,
  aiPaddleX, makeMatch, step, type PongMatch, type PongPlayer, type PongInput, type PongEvent,
} from '@/lib/pong/sim'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile, isCoarsePointer } from '@/components/playground/mobile-play'
import { TouchGamepad } from '@/components/playground/touch-gamepad'
import { GameNet, makeRoomCode } from '@/components/playground/game-net'
import { createSfx, type Sfx } from '@/components/playground/sfx'

const FIXED_DT = 1 / 120
type Mode = 'ai' | 'online'
const IDLE_PINPUT: PongInput = { aimX: 0, aimDepth: 0.55 }
type PPick = { face: string; name: string }
type PongStart = { picks: [PPick, PPick]; target: number }
type PongSnap = { m: PongMatch; ev: PongEvent[] }
type PongNet = GameNet<PongInput, PongSnap, PongStart, PPick>
const POOL_ALPHA = [...PLAYER_POOL].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
const DIFFICULTY = [
  { label: 'Makkelijk', val: 0.3 },
  { label: 'Normaal', val: 0.58 },
  { label: 'Pittig', val: 0.85 },
]

// ── Perspectief-projectie (design-ruimte RW×RH; de ctx wordt geschaald naar het canvas) ──
const RW = 1200
const RH = 820
const CX = 600
const CAMY = 140 // camerahoogte boven de tafel
const CAMZ = -170 // camera staat achter de speler-rand
const FOCAL = 660 // groter = tafel vult meer beeld
const CY = 205 // verdwijnpunt-hoogte op het scherm
const PADDLE_Y = 24 // hoogte van het bat-vlak boven de tafel

type Proj = { sx: number; sy: number; p: number }
const project = (x: number, y: number, z: number): Proj => {
  const p = FOCAL / (z - CAMZ)
  return { sx: CX + x * p, sy: CY + (CAMY - y) * p, p }
}

type Game = {
  match: PongMatch
  difficulty: number
  aimX: number // -1..1 — waar op de overkant je mikt (links/rechts)
  aimDepth: number // 0..1 — kort/diep
  shakeT: number
  net?: 'host' | 'guest' // online-rol
}

export default function PongClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const keysRef = useRef<Set<string>>(new Set())
  const aimXRef = useRef(0) // -1..1 mikrichting uit de muis (of pijltjes)
  const aimDepthRef = useRef(0.55) // 0..1 mikdiepte uit de muis-y
  const sixSevenRef = useRef<HTMLAudioElement | null>(null)
  const wowRef = useRef<HTMLAudioElement | null>(null)
  const sfxRef = useRef<Sfx | null>(null)
  useEffect(() => { sfxRef.current = createSfx(['pingpong-hit', 'pingpong-net']) }, [])
  // Online 1v1
  const netRef = useRef<PongNet | null>(null)
  const guestInputRef = useRef<PongInput>(IDLE_PINPUT)
  const guestPickRef = useRef<PPick | null>(null)
  const pendingSnapRef = useRef<PongSnap | null>(null)
  const lastSnapSendRef = useRef(0)
  const lastInputSendRef = useRef(0)

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [mode, setMode] = useState<Mode>('ai')
  const [difficulty, setDifficulty] = useState(0.58)
  const [target, setTarget] = useState(11)
  const [youPick, setYouPick] = useState(-1)
  const [oppPick, setOppPick] = useState(-1)
  const [netRole, setNetRole] = useState<'host' | 'guest' | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [netConnected, setNetConnected] = useState(false)
  const [popup, setPopup] = useState<{ text: string; color: string; n: number } | null>(null)
  const [matchOver, setMatchOver] = useState<{ name: string; score: [number, number] } | null>(null)
  const popupN = useRef(0)

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
  }, [])

  // Geluiden voorladen: spanning bij 6-7/7-6 + wow-factor bij een perfecte smash.
  useEffect(() => {
    const a = new window.Audio('/sfx/six-seven.mp3'); a.preload = 'auto'; sixSevenRef.current = a
    const w = new window.Audio('/sfx/anime-wow.mp3'); w.preload = 'auto'; wowRef.current = w
  }, [])

  const startMatch = useCallback(() => {
    const shuffled = [...PLAYER_POOL].sort(() => Math.random() - 0.5)
    const you = youPick >= 0 ? POOL_ALPHA[youPick] : shuffled[0]
    let opp = oppPick >= 0 ? POOL_ALPHA[oppPick] : shuffled.find((p) => p.face !== you.face)!
    if (opp.face === you.face) opp = shuffled.find((p) => p.face !== you.face) ?? shuffled[1]
    gameRef.current = {
      match: makeMatch([{ face: you.face, name: you.name }, { face: opp.face, name: `${opp.name} (CPU)` }], target),
      difficulty,
      aimX: 0,
      aimDepth: 0.55,
      shakeT: 0,
    }
    aimXRef.current = 0
    aimDepthRef.current = 0.55
    setPopup(null)
    setMatchOver(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [difficulty, target, youPick, oppPick])

  // ── Online 1v1 ──────────────────────────────────────────────────────────────
  const pickOf = useCallback((idx: number): PPick => {
    const p = idx >= 0 ? POOL_ALPHA[idx] : POOL_ALPHA[Math.floor(Math.random() * POOL_ALPHA.length)]
    return { face: p.face, name: p.name }
  }, [])

  const leaveNet = useCallback(() => {
    netRef.current?.leave(); netRef.current = null
    guestPickRef.current = null; pendingSnapRef.current = null
    setNetRole(null); setNetConnected(false); setRoomCode('')
  }, [])

  const startOnlineGame = useCallback((picks: [PPick, PPick], tgt: number, role: 'host' | 'guest') => {
    guestInputRef.current = IDLE_PINPUT
    pendingSnapRef.current = null
    aimXRef.current = 0; aimDepthRef.current = 0.55
    gameRef.current = { match: makeMatch(picks, tgt), difficulty, aimX: 0, aimDepth: 0.55, shakeT: 0, net: role }
    setPopup(null); setMatchOver(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [difficulty])

  const hostGame = useCallback(() => {
    leaveNet()
    const code = makeRoomCode(Date.now())
    setRoomCode(code); setNetRole('host')
    const net: PongNet = new GameNet('pong', 'host', code, {
      onGuestJoined: () => setNetConnected(true),
      onPeerLeft: () => setNetConnected(false),
      onJoin: (pick) => { guestPickRef.current = pick },
      onInput: (cmd) => { guestInputRef.current = cmd },
    })
    net.connect(); netRef.current = net
  }, [leaveNet])

  const joinGame = useCallback(() => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) return
    leaveNet()
    setRoomCode(code); setNetRole('guest')
    const myPick = pickOf(youPick)
    const net: PongNet = new GameNet('pong', 'guest', code, {
      onGuestJoined: () => { setNetConnected(true); net.sendJoin(myPick, myPick.name) },
      onPeerLeft: () => setNetConnected(false),
      onStart: (payload) => startOnlineGame(payload.picks, payload.target, 'guest'),
      onSnapshot: (snap) => { pendingSnapRef.current = snap },
    })
    net.connect(); netRef.current = net
  }, [joinCode, leaveNet, pickOf, youPick, startOnlineGame])

  const startOnlineHost = useCallback(() => {
    const picks: [PPick, PPick] = [pickOf(youPick), guestPickRef.current ?? pickOf(-1)]
    netRef.current?.sendStart({ picks, target })
    startOnlineGame(picks, target, 'host')
  }, [pickOf, youPick, target, startOnlineGame])

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

    // Positioneren gaat automatisch — met de muis MIK je alleen: x = links/rechts op de overkant,
    // y = kort (onder) of diep (boven). Je bat volgt de bal vanzelf.
    const aimFrom = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      aimXRef.current = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width - 0.5) * 2))
      aimDepthRef.current = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
    }
    const onMove = (e: MouseEvent) => aimFrom(e.clientX, e.clientY)
    canvas.addEventListener('mousemove', onMove)
    // Mobiel: sleep met je vinger over het beeld om te mikken (zelfde mapping als de muis).
    const onTouchDrag = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      aimFrom(e.clientX, e.clientY)
      e.preventDefault()
    }
    canvas.addEventListener('pointerdown', onTouchDrag)
    canvas.addEventListener('pointermove', onTouchDrag)

    // Lokale richting-input (toetsen/joystick, of muis-sleep) → PongInput. Links/rechts = plaatsen,
    // omhoog = harde diepe klap, omlaag = kort dinkje. Auto-terugslaan doet de sim.
    const localInput = (g: Game, dt: number): PongInput => {
      const kl = keys.has('KeyA') || keys.has('ArrowLeft')
      const kr = keys.has('KeyD') || keys.has('ArrowRight')
      const kf = keys.has('KeyW') || keys.has('ArrowUp') // omhoog = dieper/harder
      const kb = keys.has('KeyS') || keys.has('ArrowDown') // omlaag = korter/zachter
      if (kl || kr) g.aimX = Math.max(-1, Math.min(1, g.aimX + ((kr ? 1 : 0) - (kl ? 1 : 0)) * 1.9 * dt))
      else g.aimX = aimXRef.current
      if (kf || kb) g.aimDepth = Math.max(0, Math.min(1, g.aimDepth + ((kf ? 1 : 0) - (kb ? 1 : 0)) * 1.6 * dt))
      else g.aimDepth = aimDepthRef.current
      return { aimX: g.aimX, aimDepth: g.aimDepth }
    }

    // Events → geluid/popups/shake, vanuit het perspectief van de lokale speler (0 = host/offline, 1 = gast).
    const applyEvents = (g: Game, events: PongEvent[]) => {
      const me: 0 | 1 = g.net === 'guest' ? 1 : 0
      for (const ev of events) {
        if (ev.type === 'point') {
          g.shakeT = 0.18
          if (ev.reason === 'in het net') sfxRef.current?.play('pingpong-net')
          const [sa, sb] = g.match.score
          if ((sa === 6 && sb === 7) || (sa === 7 && sb === 6)) {
            const a = sixSevenRef.current
            if (a) { try { a.currentTime = 0; void a.play() } catch { /* autoplay geweigerd → stil */ } }
          }
          show(ev.to === me ? `Punt! 🏓 (${ev.reason})` : `Tegenpunt — ${ev.reason}`, ev.to === me ? '#4FA8E0' : '#E63946')
        } else if (ev.type === 'hit') {
          sfxRef.current?.play('pingpong-hit', 0.5 + ev.power * 0.5) // de bat-tik (harder = luider)
          if (ev.by !== me) continue
          if (ev.power > 0.6) g.shakeT = Math.max(g.shakeT, ev.power * 0.2)
          if (ev.power > 0.72) show(`💥 ${ev.face === 'fore' ? 'FOREHAND' : 'BACKHAND'} SMASH!`, '#f4b92e')
          else if (ev.power < 0.26) show(`🪁 boogbal (${ev.face === 'fore' ? 'forehand' : 'backhand'})`, '#7db8e8')
          if (ev.sweet && ev.power > 0.85) {
            const w = wowRef.current
            if (w) { try { w.currentTime = 0; void w.play() } catch { /* autoplay geweigerd → stil */ } }
          }
        } else if (ev.type === 'cat') {
          g.shakeT = Math.max(g.shakeT, 0.25)
          show('🐱 KAT! Bal weggemept!', '#f4b92e')
        } else if (ev.type === 'banana') {
          g.shakeT = Math.max(g.shakeT, 0.15)
          show('🍌 Uitgegleden!', '#f0d040')
        } else if (ev.type === 'serve') {
          const gm = g.match
          if (gm.ballScale > 1.4) show('🎈 REUZENBAL!', '#5fbf6e')
          else if (gm.ballScale < 0.8) show('🐜 MINI-BAL!', '#e0517a')
          else if (Math.abs(gm.wind) > 40) show(`🌬️ ZIJWIND ${gm.wind < 0 ? '←' : '→'}`, '#7db8e8')
          else if (gm.banana) show('🍌 Bananenschil op tafel!', '#f0d040')
        } else if (ev.type === 'over') {
          setMatchOver({ name: g.match.players[ev.winner].name, score: [g.match.score[0], g.match.score[1]] })
        }
      }
    }

    const update = (g: Game, dt: number) => {
      const in0 = localInput(g, dt)
      const aiX = g.net ? 0 : aiPaddleX(g.match)
      const guest = g.net === 'host' ? guestInputRef.current : undefined
      const events = step(g.match, in0, aiX, g.difficulty, dt, guest)
      applyEvents(g, events)
      return events
    }

    let raf = 0
    let last = performance.now()
    let acc = 0
    let hostEvents: PongEvent[] = []
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const g = gameRef.current
      if (!g) return
      const rdt = Math.min(0.1, (now - last) / 1000)
      last = now

      // ── Gast: geen sim — render de host-snapshots en stuur je eigen input (speler 1). ──
      if (g.net === 'guest') {
        const snap = pendingSnapRef.current
        if (snap) { g.match = snap.m; if (snap.ev.length) applyEvents(g, snap.ev); pendingSnapRef.current = null }
        if (now - lastInputSendRef.current > 33) {
          netRef.current?.sendInput(localInput(g, rdt))
          lastInputSendRef.current = now
        }
        if (g.shakeT > 0) g.shakeT = Math.max(0, g.shakeT - rdt)
        draw(ctx, canvas, g, facesRef.current)
        return
      }

      acc += rdt
      while (acc >= FIXED_DT) {
        const ev = update(g, FIXED_DT)
        if (g.net === 'host' && ev.length) for (const e of ev) hostEvents.push(e)
        if (g.shakeT > 0) g.shakeT = Math.max(0, g.shakeT - FIXED_DT)
        acc -= FIXED_DT
      }
      if (g.net === 'host' && now - lastSnapSendRef.current > 33) {
        netRef.current?.sendSnapshot({ m: g.match, ev: hostEvents })
        hostEvents = []
        lastSnapSendRef.current = now
      }
      draw(ctx, canvas, g, facesRef.current)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
      if (e.code === 'Escape') { leaveNet(); setStage('menu') }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('pointerdown', onTouchDrag)
      canvas.removeEventListener('pointermove', onTouchDrag)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keys.clear()
    }
  }, [stage, leaveNet])

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/tafelkoppen.png" alt="Tafelkoppen" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-4xl space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Modus">
              <Seg options={['Vs computer', 'Online 1v1']} value={mode === 'ai' ? 0 : 1}
                onChange={(i) => { setMode(i === 0 ? 'ai' : 'online'); if (i !== 1) leaveNet() }} />
            </MenuRow>
            {mode === 'ai' && (
              <MenuRow label="Moeilijkheid">
                <Seg options={DIFFICULTY.map((d) => d.label)} value={DIFFICULTY.findIndex((d) => d.val === difficulty)} onChange={(i) => setDifficulty(DIFFICULTY[i].val)} />
              </MenuRow>
            )}
            {(mode === 'ai' || netRole === 'host') && (
              <MenuRow label="Tot">
                <Seg options={['7', '11']} value={target === 7 ? 0 : 1} onChange={(i) => setTarget(i === 0 ? 7 : 11)} />
              </MenuRow>
            )}

            {mode === 'ai' ? (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="sm:border-r sm:border-white/10 sm:pr-5">
                    <FacePicker label="Jij" pick={youPick} onPick={(i) => setYouPick(youPick === i ? -1 : i)} color="#4FA8E0" />
                  </div>
                  <FacePicker label="Tegenstander" pick={oppPick} onPick={(i) => setOppPick(oppPick === i ? -1 : i)} color="#E63946" />
                </div>
                <button onClick={startMatch}
                  className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
                  Opslaan 🏓
                </button>
              </>
            ) : netRole === null ? (
              <div className="space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-wk-muted">Speel 1v1 tegen een collega op een ander scherm.</p>
                <button onClick={hostGame}
                  className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-3 font-score text-2xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
                  Nieuwe kamer maken
                </button>
                <div className="flex items-center gap-2">
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="CODE"
                    className="w-28 rounded-lg border border-white/15 bg-wk-bg2 px-3 py-2 text-center font-mono text-lg uppercase tracking-[0.3em] text-wk-text outline-none focus:border-wk-gold/60" />
                  <button onClick={joinGame} disabled={joinCode.trim().length < 4}
                    className="flex-1 rounded-lg border border-white/20 py-2 font-mono text-sm uppercase tracking-[0.14em] text-wk-soft transition hover:border-white/40 disabled:opacity-40">
                    Meedoen met code
                  </button>
                </div>
              </div>
            ) : netRole === 'host' ? (
              <div className="space-y-3">
                <p className="text-center font-mono text-sm uppercase tracking-[0.16em] text-wk-soft">
                  Kamercode: <span className="font-score text-3xl tracking-[0.3em] text-wk-gold">{roomCode}</span>
                </p>
                <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: netConnected ? '#5fbf6e' : '#f4b92e' }}>
                  {netConnected ? '✓ Tegenstander verbonden' : 'Wachten op tegenstander…'}
                </p>
                <FacePicker label="Jij (dichtbij)" pick={youPick} onPick={(i) => setYouPick(youPick === i ? -1 : i)} color="#4FA8E0" />
                <div className="flex gap-2">
                  <button onClick={startOnlineHost} disabled={!netConnected}
                    className="flex-1 rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-3 font-score text-2xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25 disabled:opacity-40">
                    Opslaan 🏓
                  </button>
                  <button onClick={leaveNet} className="rounded-xl border border-white/15 px-4 font-mono text-xs uppercase tracking-[0.14em] text-wk-soft hover:border-white/35">Annuleren</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: netConnected ? '#5fbf6e' : '#f4b92e' }}>
                  {netConnected ? `✓ Verbonden met kamer ${roomCode} — wacht tot de host serveert…` : `Verbinden met ${roomCode}…`}
                </p>
                <FacePicker label="Jij (overkant)" pick={youPick}
                  onPick={(i) => { const v = youPick === i ? -1 : i; setYouPick(v); if (netConnected) { const pk = pickOf(v); netRef.current?.sendJoin(pk, pk.name) } }}
                  color="#E63946" />
                <button onClick={leaveNet} className="w-full rounded-xl border border-white/15 py-2 font-mono text-xs uppercase tracking-[0.14em] text-wk-soft hover:border-white/35">Annuleren</button>
              </div>
            )}
          </div>

          <div className="max-w-xl text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            je bat volgt de bal automatisch en slaat &apos;m ook automatisch terug — jij STUURT alleen<br />
            ← / → (of A/D · muis) = links/rechts mikken · ↑ = harde diepe klap · ↓ = kort dinkje · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full cursor-none" style={{ touchAction: 'none' }} />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          {isTouch && !portrait && (
            <TouchGamepad dir="full" buttons={[]} />
          )}
          {isTouch && portrait && <RotateNotice game="Tafelkoppen" />}
          <button onClick={() => { leaveNet(); setStage('menu') }}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[16%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-4xl uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ color: popup.color }}>{popup.text}</h2>
            </div>
          )}

          {matchOver && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex flex-col items-center gap-4 text-center animate-fade-up">
                <h2 className="font-score text-7xl uppercase text-wk-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">{matchOver.name} wint! 🏆</h2>
                <p className="font-score text-5xl text-white">{matchOver.score[0]} <span className="text-white/40">:</span> {matchOver.score[1]}</p>
                <div className="flex gap-3 pt-2">
                  {!netRole && <button onClick={startMatch} className="rounded-xl border border-wk-gold/60 bg-wk-gold/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-gold hover:bg-wk-gold/25">Revanche</button>}
                  <button onClick={() => { leaveNet(); setStage('menu') }} className="rounded-xl border border-white/15 px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-wk-soft hover:border-white/35">Menu</button>
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
  ctx.fillStyle = '#0c1420'
  ctx.fillRect(0, 0, cw, ch)

  const S = Math.min(cw / RW, ch / RH) * (isCoarsePointer() ? 1.12 : 1) // mobiel: iets ingezoomd
  const ox = (cw - RW * S) / 2 + (g.shakeT > 0 ? (Math.random() - 0.5) * 10 * g.shakeT : 0)
  const oy = (ch - RH * S) / 2 + (g.shakeT > 0 ? (Math.random() - 0.5) * 10 * g.shakeT : 0)
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(S, S)

  const m = g.match
  const b = m.ball

  // Sporthal: houten muur boven, parketvloer onder (verdwijnpunt rond CY).
  ctx.fillStyle = '#c79a5b'
  ctx.fillRect(0, 0, RW, RH)
  const wall = ctx.createLinearGradient(0, 0, 0, CY + 40)
  wall.addColorStop(0, '#b98f52')
  wall.addColorStop(1, '#d8b478')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, RW, CY + 40)
  ctx.strokeStyle = 'rgba(90,60,25,0.25)'
  ctx.lineWidth = 2
  for (let y = 24; y < CY + 40; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(RW, y); ctx.stroke() }
  for (let x = 40; x < RW; x += 200) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CY + 40); ctx.stroke() }
  ctx.fillStyle = 'rgba(120,80,35,0.12)'
  for (let x = 100; x < RW; x += 260) ctx.fillRect(x, CY + 40, 90, RH)

  // Tafel-hoeken.
  const nl = project(-HW, 0, 0)
  const nr = project(HW, 0, 0)
  const fr = project(HW, 0, L)
  const fl = project(-HW, 0, L)
  // schaduw onder de tafel
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.moveTo(nl.sx, nl.sy + 30); ctx.lineTo(nr.sx, nr.sy + 30); ctx.lineTo(fr.sx, fr.sy + 8); ctx.lineTo(fl.sx, fl.sy + 8)
  ctx.closePath(); ctx.fill()
  // tafelblad
  const grad = ctx.createLinearGradient(0, fl.sy, 0, nl.sy)
  grad.addColorStop(0, '#2f9457')
  grad.addColorStop(1, '#1f7e42')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(nl.sx, nl.sy); ctx.lineTo(nr.sx, nr.sy); ctx.lineTo(fr.sx, fr.sy); ctx.lineTo(fl.sx, fl.sy)
  ctx.closePath(); ctx.fill()
  // witte randen + midden- en zijlijn
  ctx.strokeStyle = '#f2f6fa'
  ctx.lineWidth = 4
  ctx.stroke()
  const midN = project(0, 0, 0)
  const midF = project(0, 0, L)
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(midN.sx, midN.sy); ctx.lineTo(midF.sx, midF.sy); ctx.stroke()

  // Net (quad op z=NET_Z van y=0 tot NET_H).
  const nbl = project(-HW - 6, 0, NET_Z)
  const nbr = project(HW + 6, 0, NET_Z)
  const ntl = project(-HW - 6, NET_H, NET_Z)
  const ntr = project(HW + 6, NET_H, NET_Z)
  ctx.fillStyle = 'rgba(230,240,250,0.22)'
  ctx.beginPath()
  ctx.moveTo(nbl.sx, nbl.sy); ctx.lineTo(nbr.sx, nbr.sy); ctx.lineTo(ntr.sx, ntr.sy); ctx.lineTo(ntl.sx, ntl.sy)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(ntl.sx, ntl.sy); ctx.lineTo(ntr.sx, ntr.sy); ctx.stroke() // bovenband
  // maasjes
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  for (let i = 1; i < 10; i++) {
    const tb = project(-HW - 6 + (2 * (HW + 6)) * (i / 10), 0, NET_Z)
    const tt = project(-HW - 6 + (2 * (HW + 6)) * (i / 10), NET_H, NET_Z)
    ctx.beginPath(); ctx.moveTo(tb.sx, tb.sy); ctx.lineTo(tt.sx, tt.sy); ctx.stroke()
  }

  // Mik-reticle op de overkant: waar je 'm heen stuurt (links/rechts uit aimX, kort/diep uit aimDepth).
  {
    const tx = Math.max(-1, Math.min(1, g.aimX)) * (HW - 8)
    const tz = NET_Z + (0.28 + 0.5 * Math.max(0, Math.min(1, g.aimDepth))) * (L / 2 - 30) + 20
    const r = project(tx, 0, tz)
    ctx.strokeStyle = 'rgba(90,200,255,0.85)'
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.ellipse(r.sx, r.sy, 16 * r.p, 8 * r.p, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(r.sx - 12 * r.p, r.sy); ctx.lineTo(r.sx + 12 * r.p, r.sy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(r.sx, r.sy - 7 * r.p); ctx.lineTo(r.sx, r.sy + 7 * r.p); ctx.stroke()
  }

  // Tegenstander: lijf + kop + arm die het bat vasthoudt, áchter de verre tafelrand.
  drawOpponent(ctx, faces, m.players[1], b.x)

  // Bananenschil op de tafel (gimmick): gele boog met bruine uiteinden.
  if (m.banana) {
    const ba = project(m.banana.x, 0, m.banana.z)
    ctx.save()
    ctx.translate(ba.sx, ba.sy)
    ctx.scale(ba.p, ba.p * 0.6)
    ctx.strokeStyle = '#f2d040'; ctx.lineWidth = 7; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke()
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI * 0.15, Math.PI * 0.30); ctx.stroke()
    ctx.restore()
  }

  // Bal-schaduw op de tafel (projectie op y=0) — toont de hoogte.
  if (b.live || m.phase === 'serve') {
    const scale = m.ballScale || 1
    const sh = project(b.x, 0, b.z)
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(sh.sx, sh.sy, 7 * sh.p * scale, 3.2 * sh.p * scale, 0, 0, Math.PI * 2)
    ctx.fill()
    // de bal zelf (met vuurspoor als 'ie in brand staat na een smash)
    const bp = project(b.x, b.y, b.z)
    const br = BALL_R * bp.p * scale
    if (b.fire && b.fire > 0) {
      const cols = ['rgba(255,120,20,0.55)', 'rgba(255,200,40,0.55)', 'rgba(255,60,20,0.4)']
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cols[i]
        ctx.beginPath(); ctx.arc(bp.sx - (i + 1) * 3, bp.sy + (i + 1) * 2, br * (1.7 - i * 0.4), 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.beginPath()
    ctx.arc(bp.sx, bp.sy, br, 0, Math.PI * 2)
    ctx.fillStyle = b.fire && b.fire > 0 ? '#ffcf3a' : '#f6e14a'
    ctx.fill()
    ctx.strokeStyle = 'rgba(120,100,20,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Kat (gimmick): pluizige poot die vanaf de zijkant naar de bal reikt en 'm wegmept.
  if (m.cat) {
    const reach = m.cat.phase === 'swipe' ? 1 : 0.25 + 0.4 * Math.min(1, m.cat.t / 0.55)
    const fromLeft = m.cat.x < 0
    const edgeX = fromLeft ? -HW - 10 : HW + 10
    const cx = edgeX + (0 - edgeX) * 0.5 * reach
    const paw = project(cx, 18, m.cat.z)
    ctx.save()
    ctx.translate(paw.sx, paw.sy)
    ctx.fillStyle = '#c9c2b8'
    ctx.beginPath(); ctx.ellipse(0, 0, 20 * paw.p, 15 * paw.p, 0, 0, Math.PI * 2); ctx.fill() // poot
    ctx.fillStyle = '#e0dcd4'
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse((fromLeft ? 1 : -1) * (12 + i * 6) * paw.p, (-8 + i * 8) * paw.p, 5 * paw.p, 4 * paw.p, 0, 0, Math.PI * 2); ctx.fill() } // teentjes
    if (m.cat.phase === 'warn') { ctx.fillStyle = '#f4b92e'; ctx.font = `bold ${Math.round(22 * paw.p)}px monospace`; ctx.textAlign = 'center'; ctx.fillText('!', 0, -22 * paw.p) }
    ctx.restore()
  }

  // Windvlag (gimmick): pijltje bovenin als er zijwind op de bal staat.
  if (Math.abs(m.wind) > 40) {
    const dir = m.wind < 0 ? -1 : 1
    const wx = RW / 2, wy = 30
    const len = 24 + Math.min(50, Math.abs(m.wind) / 4)
    ctx.strokeStyle = 'rgba(150,210,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(wx - dir * len / 2, wy); ctx.lineTo(wx + dir * len / 2, wy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(wx + dir * len / 2, wy); ctx.lineTo(wx + dir * (len / 2 - 10), wy - 6); ctx.moveTo(wx + dir * len / 2, wy); ctx.lineTo(wx + dir * (len / 2 - 10), wy + 6); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = 'rgba(150,210,255,0.85)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText('WIND', wx, wy - 12)
  }

  // Speler (dichtbij): rode bat op z'n auto-positie, in forehand/backhand-stand met arm + krachtbalk.
  drawPlayerBat(ctx, m.players[0].x, m.players[0].z, m.players[0], b.x)

  ctx.restore()

  // ── HUD: scorebord ─────────────────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.font = 'bold 15px monospace'
  const hud = (label: string, sc: number, x: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillText(label, x, 30)
    ctx.font = '900 30px monospace'
    ctx.fillStyle = '#fff'
    ctx.fillText(String(sc), x, 62)
    ctx.font = 'bold 15px monospace'
  }
  hud(m.players[0].name, m.score[0], cw / 2 - 130, '#4FA8E0')
  hud(m.players[1].name, m.score[1], cw / 2 + 130, '#E63946')
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px monospace'
  ctx.fillText(`tot ${m.target} · service: ${m.players[m.server].name}`, cw / 2, 78)
}

// Tekent een racket-blad (rubber-ellips + steel), geroteerd om z'n greep.
function bladeAt(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, ang: number, color: string, glow: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  if (glow > 0) {
    ctx.beginPath()
    ctx.ellipse(0, 0, rx + 6, ry + 6, 0, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,180,40,${0.35 * glow})`
    ctx.fill()
  }
  // steel omlaag uit de greep
  ctx.strokeStyle = '#9a6b3a'
  ctx.lineWidth = Math.max(3, rx * 0.34)
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(0, ry * 0.7); ctx.lineTo(0, ry * 1.75); ctx.stroke()
  ctx.lineCap = 'butt'
  // rubber
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.beginPath(); ctx.ellipse(-rx * 0.25, -ry * 0.25, rx * 0.4, ry * 0.4, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill()
  ctx.restore()
  // greep-tip in schermruimte (om de arm aan vast te maken)
  return { tx: x - Math.sin(ang) * ry * 1.75, ty: y + Math.cos(ang) * ry * 1.75 }
}

// Speler-batje (dichtbij): forehand/backhand-stand, arm die het bat vasthoudt, en de slag-animatie
// die meegaat met het laden (spatie) en het doorzwaaien. Plus een krachtbalk tijdens het laden.
function drawPlayerBat(ctx: CanvasRenderingContext2D, worldX: number, z: number, p: PongPlayer, ballX: number) {
  const c = project(worldX, PADDLE_Y, z)
  const s = c.p
  const rx = 15 * s
  const ry = 19 * s
  // bal rechts van je bat = forehand, links = backhand; tijdens de slag vast op de gekozen kant
  const fore = p.swing ? p.swing.face === 'fore' : ballX >= worldX
  const dir = fore ? 1 : -1
  const w = p.charging ? p.chargeT / CHARGE_MAX : 0
  const prog = p.swing ? Math.sin(Math.min(1, p.swing.t / SWING_DUR) * Math.PI) : 0
  // Kanteling: rust-stand per forehand/backhand, verder gecockt bij het laden, whip bij de slag.
  const ang = dir * 0.42 + dir * w * 0.55 - dir * prog * 1.7
  const sweepX = dir * (prog * 34 - w * 12) * s // eerst iets terug (laden), dan doorzwaaien
  const bx = c.sx + sweepX
  const by = c.sy - prog * 22 * s // lunge naar het net toe bij contact
  const grip = bladeAt(ctx, bx, by, rx, ry, ang, '#e0342e', prog * (p.swing?.power ?? 0))
  // Onderarm + hand vanaf de onderkant (pols) naar de greep.
  const wristX = c.sx + dir * 26 * s
  const wristY = c.sy + 64 * s
  ctx.strokeStyle = '#e8b48c'
  ctx.lineWidth = 9 * s
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(wristX, wristY); ctx.lineTo(grip.tx, grip.ty); ctx.stroke()
  ctx.beginPath(); ctx.arc(grip.tx, grip.ty, 6 * s, 0, Math.PI * 2); ctx.fillStyle = '#e8b48c'; ctx.fill()
  ctx.lineCap = 'butt'
  // Bereik-hint op de tafel (op de diepte waar je bat staat).
  const hz = project(worldX, 0, z + 2)
  ctx.strokeStyle = 'rgba(224,52,46,0.3)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(hz.sx, hz.sy, PADDLE_REACH * hz.p, PADDLE_REACH * hz.p * 0.4, 0, 0, Math.PI * 2); ctx.stroke()
  // Krachtbalk tijdens het laden.
  if (p.charging) {
    const bw = 90 * s
    const bx0 = c.sx - bw / 2
    const byb = c.sy + 88 * s
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(bx0 - 2, byb - 2, bw + 4, 12 * s + 4)
    const col = w > 0.75 ? '#e63946' : w > 0.4 ? '#f4b92e' : '#5fbf6e'
    ctx.fillStyle = col
    ctx.fillRect(bx0, byb, bw * w, 12 * s)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `bold ${11 * s}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(fore ? 'FOREHAND' : 'BACKHAND', c.sx, byb - 6 * s)
  }
}

// Tegenstander (ver): lijf + kop + arm die het bat vasthoudt, áchter de verre tafelrand.
function drawOpponent(ctx: CanvasRenderingContext2D, faces: Record<string, HTMLImageElement>, p: PongPlayer, ballX: number) {
  const c = project(p.x, PADDLE_Y, L + 20)
  const s = c.p
  const rx = 14 * s
  const ry = 18 * s
  const fore = p.swing ? p.swing.face === 'fore' : ballX >= p.x
  const dir = fore ? 1 : -1
  const prog = p.swing ? Math.sin(Math.min(1, p.swing.t / SWING_DUR) * Math.PI) : 0
  const ang = -dir * 0.42 + dir * prog * 1.6 // gespiegeld t.o.v. de speler
  // Lijf (shirt) achter de tafelrand.
  const torsoY = c.sy - 16 * s
  ctx.fillStyle = '#c2242e'
  ctx.beginPath(); ctx.ellipse(c.sx, torsoY, 26 * s, 32 * s, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke()
  // Kop erboven (spelersgezicht, geclipt in een cirkel).
  const hr = 26 * s
  const hy = torsoY - 40 * s
  const img = faces[p.face]
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(c.sx, hy, hr, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(img, c.sx - hr, hy - hr, hr * 2, hr * 2); ctx.restore()
  }
  ctx.beginPath(); ctx.arc(c.sx, hy, hr, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke()
  // Bat bij de bat-lijn, met de arm van de schouder ernaartoe.
  const grip = bladeAt(ctx, c.sx + dir * prog * 22 * s, c.sy - prog * 10 * s, rx, ry, ang, '#e6e6ea', 0)
  const shX = c.sx + dir * 20 * s
  const shY = torsoY - 8 * s
  ctx.strokeStyle = '#e8b48c'; ctx.lineWidth = 7 * s; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(grip.tx, grip.ty); ctx.stroke()
  ctx.beginPath(); ctx.arc(grip.tx, grip.ty, 5 * s, 0, Math.PI * 2); ctx.fillStyle = '#e8b48c'; ctx.fill()
  ctx.lineCap = 'butt'
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

function FacePicker({ label, pick, onPick, color }: { label: string; pick: number; onPick: (i: number) => void; color: string }) {
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
