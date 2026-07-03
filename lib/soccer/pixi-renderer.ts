// WebGL-renderer (PixiJS v8) voor de voetbal-sim. Leest state, muteert 'm nooit.
// Pixi wordt DYNAMISCH geïmporteerd in init() zodat het nooit tijdens SSR laadt
// (het raakt WebGL/canvas). De sim/AI/input blijven volledig ongemoeid.
//
// Scene-opbouw:
//   stage
//   ├─ world (Container, krijgt camera-transform = scale(zoom) + pan)
//   │   ├─ pitch      (Graphics, één keer getekend in wereld-coördinaten)
//   │   ├─ shadows    (Container: één ellips per speler + bal)
//   │   ├─ entities   (Container: spelers + bal)
//   │   └─ fx         (Container: goal-particles)
//   └─ vignette (Sprite in scherm-ruimte)

import {
  BALL_RADIUS,
  CAMERA_LERP,
  CENTER_CIRCLE_R,
  GOAL_DEPTH,
  GOAL_WIDTH,
  KICK_COOLDOWN,
  PENALTY_H,
  PENALTY_W,
  PITCH_LENGTH,
  PITCH_WIDTH,
  PLAYER_RADIUS,
  PLAYERS_PER_TEAM,
  TUMBLE_TIME,
} from './constants'
import type { GameState, MatchPhase, PlayerState, TeamMeta } from './types'

const VIEW_WORLD_H = 545 // wereld-eenheden verticaal in beeld → zoom (lager = verder ingezoomd; ~10% ingezoomd t.o.v. 600)
const CINE_DUR = 1.0 // duur van de cinematische omhaal-zoom (s): soepel in en weer uit
const CINE_PEAK = 0.42 // hoeveel extra ingezoomd op de piek van de omhaal
const FACES_DIR = '/spelers'
const GRASS_DARK = 0x1f7a37
const GRASS_LIGHT = 0x249041
const HEAD_FACTOR = 1.08 // kop-grootte t.o.v. spelerstraal
const STAND_DEPTH = 170 // diepte van de tribunes rond het veld
const RUNOFF = 30 // gras-uitloop tussen lijn en tribune
const CROWD_STEP = 14 // rasterafstand van de toeschouwers
const CROWD_COLORS = [0xe63946, 0xf4b92e, 0x2d6be5, 0x2ea84b, 0xffffff, 0xd9d2c5, 0xe8b48c, 0x3a4252, 0x8a5a3b]
const FW_COLORS = [0xffd417, 0xe63946, 0x2d6be5, 0x2ea84b, 0xffffff, 0xff7ad9, 0x7c3aed, 0xff8a3d]

/* eslint-disable @typescript-eslint/no-explicit-any */
// We typen Pixi los (any) omdat het dynamisch geladen wordt; de sim-types blijven strikt.
type Node = { c: any; headGroup: any; head: any; tex: { front: any; left: any; right: any } | null; torso: any; legL: any; legR: any; armL: any; armR: any; ring: any }

// Drie kijkrichtingen per gezicht via naamconventie: face.png / face-l.png / face-r.png.
function faceVariants(face: string): { front: string; left: string; right: string } {
  const m = face.match(/^(.*?)(\.[a-z0-9]+)$/i)
  const base = m ? m[1] : face
  const ext = m ? m[2] : '.png'
  return { front: `${FACES_DIR}/${base}${ext}`, left: `${FACES_DIR}/${base}-l${ext}`, right: `${FACES_DIR}/${base}-r${ext}` }
}
type Particle = { g: any; vx: number; vy: number; life: number; max: number }

export class PixiSoccerRenderer {
  private PIXI: any = null
  private app: any = null
  private world: any = null
  private shadowLayer: any = null
  private entityLayer: any = null
  private fxLayer: any = null
  private vignette: any = null
  private nodes: Node[] = []
  private legPhase: number[] = [] // loop-fase per speler (voor de zwaaiende beentjes)
  private tumbleWas: boolean[] = [] // was deze speler vorige frame aan het tuimelen? (voor de stof-burst)
  private shadows: any[] = []
  private ballNode: any = null
  private ballShadow: any = null
  private refNode: any = null
  private streakerNodes: any[] = [] // tot 3 bestormers (1 primair + 2 extra)
  private securityNode: any = null
  private securityPhase = 0
  private celebrateTeam: number | null = null // team dat juicht (armen omhoog) tijdens de goal-fase
  private teams: [TeamMeta, TeamMeta] | null = null
  private particles: Particle[] = []
  private flashes: Particle[] = [] // knipperende "camera-flitsen" op de tribune
  private rockets: { g: any; vx: number; vy: number; life: number; max: number; col: number }[] = []
  private smoke: { g: any; vx: number; vy: number; life: number; max: number }[] = []
  private trail: Particle[] = [] // bal-spoor bij snelle ballen
  private kickRings: { g: any; life: number; max: number; col: number; shot: boolean }[] = [] // schokgolf bij trappen
  private prevBallSpeed = 0 // voor kick-detectie (plotselinge snelheidssprong)
  private netL: any = null // doelnet links
  private netR: any = null // doelnet rechts
  private netRipple: { dir: number; t: number } | null = null // trillend net na een goal
  private shakeMag = 0 // camera-shake (decayt)
  private zoomPunch = 0 // korte zoom-in (decayt)
  private bikePrev = 0 // laatst gerenderde bicycleCount (voor de cinematische zoom)
  private cineTime = 0 // resterende tijd van de omhaal-zoom (s)
  private cineZoom = 0 // extra zoom tijdens de omhaal (0..CINE_PEAK)
  private cam = { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 }
  private started = false
  private prevPhase: MatchPhase | null = null
  private ballSpin = 0
  private vw = 0
  private vh = 0
  // Venue + weer (willekeurig per wedstrijd, puur cosmetisch)
  private venue: 'stadion' | 'zaal' | 'strand' | 'sneeuw' = 'stadion'
  private weather: 'clear' | 'rain' | 'snow' = 'clear'
  private ballScale = 1
  private headScale = 1 // >1 = grote-koppen-modus (chaos-mutator)
  private adTop: any = null // scrollende bovenboarding (ennovate-logo's)
  private adTopStep = 0
  private adTopOffset = 0
  private rainGfx: any = null
  private lightning: any = null
  private rainMood: any = null
  private rainDrops: { x: number; y: number; len: number; spd: number }[] = []
  private lightTimer = 4
  private lightFlash = 0
  ready = false
  get activeWeather(): 'clear' | 'rain' | 'snow' { return this.weather }

  async init(canvas: HTMLCanvasElement, state: GameState, faces: string[], opts?: { venue?: 'stadion' | 'zaal' | 'strand' | 'sneeuw'; weather?: 'clear' | 'rain' | 'snow'; ballScale?: number }) {
    const PIXI = await import('pixi.js')
    this.PIXI = PIXI
    this.ballScale = opts?.ballScale ?? state.ballScale ?? 1
    this.headScale = state.bigHeads ? 1.7 : 1
    // Venue + weer: meegegeven (door de client) of willekeurig (cosmetisch, geen invloed op de sim).
    const VENUES: ('stadion' | 'zaal' | 'strand' | 'sneeuw')[] = ['stadion', 'stadion', 'zaal', 'strand', 'sneeuw']
    this.venue = opts?.venue ?? VENUES[(Math.random() * VENUES.length) | 0]
    this.weather = opts?.weather ?? (this.venue === 'sneeuw' ? 'snow' : this.venue !== 'zaal' && Math.random() < 0.3 ? 'rain' : 'clear')
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const app = new PIXI.Application()
    await app.init({
      canvas,
      width: canvas.clientWidth || 960,
      height: canvas.clientHeight || 540,
      antialias: true,
      backgroundAlpha: 1,
      background: this.venue === 'zaal' ? 0x07090c : this.venue === 'strand' ? 0x0f2233 : this.venue === 'sneeuw' ? 0x223041 : 0x0b1a12,
      resolution: dpr,
      autoDensity: true,
    })
    app.ticker.stop() // wij renderen zelf vanuit de game-loop
    this.app = app
    this.teams = state.teams
    this.vw = app.screen.width
    this.vh = app.screen.height

    // Gezicht-textures laden: per gezicht voorkant + optioneel links/rechts. Elk apart,
    // zodat een ontbrekende links/rechts-variant de rest niet blokkeert.
    for (const f of Array.from(new Set(faces))) {
      const v = faceVariants(f)
      for (const u of [v.front, v.left, v.right]) {
        try {
          await PIXI.Assets.load(u)
        } catch {
          /* variant bestaat niet → we vallen terug op de voorkant */
        }
      }
    }

    // Scheids-, streaker-, beveiliger- + sponsor-assets (optioneel; vallen terug op tekst/figuurtjes).
    for (const u of [`${FACES_DIR}/ref.png`, `${FACES_DIR}/streaker-1.png`, `${FACES_DIR}/streaker-2.png`, `${FACES_DIR}/streaker-3.png`, `${FACES_DIR}/mbappe.png`, '/ennovate.png']) {
      try {
        await PIXI.Assets.load(u)
      } catch {
        /* asset ontbreekt → getekende terugval */
      }
    }

    this.world = new PIXI.Container()
    app.stage.addChild(this.world)
    this.buildStadium()
    this.buildPitch()
    this.shadowLayer = new PIXI.Container()
    this.entityLayer = new PIXI.Container()
    this.entityLayer.sortableChildren = true // rechtopstaande poppetjes: lager op 't veld = vóór
    this.fxLayer = new PIXI.Container()
    this.world.addChild(this.shadowLayer, this.entityLayer, this.fxLayer)

    for (const p of state.players) this.buildPlayer(p, faces)
    this.buildRef()
    this.buildStreaker()
    this.buildSecurity()
    this.buildBall()
    this.buildVignette()
    this.buildWeather()

    this.cam = { x: state.ball.pos.x, y: state.ball.pos.y }
    this.started = false
    this.ready = true
  }

