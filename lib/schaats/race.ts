// De Elfkoppentocht — vrij 2D-schaatsen over een kronkelende tocht langs 11 steden.
// Je stuurt de schaatser zelf met WASD (versnelt in de duwrichting, glijdt door met momentum);
// de baan slingert alle kanten op en je moet 'm op de ijsbaan houden — tegen de boarding verlies
// je snelheid. Voortgang = hoe ver je op het pad zit (projectie op de middenlijn).

export type Vec = { x: number; y: number }

export const TRACK_HALF_W = 74 // halve baanbreedte (de "buis" waarbinnen je schaatst)
export const RACER_R = 14
export const ACCEL = 900 // schaats-versnelling in de duwrichting
export const MAX_SPEED = 300
export const SPRINT_MULT = 1.34
export const DRAG = 3.0 // glij-weerstand (v *= 1 - DRAG·dt) → topsnelheid ≈ ACCEL/DRAG
export const SPRINT_DRAIN = 0.5 // stamina/s
export const STAM_REGEN = 0.22
export const WALL_DAMP = 0.5 // snelheidsbehoud bij het raken van de boarding (rest = verlies)
export const SLIP_RANGE = 120 // slipstream: zó dicht achter iemand
export const SLIP_BOOST = 1.12
export const STUMBLE_TIME = 0.9
export const STUMBLE_MULT = 0.35
export const ZOPIE_BOOST = 1.3 // warme chocomel geeft even vleugels
export const ZOPIE_TIME = 2.4
export const KLUUN_WALK = 0.4 // in een kluunzone glij je niet → veel trager tenzij je ramt
export const KLUUN_TAP_DIST = 30 // afstand per spatie-tap in een kluunzone
export const CITIES = ['Sneek', 'IJlst', 'Sloten', 'Stavoren', 'Hindeloopen', 'Workum', 'Bolsward', 'Harlingen', 'Franeker', 'Dokkum', 'Leeuwarden']

export type Track = {
  pts: Vec[]
  cum: number[]
  total: number
  gates: { s: number; name: string; x: number; y: number; tx: number; ty: number }[]
  kluun: { s0: number; s1: number }[]
  cracks: Vec[] // wereldposities (obstakel: struikelen)
  zopie: Vec[] // wereldposities (koek-en-zopie: boost)
}

export type Racer = {
  face: string
  name: string
  isHuman: boolean
  x: number // wereldpositie
  y: number
  vx: number
  vy: number
  seg: number // huidige pad-segment (voor de windowed projectie → monotone voortgang)
  s: number // afstand langs het pad (voortgang / klassement)
  speed: number // huidige snelheid (voor de animatie)
  stamina: number
  stumbleT: number
  boostT: number
  lastZopie: number // index van de laatst gepakte zopie (voorkomt dubbel)
  gates: number
  finishT: number | null
}

