'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { submitPadelScore } from '@/app/actions/padel-game'
import type { LeaderEntry } from '@/lib/padel-leaderboard'
import GameLeaderboard from '../game-leaderboard'
import TeamsPopup from '../teams-popup'
import ImmersiveToggle from '../immersive-toggle'

// Logische speelwereld (px); canvas schaalt mee met de breedte.
const W = 380
const H = 560
const GRAVITY = 1500
const FLAP = -430
const PIPE_W = 62
const GAP = 165
const SPEED = 168
const BG_SPEED = 52   // parallax: achtergrond schuift trager dan de netten
const BG_IMAGES = ['/flappy-bg.jpeg', '/flappy-bg2.jpeg', '/flappy-bg3.jpeg', '/flappy-bg4.jpeg', '/flappy-bg5.jpeg']
const BG_TILES_PER_IMAGE = 2   // elk plaatje 2 tegels (mirror-pair), daarna het volgende
const SPACING = 230          // horizontale afstand tussen netten
const BIRD_X = 104
const BIRD_R = 15
const GROUND = 28

const C = { bg1: '#0B0E14', bg2: '#11151F', pipe: '#2EA84B', pipeCap: '#F4B92E', ground: '#161C2A', text: '#F5F2EB' }

// Kies je 'speler' — één van de padelclub-figuren (anders de 🎾).
// Spel-afbeeldingen staan in /public/spelers (512×512, strak bijgesneden).
const FIGS = '/spelers'
const CHARACTERS = ['bus.png', 'ho.png', 'kim.png', 'vince.png', 'rick.png', 'dejuul.png', 'trein.png', 'ashi.png', 'pimp.png']
// Rick zoeft horizontaal; de rest valt tuimelend uit de lucht — dezelfde flyer-
// afbeeldingen als op /padelclub (uit public/, niet uit /spelers).
const FALL_CHARS = ['bus.png', 'ho.png', 'kim.png', 'vince.png', 'ashi.png', 'kim2.png', 'trein.png', 'dejuul.png', 'girlref.png']

type Pipe = { x: number; gapY: number; scored: boolean }

