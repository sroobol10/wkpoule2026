// Putjesscheppers — balfysica + random hole-generator. De baan is een unie van
// rechthoekige kamers (L- en Z-gangen), de muren kaatsen, zand remt, water straft,
// de molenwiek maait en de collega-bumpers stuiteren je alle kanten op.

import type { GolfBall, GolfTheme, Hole, Rect, StepEvent, Vec } from './types'

// ── Tuning ───────────────────────────────────────────────────────────────────
export const WORLD_W = 1000
export const WORLD_H = 560
export const BALL_R = 8
export const CUP_R = 15
export const CUP_MAX_SPEED = 340 // sneller dan dit over de cup → lip-out (rolt door)
export const CUP_MAGNET = 30 // binnen deze straal trekt de cup de bal er langzaam in (lip-magneet)
export const SINK_TIME = 0.45 // duur van het "in de cup vallen"-animatietje
export const FRICTION = 150 // remming (units/s²) op de green
export const SAND_MULT = 3.4 // zand remt zóveel harder
export const WALL_BOUNCE = 0.72
export const BUMPER_BOUNCE = 0.88
export const CURVE_ACCEL = 190 // zijwaartse versnelling van de curve-bal (dooft uit met de snelheid)
export const BOOST_KICK = 360 // snelheid die een pijl-tegel toevoegt
export const POWER_MIN = 120
export const POWER_MAX = 760
export const CHARGE_TIME = 1.15 // seconden vasthouden voor de volle klap
export const MAX_STROKES = 8 // daarna: oppakken, score 8 (de collega's willen ook nog)
export const MILL_R = 10 // dikte van de molenwiek (botsstraal)

