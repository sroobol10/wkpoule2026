'use client'

// Koppenkanon — Angry Birds-lite. Trek de kop met de MUIS (of vinger) terug in de katapult en laat
// los om 'm naar de toren te slingeren; sloop alle doelwit-koppen met je beperkte voorraad schoten.

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLAYER_POOL } from '@/lib/soccer/teams'
import {
  W, H, GROUND_Y, SLING_X, SLING_X2, SLING_Y, PULL_MAX, LAUNCH_MAX, BALL_R, TARGET_R, ARENA_MID, DUEL_WINS,
  slingPos, makeGame, launch, activatePower, step, targetsLeft, type KanonState, type KanonMode, type PowerKind,
} from '@/lib/kanon/sim'
import ImmersiveToggle from './immersive-toggle'
import { useLandscapeGate, RotateNotice, enterImmersiveIfMobile, isCoarsePointer } from '@/components/playground/mobile-play'
import { FacePicker, POOL_ALPHA } from '@/components/playground/face-picker'
import { createSfx, type Sfx } from '@/components/playground/sfx'

const FIXED_DT = 1 / 120
const ALL_FACES = PLAYER_POOL.map((p) => p.face)
const POWER_ICON: Record<PowerKind, string> = { none: '', bomb: '💣', boost: '🚀', slam: '⬇️', split: '✂️', giant: '🐘', magnet: '🕳️', rocket: '🎯' }
const POWER_LABEL: Record<PowerKind, string> = { none: '', bomb: 'BOM', boost: 'BOOST', slam: 'SLAM', split: 'SPLIT', giant: 'GIANT', magnet: 'ZWART GAT', rocket: 'RAKET' }

// Lijfjes: elke kop krijgt (deterministisch per gezicht) een shirtkleur, en sommige koppen krijgen
// een grappig dier-lijfje (dino) i.p.v. een mensen-romp.
const SHIRT_COLORS = ['#e0342e', '#2d6be5', '#2ea84b', '#7c3aed', '#e8641c', '#1fb6a6', '#e8519a', '#3a4252']
const DINO_COLORS = ['#5fae4e', '#4a9d8e', '#c98a3a', '#8a6fc0', '#d06a4e']
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
function isDino(face: string | undefined): boolean { return !!face && hashStr(face) % 3 === 0 } // ~1/3 van de koppen wordt een dino
function shirtOf(face: string | undefined): string { return face ? SHIRT_COLORS[hashStr(face) % SHIRT_COLORS.length] : '#e0342e' }
function dinoOf(face: string | undefined): string { return face ? DINO_COLORS[hashStr(face) % DINO_COLORS.length] : '#5fae4e' }

type Particle = { x: number; y: number; vx: number; vy: number; life: number; c: string }
type Game = { st: KanonState; shakeT: number; slowmoT: number }