  // Stadion rond het veld: betonnen tribune-kader, gras-uitloop, reclameborden en publiek.
  private buildStadium() {
    const PIXI = this.PIXI
    const L = PITCH_LENGTH
    const W = PITCH_WIDTH
    const D = STAND_DEPTH
    const g = new PIXI.Graphics()

    if (this.venue === 'strand') {
      // Strand: zee rondom, dan nat zand, dan droog zand tot de lijnen.
      g.rect(-D, -D, L + 2 * D, W + 2 * D).fill(0x1E6F9E) // zee
      g.rect(-D * 0.62, -D * 0.62, L + 2 * D * 0.62, W + 2 * D * 0.62).fill(0x2b86b8) // ondiep water
      g.rect(-D * 0.34, -D * 0.34, L + 2 * D * 0.34, W + 2 * D * 0.34).fill(0xC9A76A) // nat zand
      g.rect(-RUNOFF, -RUNOFF, L + 2 * RUNOFF, W + 2 * RUNOFF).fill(0xE3C68A) // droog zand-uitloop
      this.world.addChild(g)
      return
    }

    if (this.venue === 'zaal') {
      // Zaal: donkere hal met een lichte boarding-rand rond het veld.
      g.rect(-D, -D, L + 2 * D, W + 2 * D).fill(0x0c0f14)
      g.rect(-D * 0.5, -D * 0.5, L + 2 * D * 0.5, W + 2 * D * 0.5).fill(0x141922)
      const bw = 12
      g.rect(-RUNOFF, -RUNOFF, L + 2 * RUNOFF, W + 2 * RUNOFF).fill(0x11151d) // vloerrand
      this.world.addChild(g)
      this.buildAdBoards(bw) // gesegmenteerde reclame-boarding (zaalhek)
      // schaars publiek achter de boarding (donkerder)
      const crowd = new PIXI.Graphics()
      const inRunoff = (x: number, y: number) => x > -RUNOFF - bw && x < L + RUNOFF + bw && y > -RUNOFF - bw && y < W + RUNOFF + bw
      for (let x = -D + 10; x < L + D; x += CROWD_STEP * 1.6) {
        for (let y = -D + 10; y < W + D; y += CROWD_STEP * 1.6) {
          if (inRunoff(x, y)) continue
          const col = CROWD_COLORS[(Math.random() * CROWD_COLORS.length) | 0]
          crowd.circle(x, y, 2.4).fill({ color: col, alpha: 0.5 })
        }
      }
      this.world.addChild(crowd)
      this.buildDugouts()
      return
    }

    if (this.venue === 'sneeuw') {
      // Besneeuwd stadion: koele grijstinten met een witte uitloop rond het veld.
      g.rect(-D, -D, L + 2 * D, W + 2 * D).fill(0x2b3644)
      g.rect(-D * 0.66, -D * 0.66, L + 2 * D * 0.66, W + 2 * D * 0.66).fill(0x3a4757)
      g.rect(-D * 0.33, -D * 0.33, L + 2 * D * 0.33, W + 2 * D * 0.33).fill(0xc7d2dc)
      g.rect(-RUNOFF, -RUNOFF, L + 2 * RUNOFF, W + 2 * RUNOFF).fill(0xeef3f7) // sneeuw-uitloop
      this.world.addChild(g)
      this.buildAdBoards(9)
      // ingepakt publiek (donkerder stipjes)
      const crowd = new PIXI.Graphics()
      const inRunoff = (x: number, y: number) => x > -RUNOFF && x < L + RUNOFF && y > -RUNOFF && y < W + RUNOFF
      for (let x = -D + 7; x < L + D; x += CROWD_STEP) {
        for (let y = -D + 7; y < W + D; y += CROWD_STEP) {
          if (inRunoff(x, y)) continue
          const col = CROWD_COLORS[(Math.random() * CROWD_COLORS.length) | 0]
          crowd.circle(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, 2.6 + Math.random()).fill({ color: col, alpha: 0.75 })
        }
      }
      this.world.addChild(crowd)
      this.buildDugouts()
      return
    }

    // Stadion (standaard): beton-kader + trapsgewijze rand + gras-uitloop + reclameborden.
    g.rect(-D, -D, L + 2 * D, W + 2 * D).fill(0x141a24)
    g.rect(-D * 0.66, -D * 0.66, L + 2 * D * 0.66, W + 2 * D * 0.66).fill(0x1b2430)
    g.rect(-D * 0.33, -D * 0.33, L + 2 * D * 0.33, W + 2 * D * 0.33).fill(0x222c3a)
    g.rect(-RUNOFF, -RUNOFF, L + 2 * RUNOFF, W + 2 * RUNOFF).fill(0x1c8039)
    this.world.addChild(g)
    this.buildAdBoards(10)

    // publiek: raster van gekleurde stipjes op de tribunes (alles buiten de uitloop)
    const crowd = new PIXI.Graphics()
    const inRunoff = (x: number, y: number) => x > -RUNOFF && x < L + RUNOFF && y > -RUNOFF && y < W + RUNOFF
    for (let x = -D + 7; x < L + D; x += CROWD_STEP) {
      for (let y = -D + 7; y < W + D; y += CROWD_STEP) {
        if (inRunoff(x, y)) continue
        const jx = x + (Math.random() - 0.5) * 6
        const jy = y + (Math.random() - 0.5) * 6
        const col = CROWD_COLORS[(Math.random() * CROWD_COLORS.length) | 0]
        crowd.circle(jx, jy, 2.8 + Math.random() * 1.2).fill({ color: col, alpha: 0.9 })
      }
    }
    this.world.addChild(crowd)
    this.buildDugouts()
  }

  // Reclameborden: donkere boarding rondom (het witte/transparante Ennovate-logo leest daarop),
  // met herhaalde ennovate.png. De bovenboarding scrollt (LED-stijl). `aw` = boarding-dikte.
  private buildAdBoards(aw: number) {
    const PIXI = this.PIXI
    const L = PITCH_LENGTH, W = PITCH_WIDTH
    const x0 = -RUNOFF, x1 = L + RUNOFF
    // Doelopening (+ marge): daar lopen de zij-borden NIET doorheen.
    const gy0 = W / 2 - GOAL_WIDTH / 2 - 8
    const gy1 = W / 2 + GOAL_WIDTH / 2 + 8
    const boardCol = 0x121821
    const boards = new PIXI.Graphics()
    boards.rect(x0, -aw, x1 - x0, aw).fill(boardCol) // boven
    boards.rect(x0, W, x1 - x0, aw).fill(boardCol)   // onder
    boards.rect(-aw, 0, aw, gy0).fill(boardCol); boards.rect(-aw, gy1, aw, W - gy1).fill(boardCol) // links (doelgat)
    boards.rect(L, 0, aw, gy0).fill(boardCol); boards.rect(L, gy1, aw, W - gy1).fill(boardCol)     // rechts (doelgat)
    boards.rect(x0, -aw, x1 - x0, 1.4).fill({ color: 0xffffff, alpha: 0.08 }) // subtiele glans boven
    this.world.addChild(boards)

    const tex = PIXI.Assets.get('/ennovate.png') || null
    if (!tex) return
    const logoH = aw * 0.8
    const logoW = logoH * ((tex.width || 1) / (tex.height || 1))
    const step = logoW + logoW * 1.4 // logo + tussenruimte
    const addLogo = (parent: any, cx: number, cy: number) => {
      const s = new PIXI.Sprite(tex); s.anchor.set(0.5); s.width = logoW; s.height = logoH; s.position.set(cx, cy); parent.addChild(s)
    }
    // Statische logo's op de onderboarding.
    const bottom = new PIXI.Container()
    for (let x = x0 + step / 2; x < x1; x += step) addLogo(bottom, x, W + aw / 2)
    this.world.addChild(bottom)
    // Scrollende logo's op de bovenboarding (iets buiten de randen getegeld → naadloos loopen).
    const top = new PIXI.Container()
    for (let x = x0 - step; x < x1 + step; x += step) addLogo(top, x, -aw / 2)
    this.world.addChild(top)
    this.adTop = top
    this.adTopStep = step
    this.adTopOffset = 0
  }