export default function FlappyClient({ leaderboard, currentUserId }: { leaderboard: LeaderEntry[]; currentUserId: string }) {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/padelclub/spel')
  }

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle')
  const [score, setScore] = useState(0)
  const [board, setBoard] = useState<LeaderEntry[]>(leaderboard)
  const [result, setResult] = useState<{ score: number; record: boolean } | null>(null)
  const [char, setChar] = useState<string>('bus.png')
  // Easter egg: bij elke 15 punten zoeft een grote Rick over het scherm
  const [rickFly, setRickFly] = useState(0)
  // De andere spelers vallen af en toe tuimelend uit de lucht
  const [fallers, setFallers] = useState<{ key: number; src: string; left: number; size: number }[]>([])
  const fallerKey = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const charImg = useRef<HTMLImageElement | null>(null)
  const bgImgs = useRef<(HTMLImageElement | null)[]>(BG_IMAGES.map(() => null))
  const bgOrder = useRef<number[]>([])
  const bgOffset = useRef(0)
  const phaseRef = useRef(phase); phaseRef.current = phase
  const raf = useRef<number | null>(null)
  const last = useRef(0)
  const bird = useRef({ y: H / 2, vy: 0 })
  const pipes = useRef<Pipe[]>([])
  const scoreRef = useRef(0)
  const boardRef = useRef(board); boardRef.current = board

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    // achtergrond: één plaatje tegelijk, mirror-tiled (dus naadloos) en scrollend.
    // Per 2 tegels faden we zacht (crossfade) over naar het volgende plaatje uit de
    // gerandomiseerde reeks → geen harde naad meer.
    const ref = bgImgs.current.find((im): im is HTMLImageElement => !!im && im.complete && im.naturalWidth > 0)
    if (ref) {
      const tileW = ref.naturalWidth * (H / ref.naturalHeight)
      const segLen = tileW * BG_TILES_PER_IMAGE
      const order = bgOrder.current.length ? bgOrder.current : BG_IMAGES.map((_, i) => i)
      const seg = Math.floor(bgOffset.current / segLen)
      const offIn = bgOffset.current - seg * segLen
      const imgAt = (segIdx: number) => {
        const cand = bgImgs.current[order[((segIdx % order.length) + order.length) % order.length]]
        return cand && cand.complete && cand.naturalWidth > 0 ? cand : ref
      }
      // mirror-tiled tekenen van één plaatje over de volle breedte
      const tileImg = (img: HTMLImageElement, alpha: number) => {
        ctx.globalAlpha = alpha
        const base = Math.floor(bgOffset.current / tileW)
        let x = -(bgOffset.current - base * tileW)
        for (let k = 0; x < W; k++, x += tileW) {
          const flip = (((base + k) % 2) + 2) % 2 !== 0
          ctx.save()
          if (flip) { ctx.translate(x + tileW, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, tileW, H) }
          else { ctx.drawImage(img, x, 0, tileW, H) }
          ctx.restore()
        }
        ctx.globalAlpha = 1
      }
      tileImg(imgAt(seg), 1)
      const FADE_PX = 80
      if (offIn > segLen - FADE_PX) tileImg(imgAt(seg + 1), (offIn - (segLen - FADE_PX)) / FADE_PX)
      // donkere waas voor contrast met netten/bal
      ctx.fillStyle = 'rgba(11,14,20,0.45)'; ctx.fillRect(0, 0, W, H)
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, C.bg2); g.addColorStop(1, C.bg1)
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    }

    // netten (pipes)
    for (const p of pipes.current) {
      const topH = p.gapY - GAP / 2
      const botY = p.gapY + GAP / 2
      ctx.fillStyle = C.pipe
      ctx.beginPath(); ctx.roundRect(p.x, 0, PIPE_W, topH, 6); ctx.fill()
      ctx.beginPath(); ctx.roundRect(p.x, botY, PIPE_W, H - GROUND - botY, 6); ctx.fill()
      ctx.fillStyle = C.pipeCap
      ctx.beginPath(); ctx.roundRect(p.x - 3, topH - 12, PIPE_W + 6, 12, 4); ctx.fill()
      ctx.beginPath(); ctx.roundRect(p.x - 3, botY, PIPE_W + 6, 12, 4); ctx.fill()
    }

    // grond
    ctx.fillStyle = C.ground
    ctx.fillRect(0, H - GROUND, W, GROUND)

    // speler — gekozen figuur (of 🎾 als fallback), kantelt met de snelheid
    ctx.save()
    ctx.translate(BIRD_X, bird.current.y)
    ctx.rotate(Math.max(-0.4, Math.min(0.8, bird.current.vy / 600)))
    const img = charImg.current
    if (img && img.complete && img.naturalWidth > 0) {
      const w = 46
      const h = w * (img.naturalHeight / img.naturalWidth)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
    } else {
      ctx.font = '30px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🎾', 0, 1)
    }
    ctx.restore()

    // score tijdens spel
    if (phaseRef.current === 'playing') {
      ctx.fillStyle = C.text
      ctx.font = 'bold 40px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(String(scoreRef.current), W / 2, 24)
    }
  }, [])

  const setupCanvas = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    cv.width = W * dpr
    cv.height = H * dpr
    const ctx = cv.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [])

  const endGame = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    phaseRef.current = 'over'
    setPhase('over')
    if (raf.current != null) cancelAnimationFrame(raf.current)
    const final = scoreRef.current
    const prevBest = boardRef.current.find((e) => e.id === currentUserId)?.best ?? 0
    setResult({ score: final, record: final > prevBest })
    setBoard((prev) =>
      prev.map((e) => (e.id === currentUserId ? { ...e, best: Math.max(e.best, final) } : e)).sort((a, b) => b.best - a.best),
    )
    void submitPadelScore('flappy', final)
  }, [currentUserId])

  const loop = useCallback((t: number) => {
    if (phaseRef.current !== 'playing') return
    const dt = Math.min(0.032, (t - last.current) / 1000)
    last.current = t

    bird.current.vy += GRAVITY * dt
    bird.current.y += bird.current.vy * dt
    bgOffset.current += BG_SPEED * dt

    // netten verplaatsen + spawnen + score
    for (const p of pipes.current) p.x -= SPEED * dt
    const lastPipe = pipes.current[pipes.current.length - 1]
    if (!lastPipe || lastPipe.x < W - SPACING) {
      pipes.current.push({ x: W, gapY: 90 + Math.random() * (H - GROUND - 180), scored: false })
    }
    pipes.current = pipes.current.filter((p) => p.x + PIPE_W > -10)
    for (const p of pipes.current) {
      if (!p.scored && p.x + PIPE_W < BIRD_X) {
        p.scored = true; scoreRef.current += 1; setScore(scoreRef.current)
        if (scoreRef.current % 15 === 0) setRickFly((k) => k + 1)
        else if (Math.random() < 0.33) {
          const src = FALL_CHARS[Math.floor(Math.random() * FALL_CHARS.length)]
          setFallers((f) => [...f.slice(-3), { key: ++fallerKey.current, src, left: 4 + Math.random() * 78, size: 100 + Math.random() * 90 }])
        }
      }
    }

    // botsingen
    const y = bird.current.y
    let dead = y + BIRD_R > H - GROUND || y - BIRD_R < 0
    for (const p of pipes.current) {
      if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
        if (y - BIRD_R < p.gapY - GAP / 2 || y + BIRD_R > p.gapY + GAP / 2) dead = true
      }
    }

    draw()
    if (dead) { endGame(); return }
    raf.current = requestAnimationFrame(loop)
  }, [draw, endGame])

  const start = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current)
    bird.current = { y: H / 2, vy: FLAP }
    pipes.current = []
    scoreRef.current = 0
    setScore(0)
    setResult(null)
    setPhase('playing'); phaseRef.current = 'playing'
    last.current = performance.now()
    raf.current = requestAnimationFrame(loop)
  }, [loop])

  const flap = useCallback(() => {
    if (phaseRef.current === 'playing') bird.current.vy = FLAP
    else if (phaseRef.current === 'idle') start()
  }, [start])

  // Onthouden welke speler je koos
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('flappyChar') : null
    if (saved && CHARACTERS.includes(saved)) setChar(saved)
  }, [])

  // Gekozen figuur als afbeelding inladen (tekenen via canvas)
  useEffect(() => {
    const img = new window.Image()
    img.onload = () => { charImg.current = img; if (phaseRef.current !== 'playing') draw() }
    img.src = `${FIGS}/${char}`
  }, [char, draw])

  // Achtergronden: 5 plaatjes inladen + willekeurige volgorde (valt terug op de gradient)
  useEffect(() => {
    const order = BG_IMAGES.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
    bgOrder.current = order
    BG_IMAGES.forEach((src, i) => {
      const img = new window.Image()
      img.onload = () => { bgImgs.current[i] = img; if (phaseRef.current !== 'playing') draw() }
      img.src = src
    })
  }, [draw])

  const pickChar = (c: string) => {
    setChar(c)
    if (typeof window !== 'undefined') window.localStorage.setItem('flappyChar', c)
  }

  // Setup + idle-frame + toetsenbord + cleanup
  useEffect(() => {
    setupCanvas()
    draw()
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (raf.current != null) cancelAnimationFrame(raf.current)
    }
  }, [setupCanvas, draw, flap])

  return (
    <div data-game-root className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <TeamsPopup active={phase === 'playing'} />
      <ImmersiveToggle />
      {/* Easter egg: grote Rick photobomt het scherm bij elke 15 punten */}
      {rickFly > 0 && (
        <div key={rickFly} className="pointer-events-none fixed inset-0 z-50 flex items-center overflow-hidden" aria-hidden>
          <Image
            src={`${FIGS}/rick.png`} alt="" width={460} height={460}
            onAnimationEnd={() => setRickFly(0)}
            className="h-auto w-[60vw] max-w-[440px] drop-shadow-2xl"
            style={{ animation: 'cross-right 1.1s cubic-bezier(0.4,0,0.7,1) both' }}
          />
        </div>
      )}
      {/* De andere spelers vallen tuimelend uit de lucht */}
      {fallers.map((fl) => (
        <div key={fl.key} className="pointer-events-none fixed top-0 z-50" style={{ left: `${fl.left}%` }} aria-hidden>
          <Image
            src={`/${fl.src}`} alt="" width={200} height={200}
            onAnimationEnd={() => setFallers((f) => f.filter((x) => x.key !== fl.key))}
            className="h-auto drop-shadow-2xl"
            style={{ width: fl.size, animation: 'flappy-fall 2.3s cubic-bezier(0.45,0,0.7,1) forwards' }}
          />
        </div>
      ))}
      <Link
        href="/padelclub/spel" aria-label="Sluiten"
        onClick={(e) => { e.preventDefault(); close() }}
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-md mx-auto gx-container px-4 py-10 sm:py-14 space-y-6">
        <header className="gx-hide text-center animate-fade-up">
          <Link href="/padelclub/spel" className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.2em] uppercase mb-2 inline-block">← Spellen</Link>
          <h1 className="font-display text-4xl sm:text-5xl uppercase leading-none text-wk-gold">Flappy Padel</h1>
        </header>

        {/* Speelveld */}
        <div
          className="gx-stage relative mx-auto w-full max-w-[380px] select-none touch-none"
          onPointerDown={(e) => { e.preventDefault(); flap() }}
        >
          <canvas ref={canvasRef} className="w-full block rounded-2xl border border-white/10" style={{ aspectRatio: `${W} / ${H}` }} />

          {phase === 'idle' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-5 bg-wk-bg/35 backdrop-blur-[1px] rounded-2xl"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-wk-soft leading-relaxed">
                Kies je speler en druk op <b className="text-wk-gold">Start</b>. Tik dan (of spatie) om te <b className="text-wk-gold">fladderen</b> — één keer raken = klaar.
              </p>
              <div className="w-full" onClick={(e) => e.stopPropagation()}>
                <p className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase mb-2">Kies je speler</p>
                <div className="flex gap-2 overflow-x-auto pb-1.5 px-0.5 scrollbar-none">
                  {CHARACTERS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); pickChar(c) }}
                      className={`shrink-0 w-12 h-12 rounded-xl border flex items-center justify-center bg-wk-bg2 transition-colors ${char === c ? 'border-wk-gold ring-2 ring-wk-gold/40' : 'border-white/10 hover:border-white/30'}`}
                    >
                      <Image src={`${FIGS}/${c}`} alt="" width={40} height={40} className="w-9 h-9 object-contain" />
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); start() }} className="font-display text-lg uppercase tracking-wide px-8 py-3 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Start
              </button>
            </div>
          )}

          {phase === 'over' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-wk-bg/55 backdrop-blur-[1px] rounded-2xl">
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.2em] uppercase">Game over</p>
              <p className="font-score text-5xl text-wk-gold leading-none">{result.score}</p>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">punten</p>
              {result.record && <p className="font-mono text-xs text-wk-green tracking-[0.14em] uppercase">🏆 Nieuw record!</p>}
              <button onClick={(e) => { e.stopPropagation(); start() }} className="mt-1 font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer">
                Nog een keer
              </button>
            </div>
          )}
        </div>

        <div className="gx-hide"><GameLeaderboard entries={board} currentUserId={currentUserId} /></div>
      </div>
    </div>
  )
}