export type RaceEvent =
  | { type: 'city'; name: string; n: number }
  | { type: 'stumble' }
  | { type: 'zopie' }
  | { type: 'finish'; time: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ── Tocht genereren: een vrije heading-walk (alle richtingen). ────────────────
export function generateTrack(nPoints = 90): Track {
  const pts: Vec[] = [{ x: 0, y: 0 }]
  let h = Math.random() * Math.PI * 2
  for (let i = 1; i < nPoints; i++) {
    h += (Math.random() - 0.5) * 0.7 // kronkelt vrij naar links/rechts/boven/onder
    const prev = pts[i - 1]
    pts.push({ x: prev.x + Math.cos(h) * 200, y: prev.y + Math.sin(h) * 200 })
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = cum[cum.length - 1]

  const gates = CITIES.map((name, k) => {
    const s = (total * (k + 1)) / CITIES.length
    const { p, tx, ty } = sampleAt(pts, cum, s)
    return { s, name, x: p.x, y: p.y, tx, ty }
  })

  const kluun: Track['kluun'] = []
  for (const frac of [0.3 + Math.random() * 0.1, 0.63 + Math.random() * 0.1]) {
    const s0 = total * frac
    kluun.push({ s0, s1: s0 + 300 })
  }
  const cracks: Vec[] = []
  for (let i = 0; i < 14; i++) {
    const s = total * (0.08 + Math.random() * 0.86)
    if (kluun.some((z) => s > z.s0 - 130 && s < z.s1 + 130)) continue
    cracks.push(worldFrom(pts, cum, s, (Math.random() * 2 - 1) * (TRACK_HALF_W - 20)))
  }
  const zopie: Vec[] = []
  for (const frac of [0.2, 0.47, 0.75]) {
    const s = total * (frac + (Math.random() - 0.5) * 0.05)
    if (kluun.some((z) => s > z.s0 - 100 && s < z.s1 + 100)) continue
    zopie.push(worldFrom(pts, cum, s, (Math.random() < 0.5 ? -1 : 1) * (TRACK_HALF_W - 26)))
  }
  return { pts, cum, total, gates, kluun, cracks, zopie }
}

// Punt + tangent op afstand s (over de hele pts-array).
function sampleAt(pts: Vec[], cum: number[], s: number): { p: Vec; tx: number; ty: number } {
  const ss = clamp(s, 0, cum[cum.length - 1] - 0.01)
  let i = 1
  while (i < cum.length - 1 && cum[i] < ss) i++
  const a = pts[i - 1]
  const b = pts[i]
  const seg = cum[i] - cum[i - 1] || 1
  const f = (ss - cum[i - 1]) / seg
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, tx: (b.x - a.x) / L, ty: (b.y - a.y) / L }
}
function worldFrom(pts: Vec[], cum: number[], s: number, lat: number): Vec {
  const { p, tx, ty } = sampleAt(pts, cum, s)
  return { x: p.x - ty * lat, y: p.y + tx * lat }
}

export const pointAt = (t: Track, s: number) => sampleAt(t.pts, t.cum, s)
export const worldPos = (t: Track, s: number, lat: number) => worldFrom(t.pts, t.cum, s, lat)
export const inKluun = (t: Track, s: number) => t.kluun.some((z) => s >= z.s0 && s <= z.s1)

// Windowed projectie: dichtstbijzijnde punt op het pad, alleen in de buurt van het huidige
// segment (voorkomt dat de projectie naar een verre kruising springt → monotone voortgang).
export function project(t: Track, x: number, y: number, seg: number): { s: number; dist: number; cx: number; cy: number; tx: number; ty: number; seg: number } {
  let best = Infinity
  let out = { s: 0, dist: 0, cx: x, cy: y, tx: 1, ty: 0, seg }
  const lo = Math.max(0, seg - 2)
  const hi = Math.min(t.pts.length - 2, seg + 6)
  for (let i = lo; i <= hi; i++) {
    const a = t.pts[i]
    const b = t.pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const L2 = dx * dx + dy * dy || 1
    const u = clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1)
    const px = a.x + dx * u
    const py = a.y + dy * u
    const d = Math.hypot(x - px, y - py)
    if (d < best) {
      best = d
      const L = Math.sqrt(L2)
      out = { s: t.cum[i] + L * u, dist: d, cx: px, cy: py, tx: dx / L, ty: dy / L, seg: i }
    }
  }
  return out
}

