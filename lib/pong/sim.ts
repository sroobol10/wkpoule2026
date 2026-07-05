// Tafelkoppen — 3D tafeltennis-sim (geprojecteerd door de client). Wereld-assen:
//   x = breedte (links − / rechts +), y = hoogte boven de tafel, z = diepte (0 = speler-kant,
//   L = tegenstander-kant). De bal is een echt 3D-projectiel; slagen worden BALLISTISCH op een
//   landingspunt op de overkant gemikt (net-clearance) zodat rally's er 3D uitzien.
//
//   Je KAATST niet automatisch: je moet écht slaan. Op het juiste moment een slag inzetten
//   (tik = zacht/veilig, smash = hard/risico). Te vroeg/laat of niet slaan = je mist → punt tegen.
//   Forehand of backhand volgt uit de balzijde t.o.v. je bat (rechts = forehand, links = backhand).

export type Side = 0 | 1 // 0 = speler (dichtbij, z klein) · 1 = tegenstander (ver, z groot)

export const HW = 92 // halve tafelbreedte (x)
export const L = 300 // tafellengte (z)
export const NET_Z = L / 2
export const NET_H = 16
export const GRAV = 900
export const BOUNCE = 0.72
export const BALL_R = 5
export const PADDLE_REACH = 46 // hoe ver in x je bat de bal nog raakt
export const REACH_Z = 48 // hoe ver in z (diepte) je bat de bal nog raakt — je moet er dus bij staan
export const PLAYER_Z = 8 // z-vlak van het speler-bat (net vóór de tafelrand)
export const OPP_Z = L - 8
export const PZ_MIN = -8 // speler mag iets achter de baseline...
export const PZ_MAX = NET_Z - 30 // ...en naar voren tot vlak bij het net (korte ballen halen)
export const HITZONE = 78 // (tegenstander) bal binnen deze z van z'n rand → slagbaar
export const MISS_Z = 34 // bal zó ver voorbij je bat-vlak → gemist → punt tegen

// ── Slag (batje) ───────────────────────────────────────────────────────────────
// Kracht laad je met de spatie: hoe langer ingedrukt, hoe harder. Loslaten = slaan.
// Heel kort (bijna geen lading) = een zacht boogballetje; vol geladen = een vlakke smash.
export const SWING_DUR = 0.34 // duur van de slag-animatie ná het loslaten
export const SWING_HIT_MIN = 0.02 // contactvenster: vanaf hier raakt het bat
export const SWING_HIT_MAX = 0.2 // tot hier — daarna te laat (mis)
export const SWING_SWEET = 0.1 // de sweet spot (beste controle)
export const CHARGE_MAX = 0.62 // spatie zó lang vasthouden = volle kracht
export const POWER_MIN = 0.14 // een tik zonder laden → licht boogballetje
export const PACE_MIN = 235 // balsnelheid bij minimale kracht (nog steeds strak, geen loze boog)
export const PACE_MAX = 435 // balsnelheid bij volle kracht (vlakke smash)

// Slagsoort: normaal (kracht via de spatie), of een speciale (Q/E/R) met een vaste vorm.
export type SwingKind = 'normal' | 'dink' | 'lob' | 'smash'

export type Swing = {
  t: number // tijd sinds het loslaten / de inzet
  power: number // 0..1 uit de laadtijd (bepaalt snelheid + boog bij 'normal')
  face: 'fore' | 'back' // forehand (bal rechts) of backhand (bal links) — bepaald bij contact
  kind: SwingKind
  hit: boolean // deze slag heeft de bal al geraakt (max één keer)
}

export type PongBall = {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  owner: Side | -1 // wie 'm het laatst sloeg (mag niet twee keer achter elkaar)
  live: boolean
  bounces: number // stuiten sinds de laatste slag
  lastBounceSide: Side | -1 // op welke helft de laatste stuit was — twee keer dezelfde = fout
}

export type PongPlayer = { side: Side; face: string; name: string; x: number; z: number; vx: number; charging: boolean; chargeT: number; swing: Swing | null }