export default function KanonClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const facesRef = useRef<Record<string, HTMLImageElement>>({})
  const particlesRef = useRef<Particle[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const aimRef = useRef<{ aiming: boolean; wx: number; wy: number }>({ aiming: false, wx: SLING_X - 60, wy: SLING_Y + 40 })
  const doneRef = useRef(false) // voorkomt dubbele level-overgang/game-over
  const lastHudRef = useRef('')
  const sfxRef = useRef<Sfx | null>(null)
  useEffect(() => { sfxRef.current = createSfx(['catapult', 'wood-crash', 'kanon-pop', 'anime-wow', 'boom', 'whoosh', 'slam', 'glass', 'meteor', 'boing']) }, [])

  const [stage, setStage] = useState<'menu' | 'playing'>('menu')
  const { isTouch, portrait } = useLandscapeGate()
  const [mode, setMode] = useState<KanonMode>('solo')
  const [p0Pick, setP0Pick] = useState(-1) // jouw kop
  const [p1Pick, setP1Pick] = useState(-1) // tegenstander (duel/toren/race)
  const [hud, setHud] = useState({ level: 1, mode: 'solo' as KanonMode, turn: 0, score: [0, 0], hits: [0, 0], targets: 0, ammo: 0, power: 'none' as PowerKind, wind: 0, gravName: '' })
  const [over, setOver] = useState<{ title: string; sub: string } | null>(null)
  const [popup, setPopup] = useState<{ text: string; n: number } | null>(null)
  const popupN = useRef(0)

  useEffect(() => {
    for (const p of PLAYER_POOL) {
      if (facesRef.current[p.face]) continue
      const img = new window.Image()
      img.src = `/spelers/${p.face}`
      facesRef.current[p.face] = img
    }
  }, [])

  // Gekozen koppen (of willekeurig); doelwitten = de rest van de pool.
  const buildGame = useCallback((m: KanonMode, level: number): KanonState => {
    const rand = () => ALL_FACES[Math.floor(Math.random() * ALL_FACES.length)]
    const f0 = p0Pick >= 0 ? POOL_ALPHA[p0Pick].face : rand()
    let f1 = p1Pick >= 0 ? POOL_ALPHA[p1Pick].face : rand()
    if (m !== 'solo' && f1 === f0) f1 = ALL_FACES.find((f) => f !== f0) ?? f1
    const picks: [string, string] = [f0, f1]
    const targets = ALL_FACES.filter((f) => f !== f0 && (m === 'solo' || f !== f1))
    return makeGame(m, picks, targets.length ? targets : ALL_FACES, level)
  }, [p0Pick, p1Pick])

  const startMatch = useCallback(() => {
    const st = buildGame(mode, 1)
    gameRef.current = { st, shakeT: 0, slowmoT: 0 }
    particlesRef.current = []
    const sp = slingPos(st.mode, 0)
    aimRef.current = { aiming: false, wx: sp.x - 60, wy: sp.y + 40 }
    doneRef.current = false
    setOver(null)
    enterImmersiveIfMobile()
    setStage('playing')
  }, [buildGame, mode])

  useEffect(() => {
    if (stage !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const keys = keysRef.current

    // Scherm → wereldcoördinaten (zelfde fit-schaling als de renderer).
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const sc = Math.min(rect.width / W, rect.height / H) * (isCoarsePointer() ? 1.15 : 1)
      const ox = (rect.width - W * sc) / 2
      const oy = (rect.height - H * sc) / 2
      return { x: (clientX - rect.left - ox) / sc, y: (clientY - rect.top - oy) / sc }
    }
    const pullVec = () => {
      const g = gameRef.current
      const sp = g ? slingPos(g.st.mode, g.st.turn) : { x: SLING_X, y: SLING_Y }
      const a = aimRef.current
      let dx = a.wx - sp.x, dy = a.wy - sp.y
      const len = Math.hypot(dx, dy)
      if (len > PULL_MAX) { dx = dx / len * PULL_MAX; dy = dy / len * PULL_MAX }
      return { dx, dy, len: Math.min(len, PULL_MAX) }
    }
    const fire = () => {
      const g = gameRef.current
      if (!g || g.st.phase !== 'aim') return
      const { dx, dy, len } = pullVec()
      if (len < 12) return // te klein → niet vuren
      const k = (len / PULL_MAX) * LAUNCH_MAX / len
      launch(g.st, -dx * k, -dy * k)
      sfxRef.current?.play('catapult')
    }
    // Tijdens de vlucht: de power van de kop activeren (bom/boost/slam).
    const doPower = () => {
      const g = gameRef.current
      if (!g || g.st.phase !== 'fly') return
      applyEvents(g, activatePower(g.st))
    }

    const onDown = (e: PointerEvent) => {
      const g = gameRef.current
      if (!g) return
      if (g.st.phase === 'fly') { doPower(); e.preventDefault(); return } // tik in de lucht = power
      if (g.st.phase !== 'aim') return
      aimRef.current.aiming = true
      const w = toWorld(e.clientX, e.clientY)
      aimRef.current.wx = w.x; aimRef.current.wy = w.y
      e.preventDefault()
    }
    const onMoveP = (e: PointerEvent) => {
      if (!aimRef.current.aiming) return
      const w = toWorld(e.clientX, e.clientY)
      aimRef.current.wx = w.x; aimRef.current.wy = w.y
    }
    const onUp = () => { if (aimRef.current.aiming) { aimRef.current.aiming = false; fire() } }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMoveP)
    window.addEventListener('pointerup', onUp)

    const spawnPop = (x: number, y: number, gold = false) => {
      const cols = gold ? ['#ffd700', '#ffe680', '#f4b92e'] : ['#f4b92e', '#e63946', '#5fbf6e', '#4FA8E0']
      for (let k = 0; k < 14; k++) particlesRef.current.push({
        x, y, vx: (Math.random() - 0.5) * 340, vy: -Math.random() * 320 - 40,
        life: 0.5 + Math.random() * 0.4, c: cols[k % cols.length],
      })
    }
    const spawnBoom = (x: number, y: number) => {
      for (let k = 0; k < 30; k++) particlesRef.current.push({
        x, y, vx: (Math.random() - 0.5) * 720, vy: -Math.random() * 480 - 40,
        life: 0.4 + Math.random() * 0.5, c: ['#ff6a00', '#ffd000', '#ff2200', '#777'][k % 4],
      })
    }
    const spawnShatter = (x: number, y: number) => { // ijs versplintert: koele scherfjes
      for (let k = 0; k < 18; k++) particlesRef.current.push({
        x, y, vx: (Math.random() - 0.5) * 460, vy: -Math.random() * 300 - 20,
        life: 0.4 + Math.random() * 0.4, c: ['#cfeeffff', '#a9dcf5', '#e8f8ff', '#7fc7e8'][k % 4],
      })
    }
    const show = (text: string) => { popupN.current++; setPopup({ text, n: popupN.current }) }

    // Alle sim-events → deeltjes, geluid, shake, slow-mo (gedeeld door de loop én power-activatie).
    const applyEvents = (g: Game, events: ReturnType<typeof step>) => {
      for (const e of events) {
        if (e.type === 'pop') { spawnPop(e.x, e.y, e.bonus); g.shakeT = Math.max(g.shakeT, 0.25); sfxRef.current?.play('kanon-pop') }
        else if (e.type === 'boom') { spawnBoom(e.x, e.y); g.shakeT = Math.max(g.shakeT, 0.5); g.slowmoT = Math.max(g.slowmoT, 0.35); sfxRef.current?.play('boom') }
        else if (e.type === 'shatter') { spawnShatter(e.x, e.y); g.shakeT = Math.max(g.shakeT, 0.15); sfxRef.current?.play('glass') }
        else if (e.type === 'bounce') { g.shakeT = Math.max(g.shakeT, 0.08); sfxRef.current?.play('boing', 0.55) }
        else if (e.type === 'thud' && e.power > 320) { g.shakeT = Math.max(g.shakeT, Math.min(0.3, e.power / 2200)); sfxRef.current?.play('wood-crash', Math.min(1, e.power / 900)) }
        else if (e.type === 'power') { sfxRef.current?.play(e.kind === 'bomb' ? 'boom' : e.kind === 'slam' ? 'slam' : 'whoosh'); if (e.kind !== 'bomb' && e.kind !== 'magnet') spawnBoom(e.x, e.y) }
        else if (e.type === 'meteor') { show('☄️ METEORENREGEN!'); g.shakeT = Math.max(g.shakeT, 0.4); sfxRef.current?.play('meteor') }
        else if (e.type === 'combo') { show(`🔥 COMBO ×${e.n}!`); g.slowmoT = Math.max(g.slowmoT, 0.5); sfxRef.current?.play('anime-wow') }
        else if (e.type === 'cleared' || e.type === 'won') sfxRef.current?.play('anime-wow')
      }
    }

    const nameOf = (face: string) => POOL_ALPHA.find((p) => p.face === face)?.name ?? 'Speler'
    let raf = 0, last = performance.now(), acc = 0, aimedFor = -1
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const g = gameRef.current
      if (!g) return
      const rdt = Math.min(0.05, (now - last) / 1000); last = now
      // Nieuwe beurt → zet een nette default-terugtrek voor de speler-aan-beurt (link/rechts).
      if (g.st.phase === 'aim' && !aimRef.current.aiming && aimedFor !== g.st.turn) {
        const sp = slingPos(g.st.mode, g.st.turn)
        aimRef.current.wx = sp.x + (g.st.turn === 1 && (g.st.mode === 'duel' || g.st.mode === 'race') ? 60 : -60)
        aimRef.current.wy = sp.y + 40
        aimedFor = g.st.turn
      }
      if (g.st.phase !== 'aim') aimedFor = -1
      if (g.slowmoT > 0) g.slowmoT = Math.max(0, g.slowmoT - rdt)
      acc += rdt
      while (acc >= FIXED_DT) {
        const sdt = FIXED_DT * (g.slowmoT > 0 ? 0.4 : 1) // slow-motion bij explosies/combo's
        if (g.st.phase === 'aim' && !aimRef.current.aiming) {
          const a = aimRef.current
          const sp = 120 * FIXED_DT
          if (keys.has('ArrowLeft')) a.wx -= sp
          if (keys.has('ArrowRight')) a.wx += sp
          if (keys.has('ArrowUp')) a.wy -= sp
          if (keys.has('ArrowDown')) a.wy += sp
        }
        applyEvents(g, step(g.st, sdt))
        // Spoor achter elk vliegend lichaam (primair + split-scherven).
        for (const fb of [g.st.ball, ...g.st.shards]) {
          if (fb && fb.live && Math.hypot(fb.vx, fb.vy) > 120) particlesRef.current.push({ x: fb.x, y: fb.y, vx: -fb.vx * 0.05, vy: -fb.vy * 0.05, life: 0.35, c: 'rgba(255,220,120,0.7)' })
        }
        for (const pt of particlesRef.current) { pt.x += pt.vx * sdt; pt.y += pt.vy * sdt; pt.vy += 900 * sdt; pt.life -= sdt }
        particlesRef.current = particlesRef.current.filter((pt) => pt.life > 0)
        if (g.shakeT > 0) g.shakeT = Math.max(0, g.shakeT - FIXED_DT)
        acc -= FIXED_DT
      }
      // Level-overgang / einde (één keer; step 'bevriest' op cleared/failed/won).
      if (!doneRef.current) {
        if (g.st.phase === 'cleared') { // solo: volgend level
          doneRef.current = true
          setTimeout(() => { const cur = gameRef.current; if (cur) { const sc = cur.st.score; cur.st = buildGame('solo', cur.st.level + 1); cur.st.score = sc; doneRef.current = false } }, 1100)
        } else if (g.st.phase === 'failed') {
          doneRef.current = true
          setOver({ title: 'Uit de schoten! 🧨', sub: `Level ${g.st.level} · Score ${g.st.score[0]}` })
        } else if (g.st.phase === 'won') {
          doneRef.current = true
          const w = g.st.winner
          setOver({ title: w === -1 ? 'Gelijkspel!' : `${nameOf(g.st.picks[w])} wint! 🏆`, sub: g.st.mode === 'tower' ? `${g.st.score[0]} – ${g.st.score[1]}` : g.st.mode === 'duel' ? `${g.st.hits[0]} – ${g.st.hits[1]}` : 'Toren gesloopt' })
        }
      }
      const key = `${g.st.turn}|${g.st.score.join(',')}|${g.st.hits.join(',')}|${targetsLeft(g.st)}|${g.st.ammo[0].length + g.st.ammo[1].length}|${g.st.level}|${g.st.nextPower}|${Math.round(g.st.wind)}`
      if (key !== lastHudRef.current) {
        lastHudRef.current = key
        setHud({ level: g.st.level, mode: g.st.mode, turn: g.st.turn, score: [...g.st.score], hits: [...g.st.hits], targets: targetsLeft(g.st), ammo: g.st.ammo[g.st.turn].length, power: g.st.nextPower, wind: g.st.wind, gravName: g.st.gravName })
      }
      draw(ctx, canvas, g, facesRef.current, particlesRef.current, aimRef.current, pullVec, now)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      keys.add(e.code)
      if (e.code === 'Space' && !e.repeat) { const g = gameRef.current; if (g?.st.phase === 'fly') doPower(); else fire() }
      if (e.code === 'Escape') setStage('menu')
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMoveP)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keys.clear()
    }
  }, [stage, buildGame])

  return (
    <div data-game-root className="fixed inset-0 bg-wk-bg text-wk-text">
      {stage === 'menu' ? (
        <div className="flex h-full flex-col items-center justify-start gap-5 overflow-y-auto px-6 py-8">
          <Link href="/playground" className="absolute right-5 top-5 font-mono text-sm uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</Link>
          <div className="flex shrink-0 flex-col items-center">
            <Image src="/games/koppenkanon.png" alt="Koppenkanon" width={1024} height={1024} priority className="h-24 w-auto" />
          </div>

          <div className="w-full max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-wk-surface/70 p-6 backdrop-blur-sm">
            <MenuRow label="Modus">
              <Seg options={['Solo', 'Duel', 'Zelfde toren', 'Race']} value={mode === 'solo' ? 0 : mode === 'duel' ? 1 : mode === 'tower' ? 2 : 3}
                onChange={(i) => setMode(i === 0 ? 'solo' : i === 1 ? 'duel' : i === 2 ? 'tower' : 'race')} />
            </MenuRow>
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.13em] text-wk-muted">
              {mode === 'solo' ? 'Endless: sloop elke ronde een nieuwe toren met je voorraad schoten.'
                : mode === 'duel' ? '1v1 om de beurt: raak de kop van de tegenstander. Eerste tot 3 treffers wint.'
                  : mode === 'tower' ? '1v1 om de beurt op dezelfde toren: wie de meeste doelwit-koppen sloopt wint.'
                    : '1v1: elk een eigen toren. Wie ‘m het eerst helemaal sloopt wint.'}
            </p>
            {mode === 'solo' ? (
              <FacePicker label="Jouw kogel-kop" pick={p0Pick} onPick={(i) => setP0Pick(p0Pick === i ? -1 : i)} color="#F4B92E" compact />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="sm:border-r sm:border-white/10 sm:pr-5">
                  <FacePicker label="Speler 1 (links)" pick={p0Pick} onPick={(i) => setP0Pick(p0Pick === i ? -1 : i)} color="#F4B92E" compact />
                </div>
                <FacePicker label="Speler 2 (rechts)" pick={p1Pick} onPick={(i) => setP1Pick(p1Pick === i ? -1 : i)} color="#4FA8E0" compact />
              </div>
            )}
            <button onClick={startMatch}
              className="w-full rounded-xl border border-wk-gold/60 bg-wk-gold/15 py-4 font-score text-3xl uppercase tracking-wide text-wk-gold transition hover:bg-wk-gold/25">
              Vuur maar! 💥
            </button>
          </div>

          <div className="max-w-xl text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">
            trek de kop terug in de katapult (muis/vinger) en laat los · SPATIE/tik tijdens de vlucht activeert je power: 💣bom · 🚀boost · ⬇️slam · ✂️split · 🐘giant · 🕳️zwart gat · 🎯raket<br />
            let op de wind & zwaartekracht · TNT-kettingreactie · broos ijs versplintert · 🎪 rubber kaatst je terug · 🔴 trampolines · 👑 boss-koppen (meer treffers) · ballon- & patrouillekoppen · ☄️ meteorenregen · 3+ in één schot = combo · Esc = menu
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ touchAction: 'none' }} />
          <div className="absolute right-4 top-4"><ImmersiveToggle /></div>
          {isTouch && portrait && <RotateNotice game="Koppenkanon" />}
          <button onClick={() => setStage('menu')}
            className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
            ← Menu
          </button>
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/45 px-5 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-white/85">
            {hud.mode === 'solo' ? `Level ${hud.level} · Score ${hud.score[0]} · nog ${hud.targets} 🎯 · ${hud.ammo} 🧨`
              : hud.mode === 'duel' ? `Beurt: Speler ${hud.turn + 1} · treffers ${hud.hits[0]} – ${hud.hits[1]} (tot ${DUEL_WINS})`
                : hud.mode === 'tower' ? `Beurt: Speler ${hud.turn + 1} · ${hud.score[0]} – ${hud.score[1]} · nog ${hud.targets} 🎯 · ${hud.ammo} 🧨`
                  : `Beurt: Speler ${hud.turn + 1} · nog ${hud.targets} 🎯 · ${hud.ammo} 🧨`}
            {hud.power !== 'none' && <span className="ml-2 text-wk-gold">· {POWER_ICON[hud.power]} spatie = {POWER_LABEL[hud.power]}</span>}
            {Math.abs(hud.wind) > 60 && <span className="ml-2 text-sky-300">· wind {hud.wind < 0 ? '←' : '→'}</span>}
            {hud.gravName && <span className="ml-2 text-purple-300">· {hud.gravName}</span>}
          </div>

          {popup && (
            <div key={popup.n} className="pointer-events-none absolute inset-x-0 top-[20%] z-20 flex justify-center">
              <h2 className="animate-fade-up font-score text-5xl uppercase text-wk-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">{popup.text}</h2>
            </div>
          )}

          {over && (
            <div className="absolute inset-0 z-30 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/75" />
              <div className="relative flex flex-col items-center gap-4 text-center animate-fade-up">
                <h2 className="font-score text-6xl uppercase text-wk-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">{over.title}</h2>
                <p className="font-score text-4xl text-white">{over.sub}</p>
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
function draw(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: Game,
  faces: Record<string, HTMLImageElement>, particles: Particle[],
  aim: { aiming: boolean; wx: number; wy: number }, pullVec: () => { dx: number; dy: number; len: number }, now: number,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth, ch = canvas.clientHeight
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) { canvas.width = cw * dpr; canvas.height = ch * dpr }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#0c1420'
  ctx.fillRect(0, 0, cw, ch)
  const sc = Math.min(cw / W, ch / H) * (isCoarsePointer() ? 1.15 : 1)
  const shake = g.shakeT > 0 ? (Math.random() - 0.5) * 10 * g.shakeT : 0
  const ox = (cw - W * sc) / 2 + shake
  const oy = (ch - H * sc) / 2 + shake
  ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc)

  // Lucht + heuvels + grond.
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  sky.addColorStop(0, '#2a3f66'); sky.addColorStop(1, '#7fb0d8')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GROUND_Y)
  if (g.st.meteorT > 0) { ctx.fillStyle = 'rgba(180,40,20,0.18)'; ctx.fillRect(0, 0, W, GROUND_Y) } // meteorenregen kleurt de lucht
  ctx.fillStyle = '#3f7a4e'
  for (const hx of [180, 520, 860]) { ctx.beginPath(); ctx.arc(hx, GROUND_Y, 180, Math.PI, 0); ctx.fill() }
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
  ctx.fillStyle = '#5aa35f'; ctx.fillRect(0, GROUND_Y - 6, W, 10)

  // Trampolines op de grond (veren + rood-witte mat).
  for (const p of g.st.pads) {
    const bob = Math.sin(now * 0.012 + p.x * 0.1) * 1.5
    ctx.strokeStyle = '#9aa4ad'; ctx.lineWidth = 3
    for (const sx of [p.x - p.w / 2 + 8, p.x, p.x + p.w / 2 - 8]) {
      ctx.beginPath(); for (let y = 0; y < 16; y += 4) { ctx.moveTo(sx - 4, GROUND_Y + y); ctx.lineTo(sx + 4, GROUND_Y + y + 2) } ctx.stroke()
    }
    ctx.fillStyle = '#e8524a'; ctx.fillRect(p.x - p.w / 2, GROUND_Y - 8 + bob, p.w, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = -p.w / 2 + 6; i < p.w / 2 - 4; i += 14) ctx.fillRect(p.x + i, GROUND_Y - 7 + bob, 7, 8)
  }

  // RACE: scheidslijn tussen de twee helften.
  if (g.st.mode === 'race') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([10, 10]); ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(ARENA_MID, 0); ctx.lineTo(ARENA_MID, GROUND_Y); ctx.stroke(); ctx.setLineDash([])
  }

  // Katapult(en). Duel/race: twee vorken (links + rechts); solo/toren: alleen links.
  const drawSling = (sx: number) => {
    ctx.strokeStyle = '#6b4326'; ctx.lineWidth = 10; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(sx, GROUND_Y); ctx.lineTo(sx, SLING_Y + 4); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(sx, SLING_Y + 8); ctx.lineTo(sx - 16, SLING_Y - 14); ctx.moveTo(sx, SLING_Y + 8); ctx.lineTo(sx + 16, SLING_Y - 14); ctx.stroke()
    ctx.lineCap = 'butt'
  }
  drawSling(SLING_X)
  if (g.st.mode === 'duel' || g.st.mode === 'race') drawSling(SLING_X2)

  // Bodies (kisten/steen/TNT + doelwit-koppen).
  for (const b of g.st.bodies) {
    if (b.popped) continue
    const drawY = b.float ? b.y + Math.sin(now * 0.002 + b.x * 0.05) * 7 : b.y // ballon-kop bobbelt
    if (b.float) { // ballon + touwtje boven de kop
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(b.x, drawY - TARGET_R); ctx.lineTo(b.x, drawY - TARGET_R - 30); ctx.stroke()
      ctx.fillStyle = '#e8524a'; ctx.beginPath(); ctx.ellipse(b.x, drawY - TARGET_R - 44, 14, 17, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(b.x - 4, drawY - TARGET_R - 48, 4, 6, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.save(); ctx.translate(b.x, drawY); ctx.rotate(b.angle)
    if (b.kind === 'crate') {
      ctx.fillStyle = '#b5813f'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = '#7a5423'; ctx.lineWidth = 3; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.beginPath(); ctx.moveTo(-b.w / 2, -b.h / 2); ctx.lineTo(b.w / 2, b.h / 2); ctx.moveTo(b.w / 2, -b.h / 2); ctx.lineTo(-b.w / 2, b.h / 2); ctx.stroke()
    } else if (b.kind === 'stone') {
      ctx.fillStyle = '#8b8f96'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = '#5b5f66'; ctx.lineWidth = 3; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.arc(-6, -4, 5, 0, Math.PI * 2); ctx.arc(8, 6, 4, 0, Math.PI * 2); ctx.fill()
    } else if (b.kind === 'tnt') {
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = '#7a1f16'; ctx.lineWidth = 3; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.fillStyle = '#f4e3c0'; ctx.fillRect(-b.w / 2, -6, b.w, 12) // band
      ctx.fillStyle = '#7a1f16'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', 0, 0)
      ctx.textBaseline = 'alphabetic'
    } else if (b.kind === 'ice') {
      ctx.fillStyle = 'rgba(178,224,246,0.72)'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5 // scheurtjes
      ctx.beginPath(); ctx.moveTo(-b.w / 2, -3); ctx.lineTo(-3, 5); ctx.lineTo(7, -b.h / 2); ctx.moveTo(-3, 5); ctx.lineTo(b.w / 2, 8); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-b.w / 2 + 4, -b.h / 2 + 4, 6, b.h - 8) // glans
    } else if (b.kind === 'rubber') {
      ctx.fillStyle = '#d94a86'; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = '#8a2b53'; ctx.lineWidth = 3; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2 // veer-strepen
      ctx.beginPath(); for (let yy = -b.h / 2 + 9; yy < b.h / 2; yy += 11) { ctx.moveTo(-b.w / 2 + 5, yy); ctx.lineTo(b.w / 2 - 5, yy + 5) } ctx.stroke()
    } else {
      // Doelwit-koppen krijgen een héél lijfje (mensen-chibi of grappig dino), geen cirkel eromheen.
      const gold = b.kind === 'bonus'
      const boss = (b.hp ?? 1) > 1
      const R = b.w / 2
      const animal = isDino(b.face) && !gold
      const color = gold ? '#ffd700' : animal ? dinoOf(b.face) : shirtOf(b.face)
      drawCreatureBody(ctx, faces, b.face, R, color, animal)
      if (gold) { ctx.fillStyle = '#ffd700'; ctx.font = '16px monospace'; ctx.textAlign = 'center'; ctx.fillText('★', 0, -R * 1.35) }
      if (boss) { ctx.font = '16px monospace'; ctx.textAlign = 'center'; ctx.fillText('👑' + '❤'.repeat(b.hp ?? 1), 0, -R * 1.5) } // HP-kroontje
    }
    ctx.restore()
  }

  // Aim: getrokken kop bij de ACTIEVE katapult + baan-voorspelling (stippellijn).
  const sp = slingPos(g.st.mode, g.st.turn)
  if (g.st.phase === 'aim') {
    const { dx, dy, len } = pullVec()
    const bx = sp.x + dx, by = sp.y + dy
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(sp.x - 16, sp.y - 14); ctx.lineTo(bx, by); ctx.lineTo(sp.x + 16, sp.y - 14); ctx.stroke()
    if (len > 12) {
      const k = (len / PULL_MAX) * LAUNCH_MAX / len
      const pvx = -dx * k
      let px = bx, py = by, pvy = -dy * k
      let pvxx = pvx
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      for (let i = 0; i < 26; i++) {
        pvxx += g.st.wind * 0.032; pvy += g.st.grav * 0.032; px += pvxx * 0.032; py += pvy * 0.032 // incl. wind + themazwaartekracht
        if (py > GROUND_Y - BALL_R) break
        if (i % 2 === 0) { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill() }
      }
    }
    drawBody(ctx, faces, g.st.ammo[g.st.turn][0], bx, by, BALL_R, 0)
    if (g.st.nextPower !== 'none') { // power-badge boven de geladen kop
      ctx.font = '18px monospace'; ctx.textAlign = 'center'
      ctx.fillText(POWER_ICON[g.st.nextPower], bx, by - BALL_R - 14)
    }
  }

  // Windvlag boven het veld (richting + sterkte).
  if (Math.abs(g.st.wind) > 40) {
    const dir = Math.sign(g.st.wind)
    const wx = W / 2, wy = 40
    ctx.strokeStyle = 'rgba(150,210,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    const len = 20 + Math.min(60, Math.abs(g.st.wind) / 4)
    ctx.beginPath(); ctx.moveTo(wx - dir * len / 2, wy); ctx.lineTo(wx + dir * len / 2, wy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(wx + dir * len / 2, wy); ctx.lineTo(wx + dir * (len / 2 - 10), wy - 6); ctx.moveTo(wx + dir * len / 2, wy); ctx.lineTo(wx + dir * (len / 2 - 10), wy + 6); ctx.stroke()
    ctx.lineCap = 'butt'
    ctx.fillStyle = 'rgba(150,210,255,0.85)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText('WIND', wx, wy - 12)
  }

  // Zwart gat (magnet-power): draaikolk die alles opzuigt.
  if (g.st.blackhole) {
    const bh = g.st.blackhole
    const rr = 32 + Math.sin(now * 0.02) * 4
    ctx.save(); ctx.translate(bh.x, bh.y)
    const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, rr * 2.4)
    grd.addColorStop(0, '#000'); grd.addColorStop(0.5, 'rgba(120,60,190,0.55)'); grd.addColorStop(1, 'rgba(120,60,190,0)')
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, rr * 2.4, 0, Math.PI * 2); ctx.fill()
    ctx.rotate(now * 0.006)
    ctx.strokeStyle = 'rgba(210,160,255,0.85)'; ctx.lineWidth = 3
    for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.arc(0, 0, rr, a * 2.1, a * 2.1 + 1.5); ctx.stroke() }
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, rr * 0.5, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // Vliegende lichamen (primair + split-scherven), elk met eigen straal (giant = groot).
  for (const ball of [g.st.ball, ...g.st.shards]) {
    if (ball && ball.live) drawBody(ctx, faces, ball.face, ball.x, ball.y, ball.r, ball.angle)
  }

  // Wachtende voorraad van de speler-aan-beurt (rijtje bij z'n katapult).
  if (g.st.mode !== 'duel') {
    const dir = sp.x > W / 2 ? -1 : 1
    for (let i = 0; i < g.st.ammo[g.st.turn].length; i++) {
      if (g.st.phase === 'aim' && i === 0) continue // die zit in de katapult
      drawHead(ctx, faces, g.st.ammo[g.st.turn][i], sp.x + dir * (i * 26) - dir * 30, GROUND_Y + 34, 12)
    }
  }

  // Deeltjes (pop-confetti).
  for (const pt of particles) {
    ctx.globalAlpha = Math.min(1, pt.life * 2.5)
    ctx.fillStyle = pt.c
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  if (g.st.phase === 'cleared') {
    ctx.fillStyle = '#5fbf6e'; ctx.font = '900 60px monospace'; ctx.textAlign = 'center'
    ctx.fillText('TOREN GESLOOPT!', W / 2, 160)
  }
  ctx.restore()
  void now
}

// Teken een lijfje (mensen-chibi óf grappig dino) met een grote kop op de HUIDIGE origin.
// Geen cirkel-rand om de kop — gewoon de geclipte foto op een romp.
function drawCreatureBody(ctx: CanvasRenderingContext2D, faces: Record<string, HTMLImageElement>, face: string | undefined, r: number, color: string, animal: boolean) {
  if (animal) {
    // Dino: staart, dikke buik, stevige pootjes + donkere rugplaatjes.
    ctx.fillStyle = color
    ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.7); ctx.quadraticCurveTo(r * 1.7, r * 0.5, r * 1.5, r * 1.5); ctx.quadraticCurveTo(r * 1.0, r * 1.15, r * 0.2, r * 1.15); ctx.fill() // staart
    ctx.fillRect(-r * 0.5, r * 1.15, r * 0.38, r * 0.7); ctx.fillRect(r * 0.12, r * 1.15, r * 0.38, r * 0.7) // pootjes
    ctx.beginPath(); ctx.ellipse(0, r * 0.78, r * 0.74, r * 0.86, 0, 0, Math.PI * 2); ctx.fill() // buik
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.4, r * 0.5, 0, 0, Math.PI * 2); ctx.fill() // lichte buik
    ctx.fillStyle = 'rgba(0,0,0,0.28)' // rugplaatjes
    for (const t of [-0.35, 0.0, 0.35]) { ctx.beginPath(); ctx.moveTo(t * r - 5, r * 0.2); ctx.lineTo(t * r, -r * 0.12); ctx.lineTo(t * r + 5, r * 0.2); ctx.fill() }
  } else {
    // Mensen-chibi: armpjes, beentjes en een shirt-romp.
    ctx.strokeStyle = '#e8b48c'; ctx.lineWidth = r * 0.26; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.5); ctx.lineTo(-r * 0.9, r * 1.05); ctx.moveTo(r * 0.4, r * 0.5); ctx.lineTo(r * 0.9, r * 1.05); ctx.stroke() // armen
    ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 1.15); ctx.lineTo(-r * 0.42, r * 1.72); ctx.moveTo(r * 0.3, r * 1.15); ctx.lineTo(r * 0.42, r * 1.72); ctx.stroke() // benen
    ctx.lineCap = 'butt'
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(0, r * 0.72, r * 0.6, r * 0.78, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2; ctx.stroke()
  }
  // Grote kop bovenop (geclipte foto), zonder rand.
  const img = face ? faces[face] : undefined
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(0, -r * 0.12, r, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(img, -r, -r * 0.12 - r, r * 2, r * 2); ctx.restore()
  } else { ctx.beginPath(); ctx.arc(0, -r * 0.12, r, 0, Math.PI * 2); ctx.fillStyle = '#e8b48c'; ctx.fill() }
}

// Vliegend projectiel/aim-kop: jouw kop als mensen-chibi, kan om z'n as tuimelen.
function drawBody(ctx: CanvasRenderingContext2D, faces: Record<string, HTMLImageElement>, face: string | undefined, cx: number, cy: number, r: number, angle: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  drawCreatureBody(ctx, faces, face, r, shirtOf(face), false)
  ctx.restore()
}

// Klein kopje voor het voorraad-rijtje bij de katapult (zonder cirkel-rand).
function drawHead(ctx: CanvasRenderingContext2D, faces: Record<string, HTMLImageElement>, face: string | undefined, cx: number, cy: number, r: number) {
  if (!face) return
  const img = faces[face]
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); ctx.restore()
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#e8b48c'; ctx.fill()
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
