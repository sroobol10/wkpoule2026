// Bepaalt InputCommand's voor alle door de computer bestuurde spelers: de tegenstander
// én de teamgenoten van de mens. De client overschrijft daarna de index van de bestuurde
// speler met de toetsenbord-input.
//
// Bewust simpel & framework-agnostisch. Gebruikt Math.random voor onnauwkeurigheid
// (prima voor lokaal spel v1; voor online lockstep later vervangen door een seeded rng).
//
// De AI gebruikt hetzelfde laad/loslaat-schot als de mens: kick=true = power opladen,
// kick=false op de flank = trap. Ze lezen p.charge om te weten wanneer ze moeten lossen.

import {
  CENTER_CIRCLE_R,
  CONTROL_RADIUS,
  GOAL_WIDTH,
  MAX_CHARGE_TIME,
  PENALTY_H,
  PENALTY_W,
  PITCH_LENGTH,
  PITCH_WIDTH,
  PLAYER_RADIUS,
  TAKE_OVER_SPEED,
  traitMul,
} from './constants'
import { teamDir } from './teams'
import type { GameState, InputCommand, PlayerState, TeamId } from './types'
import { clamp, dist, dist2, norm, sub, type Vec2 } from './vec'

const CENTER_Y = PITCH_WIDTH / 2
const SHOOT_RANGE = 430
const CONTROL_D = CONTROL_RADIUS + PLAYER_RADIUS

function attackGoal(team: TeamId, attackDir: 1 | -1): Vec2 {
  return { x: teamDir(team, attackDir) > 0 ? PITCH_LENGTH : 0, y: CENTER_Y }
}
function ownGoal(team: TeamId, attackDir: 1 | -1): Vec2 {
  return { x: teamDir(team, attackDir) > 0 ? 0 : PITCH_LENGTH, y: CENTER_Y }
}