// Baan-thema's — per hole een andere sfeer (niet altijd groen).
export const GOLF_THEMES: GolfTheme[] = [
  { name: 'Gras', fairway: '#2c8a45', fairway2: '#31984d', wall: '#5b4630', ink: '#0e3a1e' },
  { name: 'Woestijn', fairway: '#c9a24b', fairway2: '#d3ae5a', wall: '#7a5a2a', ink: '#5a3d12' },
  { name: 'Nachtclub', fairway: '#3a2d6b', fairway2: '#463680', wall: '#1c1533', ink: '#c9b8ff' },
  { name: 'Winter', fairway: '#cfe3f0', fairway2: '#dcecf6', wall: '#7c93a8', ink: '#2a4a66' },
  { name: 'Strand', fairway: '#3aa5b0', fairway2: '#43b3bd', wall: '#c2a068', ink: '#0d4a52' },
  { name: 'Lava', fairway: '#4a2622', fairway2: '#5a2e28', wall: '#2a1310', ink: '#ff8a4a' },
  { name: 'Neon', fairway: '#14313a', fairway2: '#1a3d47', wall: '#0a1c22', ink: '#3fe0c8' },
  { name: 'Herfst', fairway: '#8a5a2a', fairway2: '#976433', wall: '#4a2f16', ink: '#ffd98a' },
  { name: 'Klei', fairway: '#b0563f', fairway2: '#bd6049', wall: '#6a2f20', ink: '#ffe0d0' },
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const insideRect = (r: Rect, x: number, y: number, m: number) =>
  x >= r.x + m && x <= r.x + r.w - m && y >= r.y + m && y <= r.y + r.h - m

// Positie van de rollende reuzenkop op tijdstip t (ping-pong tussen a en b).
export function boulderPos(bd: NonNullable<Hole['boulder']>, t: number): { x: number; y: number } {
  const tri = Math.abs(((t * bd.speed) % 2) - 1) // 0→1→0
  return { x: bd.ax + (bd.bx - bd.ax) * tri, y: bd.ay + (bd.by - bd.ay) * tri }
}

export const insideHole = (h: Hole, x: number, y: number, m = BALL_R) =>
  h.rects.some((r) => insideRect(r, x, y, m))

// ── Random hole-generator ────────────────────────────────────────────────────
// Kamers marcheren van links naar rechts met willekeurige y-sprongen; elke sprong wordt
// een L-gang (horizontaal + verticaal stuk). Obstakels komen in de kamers, nooit te
// dicht bij tee of cup. Par groeit met het aantal bochten en de rommel onderweg.
export function generateHole(holeIndex: number, faces: string[]): Hole {
  const rects: Rect[] = []
  const anchors: Vec[] = []
  const bends = 1 + Math.floor(Math.random() * 3) // 1-3 bochten

  let x = 90
  let y = 120 + Math.random() * (WORLD_H - 260)
  anchors.push({ x, y })
  for (let i = 0; i < bends; i++) {
    // Elk segment een eigen breedte: van krappe gangetjes tot ruime kamers → meer variatie.
    const corridor = Math.random() < 0.28 ? 190 + Math.random() * 70 : 96 + Math.random() * 66
    const stepX = 180 + Math.random() * (620 / bends - 120)
    const nx = Math.min(WORLD_W - 110, x + stepX)
    // horizontaal stuk
    rects.push({ x: x - corridor / 2, y: y - corridor / 2, w: nx - x + corridor, h: corridor })
    // verticale sprong (behalve soms bij de laatste bocht)
    let ny = y
    if (i < bends - 1 || Math.random() < 0.7) {
      const jump = (70 + Math.random() * 190) * (Math.random() < 0.5 ? -1 : 1)
      ny = clamp(y + jump, 110, WORLD_H - 110)
      const vw = 96 + Math.random() * 60
      rects.push({ x: nx - vw / 2, y: Math.min(y, ny) - corridor / 2, w: vw, h: Math.abs(ny - y) + corridor })
    }
    x = nx
    y = ny
    anchors.push({ x, y })
  }
  const tee = { ...anchors[0] }
  const cup = { ...anchors[anchors.length - 1] }

  // Obstakels strooien (niet bij tee/cup). Meer rommel op latere holes.
  const chaos = Math.min(1, 0.35 + holeIndex * 0.09)
  const clearOf = (px: number, py: number) => Math.hypot(px - tee.x, py - tee.y) > 110 && Math.hypot(px - cup.x, py - cup.y) > 96
  const spotIn = (shrink: number): Vec | null => {
    for (let tries = 0; tries < 24; tries++) {
      const r = rects[Math.floor(Math.random() * rects.length)]
      const px = r.x + shrink + Math.random() * Math.max(1, r.w - shrink * 2)
      const py = r.y + shrink + Math.random() * Math.max(1, r.h - shrink * 2)
      if (clearOf(px, py) && insideHole({ rects } as Hole, px, py, shrink)) return { x: px, y: py }
    }
    return null
  }

  const bumpers: Hole['bumpers'] = []
  const nBump = 1 + Math.floor(Math.random() * (chaos > 0.5 ? 3 : 2)) // altijd minstens één kop → altijd wat te ketsen
  for (let i = 0; i < nBump; i++) {
    const s = spotIn(40)
    if (s) bumpers.push({ ...s, r: 17 + Math.random() * 7, face: faces[Math.floor(Math.random() * faces.length)] })
  }
  const sand: Hole['sand'] = []
  const nSand = Math.random() < 0.7 ? (Math.random() < 0.35 ? 2 : 1) : 0
  for (let i = 0; i < nSand; i++) {
    const s = spotIn(46)
    if (s) sand.push({ ...s, r: 32 + Math.random() * 16 })
  }
  const water: Hole['water'] = []
  if (holeIndex >= 2 && Math.random() < chaos * 0.8) {
    const s = spotIn(44)
    if (s) water.push({ ...s, r: 28 + Math.random() * 12 })
  }
  let mill: Hole['mill'] = null
  if (holeIndex >= 1 && Math.random() < 0.52) {
    const s = spotIn(70)
    if (s) mill = { x: s.x, y: s.y, len: 52 + Math.random() * 18, speed: (0.9 + Math.random() * 0.9) * (Math.random() < 0.5 ? -1 : 1) }
  }
  // Boost-tegels: pijl-vloertjes die de bal een zetje geven (fun + shortcuts).
  const boost: Hole['boost'] = []
  if (Math.random() < 0.62) {
    const s = spotIn(40)
    if (s) boost.push({ ...s, r: 24, ang: Math.atan2(cup.y - s.y, cup.x - s.x) + (Math.random() - 0.5) * 0.7 })
  }
  // Wormgaten (paar): erin op de ene plek → eruit op de andere. Alleen als ze ver genoeg uit elkaar liggen.
  const portals: Hole['portals'] = []
  if (holeIndex >= 2 && Math.random() < 0.5) {
    const a = spotIn(46)
    const b2 = spotIn(46)
    if (a && b2 && Math.hypot(a.x - b2.x, a.y - b2.y) > 200) portals.push({ ...a, r: 21 }, { ...b2, r: 21 })
  }
  // Trampolines: katapulteren de bal keihard door in z'n rolrichting.
  const tramps: Hole['tramps'] = []
  const nTramp = Math.random() < 0.55 ? (Math.random() < 0.3 ? 2 : 1) : 0
  for (let i = 0; i < nTramp; i++) { const s = spotIn(40); if (s) tramps.push({ ...s, r: 22 }) }
  // Rollende reuzenkop (Indiana Jones): dendert heen en weer over een lijn, beukt de bal weg.
  let boulder: Hole['boulder'] = null
  if (holeIndex >= 2 && Math.random() < 0.4) {
    const a = spotIn(60)
    const b2 = spotIn(60)
    if (a && b2 && Math.hypot(a.x - b2.x, a.y - b2.y) > 150) boulder = { ax: a.x, ay: a.y, bx: b2.x, by: b2.y, r: 26, speed: 0.28 + Math.random() * 0.22, face: faces[Math.floor(Math.random() * faces.length)] }
  }
  // Zwart gat: zuigt de bal aan binnen z'n straal; in de kern → gespuugd op een willekeurige plek.
  let blackhole: Hole['blackhole'] = null
  if (holeIndex >= 3 && Math.random() < 0.32) {
    const s = spotIn(70)
    if (s && Math.hypot(s.x - cup.x, s.y - cup.y) > 110) blackhole = { ...s, r: 88 }
  }

  const theme = GOLF_THEMES[holeIndex % GOLF_THEMES.length]
  const par = clamp(2 + bends + (bumpers.length + water.length + (mill ? 1 : 0) > 1 ? 1 : 0), 2, 5)
  return { rects, tee, cup, par, theme, bumpers, sand, water, mill, boost, portals, tramps, boulder, blackhole }
}

// ── Fysica-tick ──────────────────────────────────────────────────────────────
// Retourneert 'cup' (hij zit erin!), 'water' (plons → strafslag), 'rest' (uitgerold) of null.
export function stepBall(h: Hole, b: GolfBall, t: number, dt: number): StepEvent {
  // In de cup aan het vallen: glijdt naar het hart en krimpt (client), dán pas 'cup'.
  if (b.sinking > 0) {
    b.sinking = Math.max(0, b.sinking - dt)
    b.x += (h.cup.x - b.x) * Math.min(1, 12 * dt)
    b.y += (h.cup.y - b.y) * Math.min(1, 12 * dt)
    b.vx = 0
    b.vy = 0
    return b.sinking <= 0 ? 'cup' : null
  }

  if (b.portalCd && b.portalCd > 0) b.portalCd = Math.max(0, b.portalCd - dt)
  if (b.trampCd && b.trampCd > 0) b.trampCd = Math.max(0, b.trampCd - dt)
  if (b.bhCd && b.bhCd > 0) b.bhCd = Math.max(0, b.bhCd - dt)

  // Zwart gat: trekt de bal continu naar de kern; in de kern → keihard willekeurig uitgespuugd.
  if (h.blackhole && !b.bhCd) {
    const bh = h.blackhole
    const dx = bh.x - b.x, dy = bh.y - b.y
    const d = Math.hypot(dx, dy)
    if (d < 15) {
      const a = Math.random() * Math.PI * 2
      b.vx = Math.cos(a) * 480; b.vy = Math.sin(a) * 480
      b.x = bh.x + Math.cos(a) * 22; b.y = bh.y + Math.sin(a) * 22
      b.bhCd = 0.6
    } else if (d < bh.r) {
      const pull = (1 - d / bh.r) * 1050
      b.vx += (dx / d) * pull * dt
      b.vy += (dy / d) * pull * dt
    }
  }

  const speed = Math.hypot(b.vx, b.vy)
  if (speed < 4) {
    b.vx = 0
    b.vy = 0
    b.spin = 0
    return null
  }
  // Zand remt extra.
  const inSand = h.sand.some((s) => Math.hypot(b.x - s.x, b.y - s.y) < s.r)
  const decel = FRICTION * (inSand ? SAND_MULT : 1)
  const ns = Math.max(0, speed - decel * dt)
  const k = ns / speed
  b.vx *= k
  b.vy *= k

  // Curve-bal: zijwaartse versnelling loodrecht op de rolrichting; dooft geleidelijk uit.
  if (Math.abs(b.spin) > 0.02 && ns > 20) {
    const px = -b.vy / ns
    const py = b.vx / ns
    b.vx += px * b.spin * CURVE_ACCEL * dt
    b.vy += py * b.spin * CURVE_ACCEL * dt
    b.spin *= Math.max(0, 1 - 1.1 * dt)
  }

  // Boost-tegels: buigen de balbaan naar de pijlrichting én versnellen 'm.
  for (const bo of h.boost) {
    if (Math.hypot(b.x - bo.x, b.y - bo.y) < bo.r) {
      const tvx = Math.cos(bo.ang) * BOOST_KICK
      const tvy = Math.sin(bo.ang) * BOOST_KICK
      b.vx += (tvx - b.vx) * Math.min(1, 6 * dt)
      b.vy += (tvy - b.vy) * Math.min(1, 6 * dt)
    }
  }

  // Bewegen met muur-kaatsen (x en y apart → nette reflecties in de rechthoek-unie).
  const nx = b.x + b.vx * dt
  if (insideHole(h, nx, b.y)) b.x = nx
  else b.vx = -b.vx * WALL_BOUNCE
  const ny = b.y + b.vy * dt
  if (insideHole(h, b.x, ny)) b.y = ny
  else b.vy = -b.vy * WALL_BOUNCE

  // Bumpers (koppen): cirkel-reflectie.
  for (const bp of h.bumpers) {
    const dx = b.x - bp.x
    const dy = b.y - bp.y
    const d = Math.hypot(dx, dy)
    if (d < bp.r + BALL_R && d > 1e-4) {
      const nxx = dx / d
      const nyy = dy / d
      const dot = b.vx * nxx + b.vy * nyy
      if (dot < 0) {
        b.vx -= 2 * dot * nxx * BUMPER_BOUNCE
        b.vy -= 2 * dot * nyy * BUMPER_BOUNCE
      }
      b.x = bp.x + nxx * (bp.r + BALL_R)
      b.y = bp.y + nyy * (bp.r + BALL_R)
    }
  }

  // Molenwiek: draaiend segment door het middelpunt; raak = weggeslagen.
  if (h.mill) {
    const a = t * h.mill.speed
    const ex = Math.cos(a) * h.mill.len
    const ey = Math.sin(a) * h.mill.len
    // afstand bal tot segment (-e..+e)
    const px = b.x - h.mill.x
    const py = b.y - h.mill.y
    const tt = clamp((px * ex + py * ey) / (h.mill.len * h.mill.len), -1, 1)
    const qx = ex * tt
    const qy = ey * tt
    const d = Math.hypot(px - qx, py - qy)
    if (d < MILL_R + BALL_R) {
      // normaal van de wiek af + een tik in de draairichting
      const nl = Math.hypot(px - qx, py - qy) || 1
      const nxx = (px - qx) / nl
      const nyy = (py - qy) / nl
      const dot = b.vx * nxx + b.vy * nyy
      if (dot < 0) {
        b.vx -= 2 * dot * nxx
        b.vy -= 2 * dot * nyy
      }
      const tangential = h.mill.speed * h.mill.len * 0.9
      b.vx += -Math.sin(a) * tangential * 0.4
      b.vy += Math.cos(a) * tangential * 0.4
      b.x = h.mill.x + qx + nxx * (MILL_R + BALL_R + 1)
      b.y = h.mill.y + qy + nyy * (MILL_R + BALL_R + 1)
    }
  }

  // Wormgaten: het ene gat in → uit het andere gat, met behoud van (iets gedempte) snelheid.
  if (!b.portalCd) {
    for (let i = 0; i + 1 < h.portals.length; i += 2) {
      const pa = h.portals[i], pb = h.portals[i + 1]
      const inA = Math.hypot(b.x - pa.x, b.y - pa.y) < pa.r
      const inB = Math.hypot(b.x - pb.x, b.y - pb.y) < pb.r
      if (inA || inB) {
        const to = inA ? pb : pa
        b.x = to.x
        b.y = to.y
        b.vx *= 0.92
        b.vy *= 0.92
        b.portalCd = 0.35
        break
      }
    }
  }

  // Trampolines: rol je eroverheen met vaart, dan word je keihard doorgekatapulteerd (met cap).
  if (!b.trampCd) {
    for (const tr of h.tramps) {
      if (Math.hypot(b.x - tr.x, b.y - tr.y) < tr.r) {
        const cur = Math.hypot(b.vx, b.vy)
        if (cur > 30) {
          const boosted = Math.min(POWER_MAX, cur * 1.95 + 120)
          b.vx = (b.vx / cur) * boosted
          b.vy = (b.vy / cur) * boosted
        }
        b.trampCd = 0.4
        break
      }
    }
  }

  // Rollende reuzenkop: beukt de bal weg als-ie erin loopt (impuls, geen harde teleport → veilig).
  if (h.boulder) {
    const bp = boulderPos(h.boulder, t)
    const dx = b.x - bp.x, dy = b.y - bp.y
    const d = Math.hypot(dx, dy)
    const minD = h.boulder.r + BALL_R
    if (d < minD && d > 1e-4) {
      const nxx = dx / d, nyy = dy / d
      const kick = 520
      b.vx = nxx * kick
      b.vy = nyy * kick
      b.x = bp.x + nxx * (minD + 1)
      b.y = bp.y + nyy * (minD + 1)
    }
  }

  // Water: plons.
  for (const w of h.water) {
    if (Math.hypot(b.x - w.x, b.y - w.y) < w.r - 2) return 'water'
  }

  // De cup: binnen de rand + rustig genoeg → hij zakt erin (sink-animatie). Vlak erlangs en
  // traag → lip-magneet trekt 'm alsnog naar binnen. Te hard eroverheen → lip-out.
  const dc = Math.hypot(b.x - h.cup.x, b.y - h.cup.y)
  const sp = Math.hypot(b.vx, b.vy)
  if (dc < CUP_R && sp < CUP_MAX_SPEED) {
    b.sinking = SINK_TIME
    b.vx = 0
    b.vy = 0
    b.spin = 0
    return null // begint te zinken; 'cup' volgt als de animatie klaar is
  }
  if (dc < CUP_MAGNET && sp < CUP_MAX_SPEED * 0.7) {
    b.vx += (h.cup.x - b.x) * 7 * dt // lip-magneet
    b.vy += (h.cup.y - b.y) * 7 * dt
  } else if (dc < CUP_R + 4 && sp >= CUP_MAX_SPEED) {
    b.vx += (b.y - h.cup.y) * 3 // te hard → lip-out
    b.vy += (h.cup.x - b.x) * 3
  }

  return Math.hypot(b.vx, b.vy) < 4 ? 'rest' : null
}