export type PongEvent =
  | { type: 'hit'; by: Side; power: number; face: 'fore' | 'back'; sweet: boolean }
  | { type: 'whiff'; by: Side } // in de lucht geslagen (misser)
  | { type: 'point'; to: Side; reason: string }
  | { type: 'serve'; by: Side }
  | { type: 'over'; winner: Side }

export type PongMatch = {
  players: [PongPlayer, PongPlayer]
  ball: PongBall
  score: [number, number]
  server: Side
  target: number // punten om te winnen (win-by-2)
  phase: 'serve' | 'rally' | 'point' | 'over'
  serveT: number // aftel-timer vóór de serve
  pointT: number // pauze na een punt
  winner: Side | -1
  prevDink: boolean // edge-detectie voor de speciale slagen (Q/E/R)
  prevLob: boolean
  prevSmash: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function makeMatch(faces: [{ face: string; name: string }, { face: string; name: string }], target: number): PongMatch {
  return {
    players: [
      { side: 0, face: faces[0].face, name: faces[0].name, x: 0, z: PLAYER_Z, vx: 0, charging: false, chargeT: 0, swing: null },
      { side: 1, face: faces[1].face, name: faces[1].name, x: 0, z: OPP_Z, vx: 0, charging: false, chargeT: 0, swing: null },
    ],
    ball: { x: 0, y: 40, z: PLAYER_Z, vx: 0, vy: 0, vz: 0, owner: -1, live: false, bounces: 0, lastBounceSide: -1 },
    score: [0, 0],
    server: Math.random() < 0.5 ? 0 : 1,
    target,
    phase: 'serve',
    serveT: 1.1,
    pointT: 0,
    winner: -1,
    prevDink: false,
    prevLob: false,
    prevSmash: false,
  }
}

// Ballistische slag van de bal naar landingspunt (tx, tz) op tafelhoogte, met een boog die
// over het net komt. Kiest de vluchttijd op basis van `pace` en hoogt de boog op indien nodig.
function aimShot(b: PongBall, tx: number, tz: number, pace: number, maxT = 0.88): void {
  const dist = Math.hypot(tx - b.x, tz - b.z)
  // Start zo strak mogelijk; de net-clearance-loop hieronder loft alleen op als het écht moet.
  let T = clamp(dist / pace, 0.26, maxT)
  for (let i = 0; i < 8; i++) {
    const vz = (tz - b.z) / T
    const vy = (0.5 * GRAV * T * T - b.y) / T // land op y=0 na T
    const crosses = (b.z - NET_Z) * (tz - NET_Z) < 0
    if (crosses && Math.abs(vz) > 1) {
      const tNet = (NET_Z - b.z) / vz
      const yNet = b.y + vy * tNet - 0.5 * GRAV * tNet * tNet
      if (yNet < NET_H + 10) { T += 0.1; continue } // boog te laag → hoger mikken
    }
    b.vx = (tx - b.x) / T
    b.vy = vy
    b.vz = vz
    return
  }
  b.vx = (tx - b.x) / T
  b.vy = (0.5 * GRAV * T * T - b.y) / T
  b.vz = (tz - b.z) / T
}

// Een echte slag: `power` (0..1, uit de laadtijd) bepaalt snelheid + diepte, `quality` (0..1) =
// hoe dicht bij de sweet spot getimed, `paddleVx` = zijwaartse batsnelheid → daarmee mik je naar
// de zijkanten. Weinig kracht = een hoog, traag boogballetje; volle kracht = een vlakke smash die
// bij slechte timing riskant lang/in-het-net gaat.
function hitBall(m: PongMatch, side: Side, power: number, quality: number, paddleVx: number, kind: SwingKind = 'normal'): void {
  const b = m.ball
  let pace = (PACE_MIN + (PACE_MAX - PACE_MIN) * power) * (0.78 + 0.22 * quality)
  // Diepte op de overkant: veel kracht = dieper, weinig kracht = korter. Iets ondieper dan het
  // tafeleinde zodat een nette slag niet vanzelf uit vliegt.
  let depth = (0.30 + 0.40 * power) * (L / 2 - 30) + 20
  let maxT = 0.88 // boog-plafond; laag = strak
  // Speciale slagen (Q/E/R) overschrijven de vorm.
  if (kind === 'dink') { pace = 150; depth = 22; maxT = 1.15 } // net over het net plukken (drop shot)
  else if (kind === 'lob') { pace = 150; depth = L / 2 - 26; maxT = 1.6 } // trage, hoge boog diep achterin
  else if (kind === 'smash') { pace = PACE_MAX * 1.12; depth = L / 2 - 24; maxT = 0.7 } // vlakke knal diep
  // Plaatsing: vooral wáár je de bal op je bat raakt (bal links/rechts van je bat → daarheen),
  // met een klein beetje bijsturing door je batbeweging. Zo plaats je 'm bewust i.p.v. dat-ie
  // wegschiet zodra je beweegt.
  const offset = (b.x - m.players[side].x) / (PADDLE_REACH * 1.25) // -1..1, contactpunt op je bat
  const aimX = clamp(offset + paddleVx / 720, -1, 1)
  const tx = clamp(aimX * (HW - 10), -HW + 6, HW - 6)
  aimShot(b, tx, side === 0 ? NET_Z + depth : NET_Z - depth, pace, maxT)
  // Alleen een écht slecht getimede knal is riskant (uit of in het net) — milder dan voorheen.
  if ((power > 0.72 || kind === 'smash') && quality < 0.38) {
    if (Math.random() < 0.5) b.vz *= 1.16
    else b.vy *= 0.86
  }
  // Een smash vanaf een lage bal zakt makkelijk in het net (je kunt er niet overheen knallen).
  if (kind === 'smash' && b.y < 26) b.vy -= 70
  b.owner = side
  b.bounces = 0
  b.lastBounceSide = -1
}

// Serve: échte opslag — de bal stuit eerst op je EIGEN tafelhelft en pas daarna, over het net,
// op de overkant (net als in het echt). Daarom geen aimShot-op-landingspunt maar een lage boog
// vooruit: eerste stuit dichtbij op eigen helft, daarna klaart-ie het net en landt op de overkant.
// Blijft automatisch; de ontvanger moet zelf slaan om terug te spelen.
function doServe(m: PongMatch): void {
  const s = m.server
  const b = m.ball
  const dir = s === 0 ? 1 : -1
  b.x = (Math.random() * 2 - 1) * (HW - 34)
  b.y = 44
  b.z = s === 0 ? PLAYER_Z + 6 : OPP_Z - 6
  b.owner = s
  b.live = true
  b.bounces = 0
  b.lastBounceSide = -1
  b.vz = dir * (188 + Math.random() * 22) // flink vooruit → draagt door tot diep in de ontvangkant (bereikbaar)
  b.vy = 108 + Math.random() * 16 // vlakke toss → boog over het net na de eerste stuit
  b.vx = (Math.random() * 2 - 1) * 30 // beetje richting
  m.phase = 'rally'
}

export const AI_MAX_SPEED = 300 // hoe snel het CPU-bat maximaal opzij schuift (× difficulty)

// Computer-bat DOEL-x (vloeiend, géén per-frame ruis → geen getril): voorspel waar de bal
// de bat-lijn kruist als-ie naar de CPU toe komt, anders terug naar het midden.
export function aiPaddleX(m: PongMatch): number {
  const b = m.ball
  if (m.phase !== 'rally' || b.vz <= 0) return 0 // bal gaat weg of geen rally → naar het midden
  const t = (OPP_Z - b.z) / b.vz
  if (t <= 0 || t > 2.5) return b.x
  return clamp(b.x + b.vx * t, -HW, HW)
}

// Kwaliteit van de slag op basis van de timing binnen het contactvenster (1 op de sweet spot).
function swingQuality(t: number): number {
  const half = Math.max(SWING_SWEET - SWING_HIT_MIN, SWING_HIT_MAX - SWING_SWEET)
  return clamp(1 - Math.abs(t - SWING_SWEET) / half, 0, 1)
}

export function step(m: PongMatch, playerX: number, playerZ: number, playerCharge: boolean, dink: boolean, lob: boolean, smash: boolean, aiX: number, difficulty: number, dt: number): PongEvent[] {
  const events: PongEvent[] = []
  if (m.phase === 'over') return events

  // Speler-bat: positie (x + diepte z) + zijwaartse snelheid (voor de plaatsing van je slag).
  const px = clamp(playerX, -HW, HW)
  m.players[0].vx = dt > 0 ? (px - m.players[0].x) / dt : 0
  m.players[0].x = px
  m.players[0].z = clamp(playerZ, PZ_MIN, PZ_MAX)
  // CPU-bat schuift met een snelheidslimiet naar z'n doel (aiX) → vloeiend, geen getril.
  const cap = AI_MAX_SPEED * (0.5 + 0.5 * clamp(difficulty, 0, 1)) * dt
  const ox = clamp(m.players[1].x + clamp(aiX - m.players[1].x, -cap, cap), -HW, HW)
  m.players[1].vx = dt > 0 ? (ox - m.players[1].x) / dt : 0
  m.players[1].x = ox

  // Speciale slagen (Q/E/R): directe swing met een vaste vorm (edge-getriggerd). Overrulet het laden.
  const p0 = m.players[0]
  const special = (held: boolean, prev: boolean, kind: SwingKind, power: number) => {
    if (held && !prev && !p0.swing && m.phase === 'rally') {
      p0.swing = { t: 0, power, face: 'fore', kind, hit: false }
      p0.charging = false
    }
  }
  special(dink, m.prevDink, 'dink', 0.14)
  special(lob, m.prevLob, 'lob', 0.42)
  special(smash, m.prevSmash, 'smash', 0.95)
  m.prevDink = dink
  m.prevLob = lob
  m.prevSmash = smash

  // Kracht laden met de spatie: vasthouden = opladen (bat gaat naar achteren), loslaten = slaan.
  if (playerCharge && !p0.charging && !p0.swing && m.phase === 'rally') {
    p0.charging = true
    p0.chargeT = 0
  }
  if (p0.charging) {
    if (playerCharge) {
      p0.chargeT = Math.min(CHARGE_MAX, p0.chargeT + dt)
    } else {
      // losgelaten → slag met de opgebouwde kracht (een tik = lichte boogbal)
      const power = clamp(POWER_MIN + (p0.chargeT / CHARGE_MAX) * (1 - POWER_MIN), POWER_MIN, 1)
      p0.swing = { t: 0, power, face: 'fore', kind: 'normal', hit: false }
      p0.charging = false
    }
  }
  // Slag-timers laten lopen; whiff als een slag afloopt zonder de bal te raken.
  for (const p of m.players) {
    if (!p.swing) continue
    p.swing.t += dt
    if (p.swing.t >= SWING_DUR) {
      if (!p.swing.hit && p.side === 0) events.push({ type: 'whiff', by: 0 })
      p.swing = null
    }
  }

  if (m.phase === 'point') {
    m.pointT -= dt
    if (m.pointT <= 0) { m.phase = 'serve'; m.serveT = 0.9; m.ball.live = false }
    return events
  }
  if (m.phase === 'serve') {
    m.serveT -= dt
    // bat-follow mag vast bewegen; bal wacht boven de hand van de server
    m.ball.z = m.server === 0 ? PLAYER_Z + 6 : OPP_Z - 6
    m.ball.x = m.players[m.server].x * 0.4
    m.ball.y = 44
    if (m.serveT <= 0) { doServe(m); events.push({ type: 'serve', by: m.server }) }
    return events
  }

  // ── Rally: bal integreren ──────────────────────────────────────────────────
  const b = m.ball
  b.vy -= GRAV * dt
  b.x += b.vx * dt
  b.y += b.vy * dt
  b.z += b.vz * dt

  // Tafelstuit.
  if (b.y <= BALL_R && b.vy < 0) {
    const onTable = Math.abs(b.x) < HW && b.z > 0 && b.z < L
    if (onTable) {
      b.y = BALL_R
      b.vy = -b.vy * BOUNCE
      const half: Side = b.z < NET_Z ? 0 : 1
      if (b.lastBounceSide === half) { // twee keer op dezelfde helft → die kant faalde (of dumpte de serve)
        return point(m, (1 - half) as Side, 'dubbele stuit', events)
      }
      b.lastBounceSide = half
      b.bounces++
    } else {
      // Naast/voorbij de tafel op de grond → uit; punt voor de tegenstander van de laatste slag.
      const to = b.owner === 0 ? 1 : b.owner === 1 ? 0 : (b.z < NET_Z ? 1 : 0)
      return point(m, to as Side, 'bal uit', events)
    }
  }

  // Net.
  if (Math.abs(b.z - NET_Z) < 3 && b.y < NET_H && Math.abs(b.x) < HW + 6) {
    const to = b.owner === 0 ? 1 : 0
    return point(m, to as Side, 'in het net', events)
  }

  // ── Slag-detectie ──────────────────────────────────────────────────────────
  // Je mag pas terugslaan NÁ precies één stuit op je helft (echte tafeltennis-regel).
  // Speler (dichtbij): mag pas terugslaan NÁ een stuit op ZIJN helft, en moet dan ACTIEF slaan —
  // het bat moet in x ÉN in z (diepte) bij de bal staan. Vandaar het vooruit/achteruit lopen.
  if (b.owner !== 0 && b.lastBounceSide === 0 && b.vz < 0 && b.z < NET_Z && b.z > -MISS_Z) {
    const p = m.players[0]
    const sw = p.swing
    if (sw && !sw.hit && sw.t >= SWING_HIT_MIN && sw.t <= SWING_HIT_MAX
      && Math.abs(b.x - p.x) < PADDLE_REACH && Math.abs(b.z - p.z) < REACH_Z) {
      sw.hit = true
      sw.face = b.x >= p.x ? 'fore' : 'back'
      const q = swingQuality(sw.t)
      hitBall(m, 0, sw.power, q, p.vx, sw.kind)
      events.push({ type: 'hit', by: 0, power: sw.power, face: sw.face, sweet: q > 0.7 })
    }
  }
  // Bal voorbij het speler-vlak: stuiterde-ie eerst in jouw helft → jij miste (punt tegenstander);
  // vloog-ie er zonder stuit overheen → de tegenstander sloeg 'm uit (punt voor jou).
  if (b.owner === 1 && b.z <= -MISS_Z) return point(m, b.lastBounceSide === 0 ? 1 : 0, b.lastBounceSide === 0 ? 'jij mist' : 'bal uit', events)
  // Tegenstander (ver): slaat automatisch als de bal — ná een stuit op ZIJN helft — binnen bereik komt.
  if (b.owner !== 1 && b.lastBounceSide === 1 && b.vz > 0 && b.z > L - HITZONE && b.z < L + MISS_Z) {
    if (Math.abs(b.x - m.players[1].x) < PADDLE_REACH) {
      const diff = clamp(difficulty, 0, 1)
      const q = 0.45 + 0.5 * diff * Math.random()
      const power = clamp(0.4 + 0.4 * diff * Math.random() + (Math.random() < 0.2 ? 0.3 : 0), 0.15, 1)
      m.players[1].swing = { t: 0, power, face: b.x >= m.players[1].x ? 'fore' : 'back', kind: 'normal', hit: true }
      hitBall(m, 1, power, q, m.players[1].vx + (Math.random() * 2 - 1) * 40 * (1 - diff))
      events.push({ type: 'hit', by: 1, power, face: m.players[1].swing.face, sweet: q > 0.7 })
    }
  }
  if (b.owner === 0 && b.z >= L + MISS_Z) return point(m, b.lastBounceSide === 1 ? 0 : 1, b.lastBounceSide === 1 ? 'tegenstander mist' : 'bal uit', events)

  return events
}

function point(m: PongMatch, to: Side, reason: string, events: PongEvent[]): PongEvent[] {
  m.score[to] += 1
  m.ball.live = false
  for (const p of m.players) { p.swing = null; p.charging = false; p.chargeT = 0 }
  events.push({ type: 'point', to, reason })
  const a = m.score[0]
  const bb = m.score[1]
  if ((a >= m.target || bb >= m.target) && Math.abs(a - bb) >= 2) {
    m.phase = 'over'
    m.winner = a > bb ? 0 : 1
    events.push({ type: 'over', winner: m.winner })
    return events
  }
  m.server = ((m.score[0] + m.score[1]) % 4 < 2 ? 0 : 1) as Side // elke 2 punten wisselt de service
  m.phase = 'point'
  m.pointT = 1.3
  return events
}