// ── Eén race-tick voor één schaatser ──────────────────────────────────────────
// ax,ay = genormaliseerde duwrichting (WASD); sprint; kluunDist = afstand uit spatie-taps.
export function stepRacer(t: Track, r: Racer, all: Racer[], ax: number, ay: number, sprint: boolean, kluunDist: number, dt: number, raceT: number): RaceEvent[] {
  const events: RaceEvent[] = []
  if (r.finishT !== null) return events
  if (r.stumbleT > 0) r.stumbleT = Math.max(0, r.stumbleT - dt)

  const proj = project(t, r.x, r.y, r.seg)
  const onLand = inKluun(t, proj.s)

  if (onLand) {
    // Klúnen: geen glij; ramen (kluunDist) duwt je langs de baan-tangent vooruit.
    r.vx *= 1 - Math.min(1, 8 * dt)
    r.vy *= 1 - Math.min(1, 8 * dt)
    r.x += proj.tx * kluunDist + r.vx * dt
    r.y += proj.ty * kluunDist + r.vy * dt
    r.stamina = Math.min(1, r.stamina + STAM_REGEN * 0.5 * dt)
  } else {
    const sprinting = sprint && r.stamina > 0.05
    r.stamina = sprinting ? Math.max(0, r.stamina - SPRINT_DRAIN * dt) : Math.min(1, r.stamina + STAM_REGEN * dt)
    const il = Math.hypot(ax, ay)
    if (il > 0.05 && r.stumbleT <= 0) {
      const a = ACCEL * (sprinting ? 1.25 : 1)
      r.vx += (ax / il) * a * dt
      r.vy += (ay / il) * a * dt
    }
    // Slipstream: vlak achter een andere schaatser → minder weerstand.
    let drag = DRAG
    for (const o of all) {
      if (o === r || o.finishT !== null) continue
      if (Math.hypot(o.x - r.x, o.y - r.y) < SLIP_RANGE) {
        const dot = (o.x - r.x) * r.vx + (o.y - r.y) * r.vy
        if (dot > 0) { drag *= 1 / SLIP_BOOST; break } // hij zit vóór je in je rij-richting
      }
    }
    r.vx *= 1 - Math.min(0.9, drag * dt)
    r.vy *= 1 - Math.min(0.9, drag * dt)
    // Topsnelheid begrenzen.
    let cap = MAX_SPEED * (sprinting ? SPRINT_MULT : 1) * (r.stumbleT > 0 ? STUMBLE_MULT : 1)
    if (r.boostT > 0) { cap *= ZOPIE_BOOST; r.boostT = Math.max(0, r.boostT - dt) }
    const sp = Math.hypot(r.vx, r.vy)
    if (sp > cap) { r.vx = (r.vx / sp) * cap; r.vy = (r.vy / sp) * cap }
    r.x += r.vx * dt
    r.y += r.vy * dt
  }

  // Boarding: te ver van de middenlijn → terug de baan op + snelheidsverlies.
  const p2 = project(t, r.x, r.y, proj.seg)
  r.seg = p2.seg
  r.s = p2.s
  if (p2.dist > TRACK_HALF_W - RACER_R) {
    const nx = (r.x - p2.cx) / (p2.dist || 1)
    const ny = (r.y - p2.cy) / (p2.dist || 1)
    r.x = p2.cx + nx * (TRACK_HALF_W - RACER_R)
    r.y = p2.cy + ny * (TRACK_HALF_W - RACER_R)
    // Snelheid loodrecht op de boarding wegnemen + alles dempen (je verliest vaart tegen de rand).
    const vn = r.vx * nx + r.vy * ny
    r.vx = (r.vx - nx * vn) * WALL_DAMP
    r.vy = (r.vy - ny * vn) * WALL_DAMP
  }
  r.speed = Math.hypot(r.vx, r.vy)

  // Scheuren: raken = struikelen.
  if (r.stumbleT <= 0) {
    for (const c of t.cracks) {
      if (Math.hypot(r.x - c.x, r.y - c.y) < RACER_R + 12) { r.stumbleT = STUMBLE_TIME; events.push({ type: 'stumble' }); break }
    }
  }
  // Koek-en-zopie: erdoorheen → boost.
  for (let i = 0; i < t.zopie.length; i++) {
    if (r.lastZopie === i) continue
    if (Math.hypot(r.x - t.zopie[i].x, r.y - t.zopie[i].y) < RACER_R + 20) {
      r.boostT = ZOPIE_TIME
      r.stamina = Math.min(1, r.stamina + 0.35)
      r.lastZopie = i
      events.push({ type: 'zopie' })
      break
    }
  }

  // Steden-poorten (op voortgang s).
  while (r.gates < t.gates.length && r.s >= t.gates[r.gates].s) {
    r.gates += 1
    if (r.gates === t.gates.length) { r.finishT = raceT; events.push({ type: 'finish', time: raceT }) }
    else events.push({ type: 'city', name: t.gates[r.gates - 1].name, n: r.gates })
  }
  return events
}

// ── Computer-schaatser: mik naar een punt verderop op het pad, ontwijk scheuren. ──
export function aiSteer(t: Track, r: Racer, all: Racer[], diff: number): { ax: number; ay: number; sprint: boolean; kluunDist: number } {
  const look = project(t, r.x, r.y, r.seg)
  // Doelpunt ~120 verderop op de baan (met wat ruis per moeilijkheid).
  const aheadS = look.s + 120
  const tgt = worldPos(t, aheadS, (Math.random() - 0.5) * TRACK_HALF_W * (1 - diff) * 0.8)
  let ax = tgt.x - r.x
  let ay = tgt.y - r.y
  // Scheuren vlak vooruit → opzij mikken.
  for (const c of t.cracks) {
    const dx = c.x - r.x
    const dy = c.y - r.y
    if (Math.hypot(dx, dy) < 90 && dx * r.vx + dy * r.vy > 0) { ax += -look.ty * 90; ay += look.tx * 90; break }
  }
  const endgame = r.s > t.total * 0.85
  const sprint = r.stamina > (endgame ? 0.08 : 0.5) && Math.random() < 0.5 + diff * 0.4
  const kluunDist = (3 + diff * 3 + Math.random()) * KLUUN_TAP_DIST / 120
  return { ax, ay, sprint, kluunDist }
}
