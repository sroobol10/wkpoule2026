// Netwerk — 2v2 beachvolleybal, side-view (verticaal vlak: x = veld, y = hoogte).
// Slagen zijn BALLISTISCH met net-clearance: we mikken op een landingspunt op de overkant
// en hogen de boog net genoeg op om over het net te komen — zo blijft de bal nooit "hangen".
// Q = dink (zacht net over), E = duik (reddende lunge), R = blok (muurtje bij het net).

export const W = 1000
export const H = 560
export const FLOOR = 470 // zandniveau (voeten)
export const NET_X = 500
export const NET_TOP = 300 // bovenkant net (kleinere y = hoger)
export const GRAVITY = 880
export const BALL_R = 11
export const PLAYER_SPEED = 255
export const JUMP_V = 580 // afzetsnelheid omhoog
export const REACH = 74 // slag-bereik rond de borst (ruim genoeg om lekker te raken)
export const DIVE_REACH = 48 // extra bereik tijdens een duik
export const DIVE_TIME = 0.5
export const DIVE_SPEED = 360 // horizontale lunge-snelheid van de duik
export const BLOCK_TIME = 0.5
export const MAX_TOUCHES = 3
export const WIN_SCORE = 11

export type VSide = 0 | 1 // 0 = links, 1 = rechts
export type VInput = { moveX: number; jump: boolean; hit: boolean; dink: boolean; dive: boolean; block: boolean }

export type VPlayer = {
  id: number // 0,1 = team links · 2,3 = team rechts
  team: VSide
  face: string
  name: string
  x: number
  y: number // voeten (FLOOR = op het zand)
  vy: number
  swingT: number // net geslagen (animatie)
  diveT: number // >0 = aan het duiken (extra bereik + horizontale lunge)
  blockT: number // >0 = aan het blokken (muurtje bij het net)
}

export type VBall = { x: number; y: number; vx: number; vy: number }

export type VEvent = { to: VSide; reason: string } | null

export type VState = {
  players: [VPlayer, VPlayer, VPlayer, VPlayer]
  ball: VBall
  touches: number // aanrakingen van het team dat 'm nu speelt
  lastTeam: VSide | -1
  serving: VSide
  live: boolean
  prevHit: boolean[]
  prevDink: boolean[]
  prevDive: boolean[]
}

export function makeVState(faces: { face: string; name: string }[]): VState {
  const mk = (id: number, team: VSide, x: number): VPlayer => ({
    id, team, face: faces[id].face, name: faces[id].name, x, y: FLOOR, vy: 0, swingT: 0, diveT: 0, blockT: 0,
  })
  return {
    players: [mk(0, 0, 180), mk(1, 0, 360), mk(2, 1, W - 360), mk(3, 1, W - 180)],
    ball: { x: 180, y: FLOOR - 240, vx: 0, vy: 0 },
    touches: 0,
    lastTeam: -1,
    serving: Math.random() < 0.5 ? 0 : 1,
    live: false,
    prevHit: [false, false, false, false],
    prevDink: [false, false, false, false],
    prevDive: [false, false, false, false],
  }
}

// Ballistische boog van (fromX,fromY) naar landingspunt targetX op vloerhoogte, met een
// boog die gegarandeerd over het net komt. Retourneert de begin-snelheid.
function arcTo(fromX: number, fromY: number, targetX: number): { vx: number; vy: number } {
  let vy = -560
  for (let i = 0; i < 9; i++) {
    const disc = vy * vy - 2 * GRAVITY * (fromY - FLOOR)
    const T = (-vy + Math.sqrt(Math.max(1, disc))) / GRAVITY // vluchttijd tot de vloer
    const vx = (targetX - fromX) / Math.max(0.28, T)
    const crossesNet = (fromX - NET_X) * (targetX - NET_X) < 0
    if (crossesNet && Math.abs(vx) > 1) {
      const tNet = (NET_X - fromX) / vx
      const yNet = fromY + vy * tNet + 0.5 * GRAVITY * tNet * tNet
      if (yNet > NET_TOP - 18) { vy -= 80; continue } // boog te laag → hoger mikken
    }
    return { vx, vy }
  }
  return { vx: (targetX - fromX) * 0.9, vy }
}

// Serveren: nette boog diagonaal het vak in (haalt altijd het net).
export function serve(s: VState, side: VSide, aim: number): void {
  const server = s.players[side === 0 ? 0 : 3]
  const dir = side === 0 ? 1 : -1
  const fromX = server.x
  const fromY = server.y - 120
  const targetX = NET_X + dir * (170 + (aim * 0.5 + 0.5) * 200) // aim schuift diep/kort
  const { vx, vy } = arcTo(fromX, fromY, targetX)
  s.ball.x = fromX
  s.ball.y = fromY
  s.ball.vx = vx
  s.ball.vy = vy
  s.lastTeam = side
  s.touches = 1
  s.live = true
}

// Landings-x van de bal op vloerhoogte (voor de AI).
export function predictLandingX(b: VBall): number {
  const a = GRAVITY / 2
  const c = b.y - (FLOOR - BALL_R)
  const disc = b.vy * b.vy - 4 * a * c
  if (disc <= 0) return b.x
  const t = (-b.vy + Math.sqrt(disc)) / (2 * a)
  let x = b.x + b.vx * t
  if (x < 12) x = 24 - x
  if (x > W - 12) x = 2 * (W - 12) - x
  return x
}