function nearestOutfieldToBall(state: GameState, team: TeamId): PlayerState | null {
  let best: PlayerState | null = null
  let bestD = Infinity
  for (const p of state.players) {
    if (p.team !== team || p.role === 'GK') continue
    const d = dist2(p.pos, state.ball.pos)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

// Rang van deze speler op afstand-tot-bal binnen z'n eigen veldspelers (0 = dichtstbij).
// Gebruikt om een "tweede man" te laten bijdrukken zonder dat het hele team op de bal duikt.
function outfieldRankToBall(state: GameState, p: PlayerState): number {
  const myD = dist2(p.pos, state.ball.pos)
  let rank = 0
  for (const o of state.players) {
    if (o.team !== p.team || o.role === 'GK' || o.sentOff || o.id === p.id) continue
    if (dist2(o.pos, state.ball.pos) < myD) rank++
  }
  return rank
}

function nearestOpponent(state: GameState, p: PlayerState): number {
  let bestD = Infinity
  for (const o of state.players) {
    if (o.team === p.team) continue
    const d = dist(o.pos, p.pos)
    if (d < bestD) bestD = d
  }
  return bestD
}

// Dichtstbijzijnde tegenstander-veldspeler (om te dekken).
function nearestOppPlayer(state: GameState, p: PlayerState): PlayerState | null {
  let best: PlayerState | null = null
  let bestD = Infinity
  for (const o of state.players) {
    if (o.team === p.team || o.role === 'GK') continue
    const d = dist2(o.pos, p.pos)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

// Open medespeler om naar te passen: binnen bereik, niet strak gedekt, liefst voorwaarts.
function openTeammate(state: GameState, p: PlayerState, dir: 1 | -1): PlayerState | null {
  let best: PlayerState | null = null
  let bestScore = -Infinity
  for (const m of state.players) {
    if (m.team !== p.team || m.id === p.id || m.role === 'GK') continue
    const d = dist(m.pos, p.pos)
    if (d < 70 || d > 560) continue
    const openness = nearestOpponent(state, m)
    if (openness < 45) continue // strak gedekt → geen optie
    const forward = dir * (m.pos.x - p.pos.x)
    const score = forward * 0.5 + openness
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}

function moveTowards(from: Vec2, to: Vec2, slowRadius = 60): Vec2 {
  const d = sub(to, from)
  const l = Math.hypot(d.x, d.y)
  if (l < 2) return { x: 0, y: 0 }
  const s = Math.min(1, l / slowRadius)
  return { x: (d.x / l) * s, y: (d.y / l) * s }
}

function jitterDir(dir: Vec2, amount: number): Vec2 {
  if (amount <= 0) return dir
  const a = (Math.random() - 0.5) * 2 * amount
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos }
}

// Laden of lossen? Blijf laden tot de gewenste power bereikt is, richt intussen op `aim`.
function chargeKick(p: PlayerState, aim: Vec2, wantFrac: number): InputCommand {
  const want = wantFrac * MAX_CHARGE_TIME
  return { move: aim, kick: p.charge < want }
}

export function computeAICommands(
  state: GameState,
  humanControlledId: number,
  difficulty: number,
): InputCommand[] {
  const cmds: InputCommand[] = state.players.map(() => ({ move: { x: 0, y: 0 }, kick: false }))
  if (state.phase !== 'playing' && state.phase !== 'kickoff' && state.phase !== 'setpiece') return cmds

  const ball = state.ball
  const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
  const diff = clamp(difficulty, 0, 1)
  const aimError = (1 - diff) * 0.55 // radialen mik-fout (makkelijk = mist vaker)
  // Veldspelers lopen iets trager dan de mens (zo blijf je ze de baas), en met "reactie-ruis".
  // Bredere spreiding dan voorheen zodat Makkelijk/Normaal/Pittig echt anders voelen.
  const aiSpeed = 0.62 + 0.34 * diff // ~0.74 → 0.91
  const trackNoise = (1 - diff) * 80 // px positie-ruis bij het volgen van de bal
  const pressAgg = diff // 0..1: hoe fel de 2e man bijdrukt + hoe eerder er getackeld wordt
  const runAgg = 0.35 + 0.55 * diff // hoe vaak aanvallers een diepteloop maken

  const chaser: [PlayerState | null, PlayerState | null] = [
    nearestOutfieldToBall(state, 0),
    nearestOutfieldToBall(state, 1),
  ]
  // Welk team heeft (ongeveer) de bal? → aanvallers dringen op, verdedigers zakken/dekken.
  const poss: number = ball.lastTouch >= 0 ? (state.players[ball.lastTouch]?.team ?? -1) : -1
  const clock = state.clock

  for (const p of state.players) {
    if (p.id === humanControlledId) continue

    const dir = teamDir(p.team, state.attackDir)
    const goal = attackGoal(p.team, state.attackDir)
    const own = ownGoal(p.team, state.attackDir)

    // ── Keeper (op volle snelheid, actief: uitverdelen, uitkomen, lijn houden) ─────
    if (p.role === 'GK') {
      const ballToGoal = Math.abs(ball.pos.x - own.x)
      const inDanger = ballToGoal < PENALTY_W + 120 && Math.abs(ball.pos.y - CENTER_Y) < PENALTY_H / 2 + 70
      const toBall = dist(p.pos, ball.pos)
      // Is de keeper de dichtstbijzijnde van z'n team bij een losse bal? (sweeper-beslissing)
      let defNearer = false
      for (const o of state.players) {
        if (o.team === p.team && o.role !== 'GK' && !o.sentOff && dist(o.pos, ball.pos) < toBall) { defNearer = true; break }
      }
      if (toBall < CONTROL_D + 12) {
        // Bal aan de handschoen → uitverdelen naar een open medespeler, anders ver wegtrappen.
        const mate = openTeammate(state, p, dir)
        const aim = mate
          ? norm(sub({ x: mate.pos.x + mate.vel.x * 0.25, y: mate.pos.y + mate.vel.y * 0.25 }, p.pos))
          : norm(sub(goal, p.pos))
        cmds[p.id] = chargeKick(p, jitterDir(aim, mate ? 0.1 : 0.25), mate ? 0.42 : 0.62)
      } else if (inDanger && ballSpeed < 330 && !defNearer && toBall < 240) {
        cmds[p.id] = { move: moveTowards(p.pos, ball.pos, 24), kick: false } // uitkomen/sweepen
      } else if (inDanger && toBall < 150 && ballSpeed < 300) {
        cmds[p.id] = { move: moveTowards(p.pos, ball.pos, 26), kick: false } // losse bal smoren
      } else {
        // Hoek-spel: ga op de lijn doel-midden → bal staan (verkleint de hoek), en kom verder
        // uit naarmate de bal dichterbij én centraler is. Bij een schot: onderschep de baan.
        const central = 1 - Math.min(1, Math.abs(ball.pos.y - CENTER_Y) / (GOAL_WIDTH * 1.3))
        const close = 1 - Math.min(1, ballToGoal / (PENALTY_W + 260))
        const out = clamp(18 + close * central * 96, 16, 100)
        const gx = own.x, gy = CENTER_Y
        const vx = ball.pos.x - gx, vy = ball.pos.y - gy
        const vl = Math.hypot(vx, vy) || 1
        let kx = gx + (vx / vl) * out
        let ky = gy + (vy / vl) * out
        if (Math.abs(ball.vel.x) > 60 && Math.sign(ball.vel.x) === -Math.sign(dir)) {
          const t = (kx - ball.pos.x) / ball.vel.x
          if (t > 0 && t < 1.6) ky = ball.pos.y + ball.vel.y * t
        }
        ky = clamp(ky, CENTER_Y - GOAL_WIDTH / 2 - 16, CENTER_Y + GOAL_WIDTH / 2 + 16)
        const maxOut = gx + dir * 112
        kx = dir > 0 ? clamp(kx, gx, maxOut) : clamp(kx, maxOut, gx)
        cmds[p.id] = { move: moveTowards(p.pos, { x: kx, y: ky }, 24), kick: false }
      }
      continue
    }

    // ── Aftrap: iedereen houdt positie, alleen de aftrapper van het aftrappende team
    //    stapt naar de bal (voorkomt een brawl om de middenstip). ──────────────────
    if (state.phase === 'kickoff') {
      const isKicker = p.team === state.kickoffTeam && chaser[p.team]?.id === p.id
      if (isKicker) {
        cmds[p.id] = { move: moveTowards(p.pos, ball.pos, 24), kick: false }
      } else {
        let hx = (dir > 0 ? 0 : PITCH_LENGTH) + dir * p.anchor.x * PITCH_LENGTH
        let hy = p.anchor.y * PITCH_WIDTH
        // buiten de middencirkel blijven bij de aftrap
        const ax = hx - PITCH_LENGTH / 2
        const ay = hy - CENTER_Y
        const dc = Math.hypot(ax, ay)
        const minR = CENTER_CIRCLE_R + PLAYER_RADIUS + 16
        if (dc < minR) {
          if (dc < 1e-3) hx = PITCH_LENGTH / 2 - dir * minR
          else { hx = PITCH_LENGTH / 2 + (ax / dc) * minR; hy = CENTER_Y + (ay / dc) * minR }
        }
        cmds[p.id] = { move: moveTowards(p.pos, { x: hx, y: hy }, 40), kick: false }
      }
      scaleMove(cmds[p.id], aiSpeed)
      continue
    }

    // ── Set-piece (ingooi/hoekschop/doeltrap/vrije trap): het herstart-team neemt hem. ─
    if (state.phase === 'setpiece') {
      const isTaker = p.team === state.kickoffTeam && chaser[p.team]?.id === p.id
      if (isTaker) {
        const toBall = dist(p.pos, ball.pos)
        if (toBall > CONTROL_D) {
          cmds[p.id] = { move: moveTowards(p.pos, ball.pos, 18), kick: false } // naar de bal lopen
        } else {
          cmds[p.id] = chargeKick(p, jitterDir(norm(sub(goal, ball.pos)), aimError + 0.3), 0.3) // in het spel tikken
        }
      } else {
        // Anderen zakken naar hun formatie-anker (geen brawl om de bal).
        const hx = (dir > 0 ? 0 : PITCH_LENGTH) + dir * p.anchor.x * PITCH_LENGTH
        const hy = p.anchor.y * PITCH_WIDTH
        cmds[p.id] = { move: moveTowards(p.pos, { x: hx, y: hy }, 40), kick: false }
      }
      scaleMove(cmds[p.id], aiSpeed)
      continue
    }

    // ── Baljager ─────────────────────────────────────────────────────────────────
    if (chaser[p.team] && chaser[p.team]!.id === p.id) {
      const toBall = dist(p.pos, ball.pos)
      const hasBall = toBall < CONTROL_D && ballSpeed < TAKE_OVER_SPEED * 0.85
      if (hasBall) {
        const toGoal = dist(p.pos, goal)
        const pressured = nearestOpponent(state, p) < 46
        const mate = openTeammate(state, p, dir)
        const passer = p.id % 3 === 0 // sommige spelers zijn "passers" (deterministisch, geen geflikker)
        // Schutters (hoge shot-trait) durven van verder te knallen; op Pittig ook iets gretiger.
        const shootRange = SHOOT_RANGE * traitMul(p.traits.shot) * (0.9 + 0.15 * diff)
        if (toGoal < shootRange) {
          cmds[p.id] = chargeKick(p, jitterDir(norm(sub(goal, ball.pos)), aimError), 0.7) // schot
        } else if (mate && (pressured || passer)) {
          const lead = { x: mate.pos.x + mate.vel.x * 0.2, y: mate.pos.y + mate.vel.y * 0.2 }
          cmds[p.id] = chargeKick(p, norm(sub(lead, ball.pos)), 0.22) // pass naar open man
        } else if (pressured) {
          cmds[p.id] = chargeKick(p, jitterDir(norm(sub(goal, ball.pos)), aimError * 1.4), 0.5) // wegwerken
        } else {
          // dribbelen richting doel, maar met een golvende (niet-rechte) baan
          const g = norm(sub(goal, p.pos))
          const wob = Math.sin(clock * 1.2 + p.id * 2) * 0.4
          cmds[p.id] = { move: norm({ x: g.x - g.y * wob, y: g.y + g.x * wob }), kick: false }
        }
      } else {
        const enemyBall = poss >= 0 && poss !== p.team
        // Sliding is een laatste redmiddel: dichtbij (grote kans op de bal i.p.v. de man),
        // bij een controleerbare bal. Betere tacklers (tackle-trait) én hogere moeilijkheid
        // gaan van iets verder en iets vaker de grond op.
        const slideReach = 34 + p.traits.tackle * 2 + pressAgg * 6
        const slideWindow = Math.floor(clock * 1.5 + p.id) % 3 === 0 || diff > 0.75
        if (enemyBall && toBall < slideReach && ballSpeed < 320 && p.tackleCooldown <= 0 && slideWindow) {
          cmds[p.id] = { move: norm(sub(ball.pos, p.pos)), kick: false, slide: true }
        } else {
          // Naar de bal, met positie-ruis (geen perfect volgen); sprinten als 't ver is.
          const lead = {
            x: ball.pos.x + ball.vel.x * 0.1 + (Math.random() - 0.5) * trackNoise,
            y: ball.pos.y + ball.vel.y * 0.1 + (Math.random() - 0.5) * trackNoise,
          }
          cmds[p.id] = { move: moveTowards(p.pos, lead, 30), kick: false, sprint: toBall > 150 }
        }
      }
      scaleMove(cmds[p.id], aiSpeed)
      continue
    }

    // ── Tweede man drukt bij (pressing) ───────────────────────────────────────────
    // De op-één-na dichtstbijzijnde verdediger sluit de baldrager in als de tegenstander
    // de bal heeft; op onze helft altijd, hoog op het veld alleen bij hoge agressie (Pittig).
    const rank = outfieldRankToBall(state, p)
    if (poss >= 0 && poss !== p.team && rank === 1 && pressAgg > 0.25) {
      const ballDepth = dir * (ball.pos.x - PITCH_LENGTH / 2) // <0 = onze helft
      if (ballDepth < PITCH_LENGTH * 0.12 || pressAgg > 0.7) {
        const lead = { x: ball.pos.x + ball.vel.x * 0.12, y: ball.pos.y + ball.vel.y * 0.12 }
        cmds[p.id] = { move: moveTowards(p.pos, lead, 32), kick: false, sprint: dist(p.pos, ball.pos) > 130 }
        scaleMove(cmds[p.id], aiSpeed)
        continue
      }
    }

    // ── Overige spelers: dynamisch positioneren (opkomen / inzakken + dekken + wander) ──
    const homeX = (dir > 0 ? 0 : PITCH_LENGTH) + dir * p.anchor.x * PITCH_LENGTH
    const homeY = p.anchor.y * PITCH_WIDTH
    const attacking = poss === p.team
    let tx: number
    let ty: number
    let deepRun = false
    if (attacking) {
      // Diepteloop: spitsen/middenvelders duiken periodiek de ruimte in vóór de bal richting
      // doel → biedt een pass-optie (de baldrager leidt z'n pass naar lopende mannen).
      const runPhase = Math.sin(clock * 0.6 + p.id * 2.1)
      if ((p.role === 'FWD' || p.role === 'MID') && runPhase > 1 - runAgg) {
        deepRun = true
        tx = ball.pos.x + dir * (150 + 130 * Math.abs(runPhase))
        ty = homeY * 0.5 + ball.pos.y * 0.2 + Math.sin(clock + p.id) * 130
      } else {
        // opdringen richting het doel + meebewegen met de bal (breed blijven, vorm behouden)
        tx = (homeX + dir * PITCH_LENGTH * 0.13) * 0.74 + ball.pos.x * 0.26
        ty = homeY * 0.62 + ball.pos.y * 0.38
      }
    } else {
      // inzakken richting eigen doel + de dichtstbijzijnde tegenstander dekken (doel-zijde)
      tx = (homeX - dir * PITCH_LENGTH * 0.05) * 0.74 + ball.pos.x * 0.26
      ty = homeY * 0.64 + ball.pos.y * 0.36
      const mark = nearestOppPlayer(state, p)
      if (mark && dist(p.pos, mark.pos) < 280) {
        tx = tx * 0.45 + (mark.pos.x - dir * 34) * 0.55
        ty = ty * 0.4 + mark.pos.y * 0.6
      }
    }
    // vloeiende off-ball beweging (tijd + speler-id) → lijnen lopen open/dicht
    // (tijdens een diepteloop geen wobble: dan wil je strak de ruimte in)
    const wob = deepRun ? 0 : 46
    tx += Math.sin(clock * 0.7 + p.id * 1.7) * wob
    ty += Math.cos(clock * 0.55 + p.id * 2.3) * wob
    const target = {
      x: clamp(tx, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS),
      y: clamp(ty, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS),
    }
    cmds[p.id] = { move: moveTowards(p.pos, target, deepRun ? 40 : 70), kick: false, sprint: deepRun }
    scaleMove(cmds[p.id], aiSpeed)
  }

  return cmds
}

// Schaalt alleen de loopsnelheid; richting (voor schot/pass via norm) blijft intact.
function scaleMove(cmd: InputCommand, f: number) {
  cmd.move = { x: cmd.move.x * f, y: cmd.move.y * f }
}