  // Bovenboarding laten scrollen (LED-stijl). Wrap per `step` → naadloze lus.
  private updateAdBoards(dt: number) {
    if (!this.adTop) return
    this.adTopOffset = (this.adTopOffset - 70 * dt) % this.adTopStep
    this.adTop.position.x = this.adTopOffset
  }

  // Twee dugouts (bank + afdak) op de onderste zijlijn, links en rechts van de middenstip.
  // In de teamkleuren, met een rij zittende wisselspelers + coach.
  private buildDugouts() {
    const PIXI = this.PIXI
    const L = PITCH_LENGTH, W = PITCH_WIDTH
    const g = new PIXI.Graphics()
    const dw = 172, dh = 30
    const topY = W + 14 // net achter de onderlijn/boarding
    const cA: string = this.teams?.[0]?.shirt ?? '#2d6be5'
    const cB: string = this.teams?.[1]?.shirt ?? '#e63946'
    const draw = (cx: number, color: string) => {
      const x = cx - dw / 2
      g.roundRect(x, topY, dw, dh, 6).fill(0x11151c).stroke({ width: 2, color: 0x2a3341, alpha: 0.9 }) // afdak
      g.rect(x + 5, topY + 3, dw - 10, 4).fill(color) // team-accent naar het veld
      g.roundRect(x + 10, topY + dh - 11, dw - 20, 7, 2).fill(0x2b3644) // bank
      for (let i = 0; i < 5; i++) { const px = x + 24 + i * ((dw - 48) / 4); g.circle(px, topY + dh - 8, 3.6).fill(i === 0 ? 0x1a1a1a : color) } // coach + 4 subs
    }
    draw(L / 2 - dw * 0.7, cA)
    draw(L / 2 + dw * 0.7, cB)
    this.world.addChild(g)
  }

  // Willekeurig punt op de tribune (voor de knipperende flitsen).
  private randomStandPoint(): { x: number; y: number } {
    const L = PITCH_LENGTH
    const W = PITCH_WIDTH
    const D = STAND_DEPTH
    for (let i = 0; i < 8; i++) {
      const x = -D + Math.random() * (L + 2 * D)
      const y = -D + Math.random() * (W + 2 * D)
      if (x < -RUNOFF || x > L + RUNOFF || y < -RUNOFF || y > W + RUNOFF) return { x, y }
    }
    return { x: -D * 0.5, y: -D * 0.5 }
  }