export function step(s: VState, inputs: VInput[], dt: number): VEvent {
  if (!s.live) return null
  const b = s.ball

  for (const p of s.players) {
    const input = inputs[p.id]
    if (p.swingT > 0) p.swingT = Math.max(0, p.swingT - dt)
    if (p.blockT > 0) p.blockT = Math.max(0, p.blockT - dt)

    // Duik (E): korte horizontale lunge naar de bal + extra bereik.
    const diveEdge = input.dive && !s.prevDive[p.id]
    s.prevDive[p.id] = input.dive
    if (diveEdge && p.diveT <= 0 && p.y >= FLOOR - 0.5) {
      p.diveT = DIVE_TIME
    }
    if (p.diveT > 0) {
      p.diveT = Math.max(0, p.diveT - dt)
      const lungeDir = Math.abs(input.moveX) > 0.1 ? Math.sign(input.moveX) : Math.sign(b.x - p.x) || 1
      p.x += lungeDir * DIVE_SPEED * dt
    } else {
      p.x += Math.max(-1, Math.min(1, input.moveX)) * PLAYER_SPEED * dt
    }
    p.x = p.team === 0 ? Math.max(40, Math.min(NET_X - 34, p.x)) : Math.max(NET_X + 34, Math.min(W - 40, p.x))

    // Springen + blok + zwaartekracht.
    const grounded = p.y >= FLOOR - 0.5
    if ((input.jump || input.block) && grounded) p.vy = -JUMP_V
    // Handen omhoog terwijl je in de lucht hangt: expliciet blokken, én automatisch als je bij
    // het net springt — zo levert gewoon springen bij het net al een blok op (geen aparte toets nodig).
    const nearNetNow = Math.abs(p.x - NET_X) < 135
    if (p.y < FLOOR - 20 && (input.block || nearNetNow)) p.blockT = BLOCK_TIME
    p.vy += GRAVITY * dt
    p.y = Math.min(FLOOR, p.y + p.vy * dt)
    if (p.y >= FLOOR) p.vy = 0

    // ── Slaan / dinken (edge) ───────────────────────────────────────────────
    const hitEdge = input.hit && !s.prevHit[p.id]
    const dinkEdge = input.dink && !s.prevDink[p.id]
    s.prevHit[p.id] = input.hit
    s.prevDink[p.id] = input.dink
    if (!hitEdge && !dinkEdge) continue
    const cx = p.x
    const cy = p.y - 46 // borsthoogte
    const reach = REACH + (p.diveT > 0 ? DIVE_REACH : 0)
    if (Math.hypot(b.x - cx, b.y - cy) > reach + BALL_R) { p.swingT = 0.22; continue } // lucht

    const touches = s.lastTeam === p.team ? s.touches + 1 : 1
    if (touches > MAX_TOUCHES) return { to: (1 - p.team) as VSide, reason: `${MAX_TOUCHES}× is het maximum` }
    s.touches = touches
    s.lastTeam = p.team
    p.swingT = 0.22

    const dir = p.team === 0 ? 1 : -1
    const airborne = p.y < FLOOR - 30
    const atNet = Math.abs(p.x - NET_X) < 150
    if (dinkEdge && !hitEdge) {
      // DINK: zacht net over het net plaatsen (kort achter het net).
      const target = NET_X + dir * (70 + Math.random() * 60)
      const a = arcTo(b.x, b.y, target)
      b.vx = a.vx * 0.9
      b.vy = a.vy
    } else if (airborne && atNet && b.y < NET_TOP - 6) {
      // SMASH: alleen als de bal écht boven de netrand hangt. Bal start bóven het net (zakt er
      // dus nooit doorheen) en gaat schuin omlaag de overkant in — hard, maar te verdedigen.
      b.y = Math.min(b.y, NET_TOP - 22)
      b.x = NET_X + dir * 16
      b.vx = dir * (355 + Math.abs(input.moveX) * 120)
      b.vy = 250
    } else {
      // BUMP/SET: ballistisch naar diep op de overkant (met net-clearance).
      const target = NET_X + dir * (200 + Math.abs(input.moveX) * 190)
      const a = arcTo(b.x, b.y, target)
      b.vx = a.vx
      b.vy = a.vy
    }
  }

  // ── Bal ────────────────────────────────────────────────────────────────────
  b.vy += GRAVITY * dt
  b.x += b.vx * dt
  b.y += b.vy * dt

  // Blok: een springende blokker met de handen hoog bij het net kaatst een passerende bal
  // omlaag de overkant in (telt niet als aanraking — het is een muur).
  for (const p of s.players) {
    if (p.blockT <= 0) continue
    const hx = p.x + (p.team === 0 ? 1 : -1) * 10
    const hy = p.y - 64 // handen boven het hoofd
    if (Math.abs(b.x - NET_X) < 100 && Math.hypot(b.x - hx, b.y - hy) < 62) {
      const dir = p.team === 0 ? 1 : -1
      b.x = NET_X + dir * 16
      b.vx = dir * 265
      b.vy = 210
      s.lastTeam = p.team
      s.touches = 1
    }
  }

  // Net: onder de bovenkant → kaatst terug.
  if (Math.abs(b.x - NET_X) < 7 && b.y > NET_TOP) {
    b.vx = -b.vx * 0.35
    b.x = b.x < NET_X ? NET_X - 8 : NET_X + 8
  }
  // Muren + plafond houden 'm in het spel.
  if (b.x < 12) { b.x = 12; b.vx = Math.abs(b.vx) * 0.8 }
  if (b.x > W - 12) { b.x = W - 12; b.vx = -Math.abs(b.vx) * 0.8 }
  if (b.y < 16) { b.y = 16; b.vy = Math.abs(b.vy) * 0.8 }

  // Vloer: punt voor de overkant van waar-ie neerkomt.
  if (b.y >= FLOOR - BALL_R) {
    const side: VSide = b.x < NET_X ? 0 : 1
    return { to: (1 - side) as VSide, reason: 'Punt — de bal valt in het zand' }
  }
  return null
}