  private buildPitch() {
    const PIXI = this.PIXI
    const g = new PIXI.Graphics()
    const L = PITCH_LENGTH
    const W = PITCH_WIDTH
    // Vloer per venue: gras-maaibanen / houten parket (zaal) / geharkt zand (strand).
    if (this.venue === 'zaal') {
      const planks = 22
      const ph = W / planks
      for (let i = 0; i < planks; i++) g.rect(0, i * ph, L, ph + 1).fill(i % 2 === 0 ? 0x9a6a34 : 0xa5763c)
    } else if (this.venue === 'strand') {
      const bands = 26
      const bw2 = L / bands
      for (let i = 0; i < bands; i++) g.rect(i * bw2, 0, bw2 + 1, W).fill(i % 2 === 0 ? 0xE3C68A : 0xDDBE7C)
    } else if (this.venue === 'sneeuw') {
      const bands = 16
      const bw3 = L / bands
      for (let i = 0; i < bands; i++) g.rect(i * bw3, 0, bw3 + 1, W).fill(i % 2 === 0 ? 0xf3f7fb : 0xe4ecf3) // besneeuwde banen
    } else {
      const bands = 16
      const bw = L / bands
      for (let i = 0; i < bands; i++) g.rect(i * bw, 0, bw + 1, W).fill(i % 2 === 0 ? GRASS_DARK : GRASS_LIGHT)
    }
    // Lijnkleur: op sneeuw donkere/blauwe lijnen (wit-op-wit is onzichtbaar), op zand vaag wit, verder helder wit.
    const line = this.venue === 'sneeuw'
      ? { width: 3, color: 0x5b6b7d, alpha: 0.7 }
      : this.venue === 'strand'
        ? { width: 3, color: 0xffffff, alpha: 0.45 }
        : { width: 3, color: 0xffffff, alpha: 0.72 }
    // buitenlijnen + middenlijn + cirkel
    g.rect(0, 0, L, W).stroke(line)
    g.moveTo(L / 2, 0).lineTo(L / 2, W).stroke(line)
    g.circle(L / 2, W / 2, CENTER_CIRCLE_R).stroke(line)
    g.circle(L / 2, W / 2, 6).fill({ color: 0xffffff, alpha: 0.72 })
    // strafschopgebieden
    g.rect(0, W / 2 - PENALTY_H / 2, PENALTY_W, PENALTY_H).stroke(line)
    g.rect(L - PENALTY_W, W / 2 - PENALTY_H / 2, PENALTY_W, PENALTY_H).stroke(line)
    // doelen (netjes gevuld + omlijnd)
    const gy = W / 2 - GOAL_WIDTH / 2
    g.rect(-GOAL_DEPTH, gy, GOAL_DEPTH, GOAL_WIDTH).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 3.5, color: 0xffffff, alpha: 0.9 })
    g.rect(L, gy, GOAL_DEPTH, GOAL_WIDTH).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 3.5, color: 0xffffff, alpha: 0.9 })
    this.world.addChild(g)
    // doelnetten (mazenraster) — trillen kort bij een goal
    this.netL = new PIXI.Graphics()
    this.netR = new PIXI.Graphics()
    this.world.addChild(this.netL, this.netR)
    this.drawNet(this.netL, -1, 0)
    this.drawNet(this.netR, 1, 0)
  }

  // Teken het net-raster in een doel; `amp` duwt de achterwand naar buiten (bolling na een goal).
  private drawNet(g: any, dir: number, amp: number) {
    const L = PITCH_LENGTH
    const gy = PITCH_WIDTH / 2 - GOAL_WIDTH / 2
    const goalLineX = dir < 0 ? 0 : L
    const backX = dir < 0 ? -GOAL_DEPTH - amp : L + GOAL_DEPTH + amp
    const col = { width: 1, color: 0xffffff, alpha: 0.26 }
    g.clear()
    const cells = 6
    for (let i = 0; i <= cells; i++) {
      const y = gy + (GOAL_WIDTH * i) / cells
      g.moveTo(goalLineX, y).lineTo(backX, y).stroke(col)
    }
    const depth = 3
    for (let j = 1; j <= depth; j++) {
      const x = goalLineX + (backX - goalLineX) * (j / depth)
      g.moveTo(x, gy).lineTo(x, gy + GOAL_WIDTH).stroke(col)
    }
  }

  private updateNets(dt: number) {
    if (!this.netRipple) return
    this.netRipple.t += dt
    const f = this.netRipple.t / 0.55
    const g = this.netRipple.dir < 0 ? this.netL : this.netR
    if (f >= 1) {
      this.drawNet(g, this.netRipple.dir, 0) // terug naar rust
      this.netRipple = null
      return
    }
    const amp = Math.sin(f * Math.PI * 4) * 12 * (1 - f) // gedempte trilling naar buiten
    this.drawNet(g, this.netRipple.dir, Math.max(0, amp))
  }

  private buildPlayer(p: PlayerState, faces: string[]) {
    const PIXI = this.PIXI
    const meta = this.teams![p.team]
    const kit = p.role === 'GK' ? meta.keeper : meta.shirt
    const r = PLAYER_RADIUS
    const SKIN = 0xe8b48c
    const SHOE = 0x1b1b1b

    // schaduw op de grond (aparte laag, onder iedereen)
    const sh = new PIXI.Graphics()
    sh.ellipse(0, 0, r * 0.95, r * 0.42).fill({ color: 0x000000, alpha: 0.28 })
    this.shadowLayer.addChild(sh)
    this.shadows[p.id] = sh

    const c = new PIXI.Container()

    // highlight-ring op de grond (bestuurde speler)
    const ring = new PIXI.Graphics()
    ring.ellipse(0, r * 1.15, r * 1.25, r * 0.55).stroke({ width: 2.4, color: 0xffffff, alpha: 0.95 })
    ring.visible = false

    // beentjes met schoentjes — getekend vanaf de heup omlaag (wat groter)
    const makeLeg = () => {
      const g = new PIXI.Graphics()
      g.roundRect(-r * 0.21, 0, r * 0.42, r * 0.62, r * 0.16).fill(SKIN).stroke({ width: 1, color: 0x000000, alpha: 0.3 })
      g.roundRect(-r * 0.28, r * 0.5, r * 0.56, r * 0.24, r * 0.1).fill(SHOE)
      return g
    }
    const legL = makeLeg()
    const legR = makeLeg()

    // armpjes: korte mouw (teamkleur) + huid-onderarm + handje, getekend vanaf de schouder
    // omlaag zodat ze om die pivot kunnen zwaaien tijdens het rennen (duidelijk zichtbaar).
    const makeArm = () => {
      const g = new PIXI.Graphics()
      g.roundRect(-r * 0.17, 0, r * 0.34, r * 0.5, r * 0.15).fill(shadeHex(kit, -0.06)).stroke({ width: 1.2, color: meta.trim, alpha: 0.6 }) // mouw
      g.roundRect(-r * 0.15, r * 0.42, r * 0.3, r * 0.42, r * 0.13).fill(SKIN).stroke({ width: 1, color: 0x000000, alpha: 0.25 }) // onderarm
      g.circle(0, r * 0.9, r * 0.17).fill(SKIN) // handje
      return g
    }
    const armL = makeArm()
    const armR = makeArm()

    // shirt (torso) in teamkleur met een witte V-hals — langer + minder rond
    // (leest als een tenue i.p.v. een bolletje; extra hoog voor duidelijke teamkleur)
    const torso = new PIXI.Graphics()
    torso.roundRect(-r * 0.86, -r * 0.86, r * 1.72, r * 1.56, r * 0.3).fill(kit).stroke({ width: 2, color: meta.trim, alpha: 0.95 })
    torso.poly([-r * 0.26, -r * 0.86, r * 0.26, -r * 0.86, 0, -r * 0.46]).fill(0xffffff)
    // Rugnummer op de onderkant van het shirt (keeper = 1). Kind van de torso → bobt vanzelf mee.
    const shirtNo = (p.id % PLAYERS_PER_TEAM) + 1
    const num = new PIXI.Text({ text: String(shirtNo), style: { fontFamily: 'Arial', fontSize: 18, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 3.5 } } })
    num.anchor.set(0.5)
    num.scale.set((r * 0.7) / 18)
    num.position.set(0, r * 0.18)
    torso.addChild(num)

    // hoofd: het volledige transparante gezicht-PNG (GEEN crop, GEEN cirkel); 3 kijkrichtingen.
    const headGroup = new PIXI.Container()
    const headR = r * HEAD_FACTOR * this.headScale
    const texOf = (url: string): any => PIXI.Assets.get(url) || null
    const v = p.face && faces.includes(p.face) ? faceVariants(p.face) : null
    const texFront = v ? texOf(v.front) : null
    let head: any
    let tex: { front: any; left: any; right: any } | null = null
    if (texFront) {
      // left/right = null als die variant er niet is → animatePlayer spiegelt dan de andere.
      tex = { front: texFront, left: v ? texOf(v.left) : null, right: v ? texOf(v.right) : null }
      head = new PIXI.Sprite(texFront)
      head.anchor.set(0.5)
      head.scale.set((headR * 2) / (texFront.width || 1)) // uniform → geen vervorming
      headGroup.addChild(head)
    } else {
      // Geen gezicht → effen kopje met team-rand zodat het team leesbaar blijft.
      head = new PIXI.Graphics()
      head.circle(0, 0, headR * 0.8).fill(SKIN).stroke({ width: 2.2, color: kit, alpha: 1 })
      headGroup.addChild(head)
    }

    // arms vóór de torso zodat ze altijd zichtbaar blijven (ook wanneer ze bij het rennen
    // naar binnen zwaaien); daarna pas de kop bovenop.
    c.addChild(ring, legL, legR, torso, armL, armR, headGroup)
    this.entityLayer.addChild(c)
    this.legPhase[p.id] = 0
    this.nodes[p.id] = { c, headGroup, head, tex, torso, legL, legR, armL, armR, ring }
  }

  // Loop-animatie: stappende beentjes (tempo ~ snelheid), torso/kop-bob, kleine kop-turn
  // richting de looprichting, en een trap-pose net na een schot. Puur cosmetisch.
  private animatePlayer(p: PlayerState, n: Node, dt: number) {
    const r = PLAYER_RADIUS
    const speed = Math.hypot(p.vel.x, p.vel.y)
    const moving = speed > 12
    const ph = (this.legPhase[p.id] ?? 0) + (moving ? speed : 0) * dt * 0.09
    this.legPhase[p.id] = ph

    const fl = Math.hypot(p.facing.x, p.facing.y)
    const fx = fl > 0.1 ? p.facing.x / fl : 0

    // beentjes: heupen naast elkaar, voetjes wippen om de beurt omhoog
    const HIP_Y = r * 0.5
    const LIFT = moving ? r * 0.4 : 0
    n.legL.position.set(-r * 0.34, HIP_Y - Math.max(0, Math.sin(ph)) * LIFT)
    const kicking = p.kickCooldown > KICK_COOLDOWN * 0.45
    n.legR.position.set(r * 0.34, kicking ? HIP_Y - r * 0.55 : HIP_Y - Math.max(0, Math.sin(ph + Math.PI)) * LIFT)

    // kop-plaatje kiezen op looprichting; ontbreekt een zijkant, dan spiegelen we de andere.
    if (n.tex) {
      let t = n.tex.front
      let mirror = false
      if (fx < -0.35) {
        if (n.tex.left) t = n.tex.left
        else if (n.tex.right) { t = n.tex.right; mirror = true }
      } else if (fx > 0.35) {
        if (n.tex.right) t = n.tex.right
        else if (n.tex.left) { t = n.tex.left; mirror = true }
      }
      if (n.head.texture !== t) n.head.texture = t
      const mag = (r * HEAD_FACTOR * this.headScale * 2) / (t.width || 1)
      n.head.scale.set(mirror ? -mag : mag, mag)
    }

    const bob = moving ? Math.abs(Math.sin(ph * 2)) * r * 0.1 : 0
    n.torso.position.set(0, r * 0.05 - bob)
    // armpjes: iets gespreid in rust, en zwaaien tegengesteld aan de beentjes tijdens 't rennen
    const armAmp = moving ? 0.5 : 0
    const OUT = 0.24
    n.armL.position.set(-r * 0.9, -r * 0.5 - bob)
    n.armR.position.set(r * 0.9, -r * 0.5 - bob)
    if (this.celebrateTeam === p.team) {
      // juichen: armen omhoog + zwaaien
      const wave = Math.sin(ph * 1.4) * 0.28
      n.armL.rotation = -2.5 + wave
      n.armR.rotation = 2.5 - wave
    } else {
      n.armL.rotation = -OUT + Math.sin(ph + Math.PI) * armAmp
      n.armR.rotation = OUT + Math.sin(ph) * armAmp
    }
    // kop iets meedraaien met de looprichting (subtiel; de plaatjes doen het meeste werk)
    n.headGroup.position.set(fx * r * 0.1, -r * 1.5 - bob)
    // tuimel-pose: omvergelopen → tuimelt over de kop (2,4 slag, uitdempend), ledematen spartelen,
    // en een squash bij de landing. Anders: sliding-pose (bijna plat) of rechtop.
    n.c.scale.set(1, 1)
    if (p.tumbleTimer > 0) {
      const prog = 1 - p.tumbleTimer / TUMBLE_TIME // 0→1
      const ease = 1 - (1 - prog) * (1 - prog) // ease-out → snel begin, zachte landing
      const sign = (p.vel.x || p.facing.x) >= 0 ? 1 : -1
      n.c.rotation = sign * ease * Math.PI * 2.4
      const land = prog > 0.82 ? (prog - 0.82) / 0.18 : 0
      n.c.scale.set(1 + land * 0.12, 1 - land * 0.28) // platklappen bij de landing
      const flail = Math.sin(prog * 26)
      n.armL.rotation = -1.4 + flail * 0.6
      n.armR.rotation = 1.4 - flail * 0.6
      n.legL.position.set(-r * 0.34, HIP_Y - Math.abs(flail) * r * 0.5)
      n.legR.position.set(r * 0.34, HIP_Y - Math.abs(Math.sin(prog * 26 + 1)) * r * 0.5)
    } else if (p.slideTimer > 0 && p.slideTackle) {
      n.c.rotation = p.facing.x >= 0 ? 1.45 : -1.45 // bijna plat op het gras
      n.legR.position.set(r * 0.4, HIP_Y - r * 0.5) // gestrekt been vooruit
    } else {
      n.c.rotation = 0
    }
  }

  // Scheidsrechter: zwart-geel poppetje (geen gezicht, geen animatie).
  private buildRef() {
    const PIXI = this.PIXI
    const r = PLAYER_RADIUS
    const c = new PIXI.Container()
    const sh = new PIXI.Graphics()
    sh.ellipse(0, r * 1.1, r * 0.8, r * 0.38).fill({ color: 0x000000, alpha: 0.25 })
    const legL = new PIXI.Graphics(); legL.roundRect(-r * 0.19 - r * 0.28, r * 0.45, r * 0.38, r * 0.6, r * 0.14).fill(0x1b1b1b)
    const legR = new PIXI.Graphics(); legR.roundRect(-r * 0.19 + r * 0.28, r * 0.45, r * 0.38, r * 0.6, r * 0.14).fill(0x1b1b1b)
    const torso = new PIXI.Graphics()
    torso.roundRect(-r * 0.7, -r * 0.5, r * 1.4, r * 1.15, r * 0.4).fill(0x17181d).stroke({ width: 2, color: 0xf4b92e, alpha: 0.95 })
    const head = this.headSprite(`${FACES_DIR}/ref.png`, r, 0xe8b48c)
    c.addChild(sh, legL, legR, torso, head)
    c.scale.set(1.2) // scheids iets groter dan de spelers
    this.entityLayer.addChild(c)
    this.refNode = c
  }

  // Kop als sprite uit een geladen PNG (val terug op een getekend rond kopje).
  private headSprite(url: string, r: number, skin: number): any {
    const PIXI = this.PIXI
    const tex = PIXI.Assets.get(url) || null
    if (tex) {
      const s = new PIXI.Sprite(tex)
      s.anchor.set(0.5)
      s.scale.set((r * 1.85) / (tex.width || 1)) // kop-breedte ~ speler-proportie
      s.position.set(0, -r * 1.05)
      return s
    }
    const g = new PIXI.Graphics()
    g.circle(0, -r * 0.95, r * 0.62).fill(skin).stroke({ width: 1.4, color: 0x111418, alpha: 0.5 })
    return g
  }

  // Veldbestormers: tot 3 vrolijke (semi-naakte) poppetjes met een zwart censuurbalkje.
  private buildStreaker() {
    const PIXI = this.PIXI
    const r = PLAYER_RADIUS
    const skin = 0xf0c19b
    for (let k = 0; k < 3; k++) {
      const c = new PIXI.Container()
      const sh = new PIXI.Graphics()
      sh.ellipse(0, r * 1.1, r * 0.8, r * 0.38).fill({ color: 0x000000, alpha: 0.25 })
      const legL = new PIXI.Graphics(); legL.roundRect(-r * 0.34, 0, r * 0.34, r * 0.62, r * 0.16).fill(skin); legL.position.set(-r * 0.02, r * 0.42)
      const legR = new PIXI.Graphics(); legR.roundRect(0, 0, r * 0.34, r * 0.62, r * 0.16).fill(skin); legR.position.set(r * 0.02, r * 0.42)
      const torso = new PIXI.Graphics()
      torso.roundRect(-r * 0.6, -r * 0.5, r * 1.2, r * 1.0, r * 0.42).fill(skin).stroke({ width: 1.4, color: 0x9c6b45, alpha: 0.5 })
      const armL = new PIXI.Graphics(); armL.roundRect(-r * 0.16, -r * 0.62, r * 0.32, r * 0.7, r * 0.15).fill(skin); armL.position.set(-r * 0.5, -r * 0.32)
      const armR = new PIXI.Graphics(); armR.roundRect(-r * 0.16, -r * 0.62, r * 0.32, r * 0.7, r * 0.15).fill(skin); armR.position.set(r * 0.5, -r * 0.32)
      const bar = new PIXI.Graphics(); bar.roundRect(-r * 0.42, r * 0.16, r * 0.84, r * 0.34, r * 0.08).fill(0x0a0a0a)
      const head0 = this.headSprite(`${FACES_DIR}/streaker-1.png`, r, skin)
      const head1 = this.headSprite(`${FACES_DIR}/streaker-2.png`, r, skin)
      const head2 = this.headSprite(`${FACES_DIR}/streaker-3.png`, r, skin)
      head1.visible = false
      head2.visible = false
      c.addChild(sh, legL, legR, torso, bar, armL, armR, head0, head1, head2)
      c.visible = false
      c.scale.set(1.56) // flink groter dan de spelers → goed zichtbaar
      this.entityLayer.addChild(c)
      this.streakerNodes.push({ c, legL, legR, armL, armR, heads: [head0, head1, head2], phase: k * 1.7 })
    }
  }

  // Beveiliger die op de streaker jaagt. Bij voorkeur het meegeleverde mbappe.png (legerpak
  // t/m de billen, ZONDER benen) als bovenlijf-sprite; we tekenen er rennende benen onder.
  // Ontbreekt de asset, dan valt-ie terug op een getekend hi-vis-figuurtje.
  private buildSecurity() {
    const PIXI = this.PIXI
    const r = PLAYER_RADIUS
    const skin = 0xd9a877
    const c = new PIXI.Container()
    c.scale.set(1.2) // iets groter dan de spelers → duidelijk zichtbaar
    const sh = new PIXI.Graphics()
    sh.ellipse(0, r * 1.32, r * 0.85, r * 0.4).fill({ color: 0x000000, alpha: 0.25 })
    // Benen (broek): getekend, rennend + wat langer — bij beide varianten onder het bovenlijf.
    const trouser = 0x3c4a2f // legergroen (past bij het legerpak)
    const legL = new PIXI.Graphics(); legL.roundRect(-r * 0.2, 0, r * 0.4, r * 0.92, r * 0.14).fill(trouser); legL.position.set(-r * 0.26, r * 0.4)
    const legR = new PIXI.Graphics(); legR.roundRect(-r * 0.2, 0, r * 0.4, r * 0.92, r * 0.14).fill(trouser); legR.position.set(r * 0.26, r * 0.4)

    const tex = PIXI.Assets.get(`${FACES_DIR}/mbappe.png`) || null
    if (tex) {
      // Bovenlijf-sprite: onderkant op de heuplijn, strekt naar boven (kop + romp + armen zitten erin).
      const body = new PIXI.Sprite(tex)
      body.anchor.set(0.5, 1)
      body.scale.set((r * 2.3) / (tex.width || 1))
      body.position.set(0, r * 0.6)
      c.addChild(sh, legL, legR, body)
      c.visible = false
      this.entityLayer.addChild(c)
      this.securityNode = { c, legL, legR, body }
      return
    }

    // Terugval: getekend hi-vis-figuurtje met petje + zwaaiende armen.
    const vest = 0xf7e017 // hi-vis geel
    const armL = new PIXI.Graphics(); armL.roundRect(-r * 0.15, 0, r * 0.3, r * 0.6, r * 0.13).fill(skin); armL.position.set(-r * 0.78, -r * 0.42)
    const armR = new PIXI.Graphics(); armR.roundRect(-r * 0.15, 0, r * 0.3, r * 0.6, r * 0.13).fill(skin); armR.position.set(r * 0.78, -r * 0.42)
    const torso = new PIXI.Graphics()
    torso.roundRect(-r * 0.78, -r * 0.6, r * 1.56, r * 1.25, r * 0.28).fill(vest).stroke({ width: 2, color: 0x2a2a2a, alpha: 0.8 })
    torso.rect(-r * 0.12, -r * 0.6, r * 0.24, r * 1.25).fill({ color: 0xffffff, alpha: 0.7 }) // reflectiestreep
    const head = new PIXI.Graphics()
    head.circle(0, -r * 1.02, r * 0.62).fill(skin).stroke({ width: 1.4, color: 0x111418, alpha: 0.4 })
    head.roundRect(-r * 0.6, -r * 1.5, r * 1.2, r * 0.4, r * 0.12).fill(0x1e2a44) // petje
    c.addChild(sh, legL, legR, armL, armR, torso, head)
    c.visible = false
    this.entityLayer.addChild(c)
    this.securityNode = { c, legL, legR, armL, armR }
  }

  private buildBall() {
    const PIXI = this.PIXI
    const sh = new PIXI.Graphics()
    sh.ellipse(0, 0, BALL_RADIUS * 1.1, BALL_RADIUS * 0.6).fill({ color: 0x000000, alpha: 0.28 })
    this.shadowLayer.addChild(sh)
    this.ballShadow = sh

    const c = new PIXI.Container()
    const g = new PIXI.Graphics()
    // Bal-skin per venue: op sneeuw een oranje winterbal (beter zichtbaar), anders wit met zwarte panelen.
    const snow = this.venue === 'sneeuw'
    const base = snow ? 0xff7a1a : 0xffffff
    const panel = snow ? 0x7a2e00 : 0x141414
    g.circle(0, 0, BALL_RADIUS).fill(base).stroke({ width: 1.2, color: 0x000000, alpha: 0.35 })
    // een paar "panelen" zodat de rotatie zichtbaar is
    g.circle(0, -BALL_RADIUS * 0.35, BALL_RADIUS * 0.28).fill(panel)
    g.circle(BALL_RADIUS * 0.4, BALL_RADIUS * 0.35, BALL_RADIUS * 0.2).fill(panel)
    c.addChild(g)
    this.entityLayer.addChild(c)
    this.ballNode = c
  }

  private buildVignette() {
    const PIXI = this.PIXI
    // radiale gradient via een off-screen canvas → texture (client-side, dus veilig)
    const size = 512
    const cnv = document.createElement('canvas')
    cnv.width = cnv.height = size
    const ctx = cnv.getContext('2d')!
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.62)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.42)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    const tex = PIXI.Texture.from(cnv)
    const spr = new PIXI.Sprite(tex)
    spr.eventMode = 'none'
    this.app.stage.addChild(spr)
    this.vignette = spr
    this.layoutVignette()
  }

  private layoutVignette() {
    if (!this.vignette) return
    this.vignette.width = this.vw
    this.vignette.height = this.vh
  }

  // Weer (scherm-ruimte, boven de vignette): regen+onweer of zachte sneeuwval.
  private buildWeather() {
    if (this.weather === 'clear') return
    const PIXI = this.PIXI
    if (this.weather === 'rain') {
      this.rainMood = new PIXI.Graphics()
      this.rainMood.rect(0, 0, this.vw, this.vh).fill({ color: 0x0a1420, alpha: 0.28 })
      this.app.stage.addChild(this.rainMood)
      this.lightning = new PIXI.Graphics()
      this.app.stage.addChild(this.lightning)
    }
    this.rainGfx = new PIXI.Graphics()
    this.app.stage.addChild(this.rainGfx)
    const snow = this.weather === 'snow'
    this.rainDrops = Array.from({ length: snow ? 120 : 150 }, () => ({
      x: Math.random() * (this.vw + 120),
      y: Math.random() * this.vh,
      len: snow ? 2 + Math.random() * 2.5 : 9 + Math.random() * 15, // vlok-grootte vs regen-lengte
      spd: snow ? 60 + Math.random() * 90 : 780 + Math.random() * 560,
    }))
    this.lightTimer = 3 + Math.random() * 5
  }

  private updateWeather(dt: number) {
    if (this.weather === 'clear' || !this.rainGfx) return
    const g = this.rainGfx
    g.clear()
    if (this.weather === 'snow') {
      // zachte, dwarrelende vlokken
      for (const d of this.rainDrops) {
        d.y += d.spd * dt
        d.x += Math.sin((d.y + d.x) * 0.02) * 22 * dt // dwarrelen
        if (d.y > this.vh) { d.y = -4; d.x = Math.random() * (this.vw + 40) }
        g.circle(d.x, d.y, d.len).fill({ color: 0xffffff, alpha: 0.85 })
      }
      return
    }
    // regen
    if (this.rainMood) { this.rainMood.clear(); this.rainMood.rect(0, 0, this.vw, this.vh).fill({ color: 0x0a1420, alpha: 0.28 }) }
    for (const d of this.rainDrops) {
      d.y += d.spd * dt
      d.x -= d.spd * 0.28 * dt
      if (d.y > this.vh) { d.y = -d.len; d.x = Math.random() * (this.vw + 120) }
      if (d.x < -30) d.x = this.vw + 30
      g.moveTo(d.x, d.y).lineTo(d.x - d.len * 0.28, d.y + d.len).stroke({ width: 1.3, color: 0xbcd4e6, alpha: 0.5 })
    }
    // bliksem: af en toe een korte, flikkerende full-screen flits
    this.lightTimer -= dt
    if (this.lightTimer <= 0) { this.lightFlash = 0.7; this.lightTimer = 3.5 + Math.random() * 6 }
    const l = this.lightning
    l.clear()
    if (this.lightFlash > 0) {
      this.lightFlash = Math.max(0, this.lightFlash - dt * 2.6)
      l.rect(0, 0, this.vw, this.vh).fill({ color: 0xffffff, alpha: this.lightFlash * (0.35 + Math.random() * 0.4) })
    }
  }

  // Weer live wisselen (dynamisch weer vanuit de sim): oude regen-/onweerlagen opruimen en
  // opnieuw opbouwen voor de nieuwe toestand. Sneeuwvelden blijven sneeuwen.
  private setWeather(w: 'clear' | 'rain' | 'snow') {
    if (w === this.weather) return
    this.weather = w
    for (const n of [this.rainGfx, this.rainMood, this.lightning]) {
      if (n) { try { this.app.stage.removeChild(n) } catch { /* al weg */ } n.destroy() }
    }
    this.rainGfx = null
    this.rainMood = null
    this.lightning = null
    this.rainDrops = []
    this.lightFlash = 0
    this.buildWeather()
  }

  resize(vw: number, vh: number) {
    if (!this.ready || (vw === this.vw && vh === this.vh)) return
    this.vw = vw
    this.vh = vh
    this.app.renderer.resize(vw, vh)
    this.layoutVignette()
  }

  resetCamera(state: GameState) {
    this.cam = { x: state.ball.pos.x, y: state.ball.pos.y }
    this.started = false
  }

  draw(state: GameState, dt: number, controlled: number) {
    if (!this.ready) return
    this.celebrateTeam = state.phase === 'goal' ? state.lastGoalBy : null // armen omhoog bij een goal
    // juice: korte zoom-in + camera-shake (beide dempen uit)
    this.zoomPunch *= Math.max(0, 1 - dt * 4)
    this.shakeMag *= Math.max(0, 1 - dt * 6)
    // Cinematische omhaal-zoom: geleidelijk inzoomen op de piek en weer soepel terug (sin-bump).
    if (state.bicycleCount > this.bikePrev) this.cineTime = CINE_DUR
    this.bikePrev = state.bicycleCount
    if (this.cineTime > 0) {
      this.cineTime = Math.max(0, this.cineTime - dt)
      const p = 1 - this.cineTime / CINE_DUR // 0 → 1 over de duur
      this.cineZoom = Math.sin(p * Math.PI) ** 0.8 * CINE_PEAK
    } else this.cineZoom = 0
    const zoom = (this.vh / VIEW_WORLD_H) * (1 + this.zoomPunch + this.cineZoom)
    const viewW = this.vw / zoom
    const viewH = this.vh / zoom

    // camera volgt de bal (soepel, geklemd binnen het veld)
    if (!this.started) {
      this.cam.x = state.ball.pos.x
      this.cam.y = state.ball.pos.y
      this.started = true
    } else {
      const k = Math.min(1, CAMERA_LERP * dt)
      this.cam.x += (state.ball.pos.x - this.cam.x) * k
      this.cam.y += (state.ball.pos.y - this.cam.y) * k
    }
    const margin = 145 // wat verder buiten het veld → je ziet de tribunes aan de randen
    this.cam.x = clampCam(this.cam.x, viewW, PITCH_LENGTH, margin)
    this.cam.y = clampCam(this.cam.y, viewH, PITCH_WIDTH, margin)

    // world-transform = zoom + pan (+ shake-offset)
    const shx = this.shakeMag > 0.2 ? (Math.random() - 0.5) * this.shakeMag : 0
    const shy = this.shakeMag > 0.2 ? (Math.random() - 0.5) * this.shakeMag : 0
    this.world.scale.set(zoom)
    this.world.position.set(this.vw / 2 - this.cam.x * zoom + shx, this.vh / 2 - this.cam.y * zoom + shy)

    // spelers (met loop-animatie: zwaaiende beentjes, torso-bob, trap-pose)
    for (const p of state.players) {
      const n = this.nodes[p.id]
      if (!n) continue
      n.c.visible = !p.sentOff // van het veld gestuurd → verbergen
      const sh = this.shadows[p.id]
      if (sh) sh.visible = !p.sentOff
      if (p.sentOff) continue
      n.c.position.set(p.pos.x, p.pos.y)
      n.c.zIndex = p.pos.y // y-sortering voor correcte overlap
      n.ring.visible = p.id === controlled
      // stofwolk op het moment dat iemand omvergelopen wordt
      const tumbling = p.tumbleTimer > 0
      if (tumbling && !this.tumbleWas[p.id]) this.spawnTumbleDust(p.pos.x, p.pos.y)
      this.tumbleWas[p.id] = tumbling
      // stof-veeg tijdens een glijdende tackle
      if (p.slideTimer > 0 && p.slideTackle && dt > 0 && Math.random() < 0.6) this.spawnSlideDust(p.pos.x, p.pos.y, p.facing)
      this.animatePlayer(p, n, dt)
      if (sh) sh.position.set(p.pos.x, p.pos.y + PLAYER_RADIUS * 1.15)
    }
    // scheidsrechter (kan getackeld worden → tuimelt spinnend weg, puur fun).
    // Groeit 20% per tackle (tackleCount) → steeds imposantere scheids, geklemd op 4×.
    this.refNode.position.set(state.ref.pos.x, state.ref.pos.y)
    this.refNode.zIndex = state.ref.pos.y
    this.refNode.rotation = state.ref.tumble > 0 ? state.ref.tumble * 9 : 0
    this.refNode.scale.set(1.2 * Math.min(4, Math.pow(1.2, state.tackleCount)))

    // veldbestormers (fun): tot 3 tegelijk (1 primair + extra's). Slot 0 = state.streaker, 1-2 = extra's.
    const allStreakers = state.streaker ? [state.streaker, ...state.extraStreakers] : []
    for (let k = 0; k < this.streakerNodes.length; k++) {
      const sk = this.streakerNodes[k]
      const str = allStreakers[k]
      if (str) {
        sk.c.visible = true
        sk.heads[0].visible = str.variant === 0
        sk.heads[1].visible = str.variant === 1
        sk.heads[2].visible = str.variant === 2
        sk.c.position.set(str.pos.x, str.pos.y)
        sk.c.zIndex = str.pos.y
        const spd = Math.hypot(str.vel.x, str.vel.y)
        sk.phase += dt * (6 + spd * 0.03)
        const swing = Math.sin(sk.phase)
        sk.legL.rotation = swing * 0.7
        sk.legR.rotation = -swing * 0.7
        sk.armL.rotation = -0.35 + swing * 0.4
        sk.armR.rotation = 0.35 - swing * 0.4
        // getackeld → spinnend tuimelen; anders vrolijk wiebelen
        sk.c.rotation = str.tumble > 0 ? str.tumble * 9 : Math.sin(sk.phase * 2) * 0.04
      } else if (sk.c.visible) {
        sk.c.visible = false
      }
    }

    // beveiliger (jaagt op de streaker)
    const se = this.securityNode
    if (state.security) {
      se.c.visible = true
      se.c.position.set(state.security.pos.x, state.security.pos.y)
      se.c.zIndex = state.security.pos.y
      const sp = Math.hypot(state.security.vel.x, state.security.vel.y)
      this.securityPhase += dt * (7 + sp * 0.03)
      const sw = Math.sin(this.securityPhase)
      se.legL.rotation = sw * 0.8
      se.legR.rotation = -sw * 0.8
      if (se.armL) se.armL.rotation = -sw * 0.6
      if (se.armR) se.armR.rotation = sw * 0.6
      // mbappe-sprite: licht wiebelen + voorover leunen alsof-ie sprint
      if (se.body) { se.body.rotation = sw * 0.05; se.body.position.y = PLAYER_RADIUS * 0.6 - Math.abs(sw) * PLAYER_RADIUS * 0.06 }
      // getackeld → spinnend tuimelen (fun)
      se.c.rotation = state.security.tumble > 0 ? state.security.tumble * 9 : 0
    } else if (se.c.visible) {
      se.c.visible = false
    }

    // bal: hoogte (z) tilt 'm op het scherm omhoog + iets groter; schaduw blijft op de grond
    const b = state.ball
    this.ballNode.position.set(b.pos.x, b.pos.y - b.z)
    this.ballNode.zIndex = b.pos.y + PLAYER_RADIUS // y-sortering: meestal vóór de voeten
    const lift = 1 + b.z / 130
    this.ballNode.scale.set(lift * this.ballScale)
    const speed = Math.hypot(b.vel.x, b.vel.y)
    this.ballSpin += (speed / BALL_RADIUS) * dt * 0.6
    this.ballNode.rotation = this.ballSpin
    this.ballShadow.position.set(b.pos.x + 1 + b.z * 0.15, b.pos.y + 2)
    const shScale = Math.max(0.45, 1 - b.z / 120) * this.ballScale
    this.ballShadow.scale.set(shScale)

    // bal-trail bij snelle ballen (over de grond)
    this.updateTrail(dt, b.pos.x, b.pos.y - b.z, speed, b.z)

    // trap/pass-feedback: een plotselinge snelheidssprong = zojuist getrapt → schokgolf + stof
    // op de grond (feller/groter bij een schot dan bij een pass).
    if (dt > 0 && speed - this.prevBallSpeed > 170 && speed > 260) {
      this.spawnKickFx(b.pos.x, b.pos.y, speed, b.vel.x, b.vel.y)
    }
    this.prevBallSpeed = speed

    // goal: particles + camera-shake + korte zoom-in
    if (state.phase === 'goal' && this.prevPhase !== 'goal') {
      this.spawnGoalBurst(b.pos.x, b.pos.y, state)
      this.shakeMag = 20
      this.zoomPunch = 0.16
      this.netRipple = { dir: b.pos.x < PITCH_LENGTH / 2 ? -1 : 1, t: 0 } // net laten trillen
    }
    this.prevPhase = state.phase
    this.updateParticles(dt)
    this.updateKickRings(dt)
    this.updateNets(dt)
    this.updateFlashes(dt)
    this.updateFireworks(dt)
    if (state.weather !== this.weather) this.setWeather(state.weather) // dynamisch weer volgen
    this.updateWeather(dt)
    this.updateAdBoards(dt)

    this.app.render()
  }

  // Bal-trail: laat bij een snelle bal een vervagend spoor achter.
  private updateTrail(dt: number, x: number, y: number, speed: number, z: number) {
    if (speed > 320 && z < 12) {
      const g = new this.PIXI.Graphics()
      g.circle(0, 0, BALL_RADIUS * 0.8).fill({ color: 0xffffff, alpha: 0.5 })
      g.position.set(x, y)
      this.fxLayer.addChild(g)
      this.trail.push({ g, vx: 0, vy: 0, life: 0, max: 0.22 })
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i]
      t.life += dt
      if (t.life >= t.max) {
        t.g.destroy()
        this.trail.splice(i, 1)
        continue
      }
      t.g.alpha = 0.5 * (1 - t.life / t.max)
    }
  }

  // Knipperende "camera-flitsen" op de tribune → levend publiek.
  private updateFlashes(dt: number) {
    if (dt > 0 && Math.random() < dt * 16 && this.flashes.length < 32) {
      const p = this.randomStandPoint()
      const g = new this.PIXI.Graphics()
      g.circle(0, 0, 2.2 + Math.random() * 1.6).fill(0xffffff)
      g.position.set(p.x, p.y)
      this.fxLayer.addChild(g)
      this.flashes.push({ g, vx: 0, vy: 0, life: 0, max: 0.1 + Math.random() * 0.18 })
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      f.life += dt
      if (f.life >= f.max) {
        f.g.destroy()
        this.flashes.splice(i, 1)
        continue
      }
      f.g.alpha = 1 - f.life / f.max
    }
  }

  // Vuurwerk vanuit het publiek: pijl stijgt op → explodeert in vonken + rook (rook drift
  // een beetje het veld op, voor de sfeer).
  private updateFireworks(dt: number) {
    // af en toe een nieuwe pijl afschieten (~ eens per 5–6s)
    if (dt > 0 && Math.random() < dt / 5.5 && this.rockets.length < 3) {
      const p = this.randomStandPoint()
      const col = FW_COLORS[(Math.random() * FW_COLORS.length) | 0]
      const g = new this.PIXI.Graphics()
      g.circle(0, 0, 3).fill(col)
      g.position.set(p.x, p.y)
      this.fxLayer.addChild(g)
      const towardMid = Math.sign(PITCH_WIDTH / 2 - p.y) // omhoog = richting veld
      this.rockets.push({ g, vx: (Math.random() - 0.5) * 40, vy: towardMid * (150 + Math.random() * 90), life: 0, max: 0.55 + Math.random() * 0.35, col })
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]
      r.life += dt
      r.vy *= 1 - 0.6 * dt // remt af (top van de baan)
      r.g.x += r.vx * dt
      r.g.y += r.vy * dt
      if (r.life >= r.max) {
        this.explode(r.g.x, r.g.y, r.col)
        r.g.destroy()
        this.rockets.splice(i, 1)
      }
    }
    // rook laten groeien, driften en vervagen
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]
      s.life += dt
      const f = s.life / s.max
      if (f >= 1) {
        s.g.destroy()
        this.smoke.splice(i, 1)
        continue
      }
      s.g.x += s.vx * dt
      s.g.y += s.vy * dt
      s.g.scale.set(0.5 + f * 2.2)
      s.g.alpha = 0.3 * (1 - f)
    }
  }

  private explode(x: number, y: number, col: number) {
    const PIXI = this.PIXI
    // vonken (gebruiken dezelfde physics als de goal-confetti)
    for (let i = 0; i < 26; i++) {
      const g = new PIXI.Graphics()
      const c = i % 5 === 0 ? 0xffffff : col
      g.circle(0, 0, 1.6 + Math.random() * 1.6).fill(c)
      g.position.set(x, y)
      const ang = Math.random() * Math.PI * 2
      const spd = 120 + Math.random() * 240
      this.fxLayer.addChild(g)
      this.particles.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, max: 0.7 + Math.random() * 0.6 })
    }
    // rookpluimen die richting het veld + omhoog driften
    const toField = Math.sign(PITCH_WIDTH / 2 - y)
    for (let i = 0; i < 4; i++) {
      const g = new PIXI.Graphics()
      g.circle(0, 0, 16).fill({ color: 0xc6ccd6, alpha: 1 })
      g.position.set(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 24)
      g.alpha = 0.28
      this.fxLayer.addChild(g)
      this.smoke.push({ g, vx: (Math.random() - 0.5) * 26, vy: toField * (18 + Math.random() * 22) - 8, life: 0, max: 2.4 + Math.random() * 1.4 })
    }
  }

  private spawnGoalBurst(x: number, y: number, state: GameState) {
    const PIXI = this.PIXI
    const scorer = state.lastGoalBy ?? 0
    const t = this.teams![scorer]
    const colors = [t.shirt, t.trim, 0xffffff, t.keeper]
    for (let i = 0; i < 60; i++) {
      const g = new PIXI.Graphics()
      const col = colors[i % colors.length]
      g.rect(-2.5, -2.5, 5, 5).fill(col)
      g.position.set(x, y)
      g.rotation = Math.random() * Math.PI
      const ang = Math.random() * Math.PI * 2
      const spd = 120 + Math.random() * 340
      this.fxLayer.addChild(g)
      this.particles.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, max: 0.9 + Math.random() * 0.6 })
    }
  }

  // Trap/pass-feedback op de grond: een schokgolf-ring + stof/vonken tegen de traprichting in.
  private spawnKickFx(x: number, y: number, speed: number, vx: number, vy: number) {
    const PIXI = this.PIXI
    const shot = speed > 470
    const col = shot ? 0xfff1c2 : 0xffffff
    const ring = new PIXI.Graphics()
    ring.position.set(x, y)
    this.fxLayer.addChild(ring)
    this.kickRings.push({ g: ring, life: 0, max: shot ? 0.34 : 0.24, col, shot })
    // stof/vonken: schieten weg tégen de traprichting in (backspray)
    const n = shot ? 10 : 5
    const bl = Math.hypot(vx, vy) || 1
    const base = Math.atan2(-vy / bl, -vx / bl)
    for (let i = 0; i < n; i++) {
      const g = new PIXI.Graphics()
      const c = shot && i % 3 === 0 ? 0xfff1c2 : 0xd9d2c5
      g.circle(0, 0, 1.2 + Math.random() * 1.6).fill(c)
      g.position.set(x, y)
      const ang = base + (Math.random() - 0.5) * 1.7
      const spd = (shot ? 120 : 70) + Math.random() * (shot ? 170 : 90)
      this.fxLayer.addChild(g)
      this.particles.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, max: 0.26 + Math.random() * 0.28 })
    }
  }

  // Grote inslag-fx bij een tackle: schokgolf-ring + flinke stofwolk + gouden sterretjes.
  private spawnTumbleDust(x: number, y: number) {
    const PIXI = this.PIXI
    const gy = y + PLAYER_RADIUS * 0.6
    // schokgolf-ring op de grond (hergebruikt het kick-ring-systeem)
    const ring = new PIXI.Graphics()
    ring.position.set(x, gy)
    this.fxLayer.addChild(ring)
    this.kickRings.push({ g: ring, life: 0, max: 0.4, col: 0xe9e2d2, shot: true })
    // stof + sterretjes
    for (let i = 0; i < 22; i++) {
      const g = new PIXI.Graphics()
      const star = i % 3 === 0
      if (star) g.star(0, 0, 5, 3, 1.4).fill(i % 6 === 0 ? 0xfff1c2 : 0xffffff)
      else g.circle(0, 0, 1.8 + Math.random() * 2.6).fill({ color: 0xd9d2c5, alpha: 0.92 })
      g.position.set(x, gy)
      const ang = Math.random() * Math.PI * 2
      const spd = 90 + Math.random() * 210
      this.fxLayer.addChild(g)
      this.particles.push({ g, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 70, life: 0, max: 0.45 + Math.random() * 0.5 })
    }
  }

  // Stof-veeg achter een glijdende tackelaar.
  private spawnSlideDust(x: number, y: number, facing: { x: number; y: number }) {
    const PIXI = this.PIXI
    for (let i = 0; i < 2; i++) {
      const g = new PIXI.Graphics()
      g.circle(0, 0, 1.6 + Math.random() * 2.4).fill({ color: 0xdad3c4, alpha: 0.55 })
      g.position.set(x - facing.x * PLAYER_RADIUS, y + PLAYER_RADIUS * 0.7)
      const spd = 30 + Math.random() * 60
      this.fxLayer.addChild(g)
      this.particles.push({ g, vx: -facing.x * spd + (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30, life: 0, max: 0.3 + Math.random() * 0.3 })
    }
  }

  private updateKickRings(dt: number) {
    for (let i = this.kickRings.length - 1; i >= 0; i--) {
      const r = this.kickRings[i]
      r.life += dt
      const f = r.life / r.max
      if (f >= 1) { r.g.destroy(); this.kickRings.splice(i, 1); continue }
      const rad = BALL_RADIUS + ((r.shot ? 48 : 32) - BALL_RADIUS) * f
      r.g.clear()
      r.g.circle(0, 0, rad).stroke({ width: r.shot ? 3 : 2, color: r.col, alpha: 0.85 * (1 - f) })
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dt
      if (p.life >= p.max) {
        p.g.destroy()
        this.particles.splice(i, 1)
        continue
      }
      p.vx *= 0.96
      p.vy = p.vy * 0.96 + 60 * dt // lichte "zwaartekracht"
      p.g.x += p.vx * dt
      p.g.y += p.vy * dt
      p.g.rotation += dt * 6
      p.g.alpha = 1 - p.life / p.max
    }
  }

  destroy() {
    this.ready = false
    for (const p of this.particles) p.g?.destroy?.()
    for (const f of this.flashes) f.g?.destroy?.()
    for (const r of this.rockets) r.g?.destroy?.()
    for (const s of this.smoke) s.g?.destroy?.()
    for (const t of this.trail) t.g?.destroy?.()
    for (const r of this.kickRings) r.g?.destroy?.()
    this.kickRings = []
    this.particles = []
    this.flashes = []
    this.rockets = []
    this.smoke = []
    this.trail = []
    if (this.app) {
      try {
        this.app.destroy(false, { children: true, texture: false })
      } catch {
        /* al opgeruimd */
      }
    }
    this.app = null
    this.world = null
    this.nodes = []
    this.legPhase = []
    this.shadows = []
  }
}

function clampCam(c: number, view: number, world: number, margin: number): number {
  const half = view / 2
  const lo = half - margin
  const hi = world - half + margin
  if (lo > hi) return world / 2
  return Math.max(lo, Math.min(hi, c))
}

// Verduister/oplicht een hex (#rrggbb of number) → number, voor de effen-kop-fallback.
function shadeHex(hex: string | number, amt: number): number {
  const n = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)))
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)))
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)))
  return (r << 16) | (g << 8) | b
}
