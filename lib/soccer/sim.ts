// Zuivere, deterministische wedstrijdsimulatie. Geen DOM, geen React, geen wallclock.
// step(state, inputs, dt) muteert en retourneert dezelfde state — deterministisch gegeven
// (state, inputs, dt). Dat is precies wat lockstep-netcode later nodig heeft voor online 1v1.

import {
  AIR_CONTROL_HEIGHT,
  BALL_FRICTION,
  BALL_GRAVITY,
  BALL_MAX_SPEED,
  BALL_RADIUS,
  BODY_BLOCK_SPEED,
  BODY_RESTITUTION,
  CENTER_CIRCLE_R,
  CONTROL_RADIUS,
  FOUL_BEHIND_RED,
  FOUL_BEHIND_YELLOW,
  FOUL_FRONT_RED,
  FOUL_FRONT_YELLOW,
  FOUL_ANIM_DELAY,
  FOUL_COOLDOWN,
  FOUL_RADIUS,
  REF_LAG,
  REF_SPEED,
  LIFT_MIN_CHARGE,
  SHOT_LIFT_VZ,
  DRIBBLE_KEEP,
  DRIBBLE_MAX_FACTOR,
  DRIBBLE_PULL,
  DRIBBLE_PUSH,
  GK_REACH_HEIGHT,
  GK_SAVE_RADIUS,
  GOAL_WIDTH,
  KICK_COOLDOWN,
  KICK_POWER,
  KEEPER_MAX_SPEED,
  MAX_CHARGE_TIME,
  PASS_ASSIST_CONE,
  PASS_ASSIST_RANGE,
  PASS_CHARGE_MAX,
  PASS_POWER,
  PITCH_LENGTH,
  PITCH_WIDTH,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  RECOVER_SPEED_MULT,
  FEINT_COOLDOWN,
  FEINT_SPEED,
  FEINT_TIME,
  FLICK_LIFT,
  FLICK_SPEED,
  PANNA_CHANCE,
  PANNA_RANGE,
  PANNA_SPEED,
  SLIDE_COOLDOWN,
  SLIDE_SPEED,
  SLIDE_STEAL_RADIUS,
  SLIDE_TIME,
  RESTART_KEEP_RADIUS,
  TUMBLE_KNOCK,
  TUMBLE_TIME,
  SPRINT_DRAIN,
  SPRINT_MIN,
  SPRINT_MULT,
  STAMINA_REGEN,
  SECURITY_CATCH_RADIUS,
  SECURITY_SPAWN_AFTER,
  SECURITY_SPEED,
  STREAKER_BALL_KICK,
  STREAKER_KICKOFF_GAP,
  STREAKER_MAX_LIFE,
  STREAKER_MIN_GAP,
  STREAKER_RADIUS,
  STREAKER_SPAWN_CHANCE,
  STREAKER_SPEED,
  TAKE_OVER_SPEED,
  TRAP_DAMPEN,
  TRAP_MAX_SPEED,
  TRAP_MIN_SPEED,
  WALL_RESTITUTION,
} from './constants'
import { anchorToWorld, teamDir } from './teams'
import type { BallState, GameState, InputCommand, PlayerState, RestartKind, TeamId } from './types'
import {
  add,
  clamp,
  clampLen,
  dist,
  dist2,
  norm,
  scale,
  sub,
  type Vec2,
} from './vec'

const GOAL_CELEBRATION = 2.8 // seconden full-screen goal-viering voor de aftrap

const goalHalf = GOAL_WIDTH / 2
const CENTER: Vec2 = { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 }

// ── Publieke helpers voor de client (buiten de per-tick step) ─────────────────

// Zet iedereen op de formatie en de bal op de stip voor een aftrap.
export function placeForKickoff(state: GameState, kickoffTeam: TeamId): void {
  state.kickoffTeam = kickoffTeam
  state.ball.pos = { ...CENTER }
  state.ball.vel = { x: 0, y: 0 }
  state.ball.z = 0
  state.ball.vz = 0
  state.ball.lastTouch = -1
  state.ball.prevTouch = -1
  state.restartKind = null

  for (const p of state.players) {
    if (p.sentOff) continue // van het veld gestuurd → blijft weg
    const home = anchorToWorld(p.anchor, p.team, state.attackDir)
    const d = teamDir(p.team, state.attackDir)
    // Bij de aftrap staat iedereen op eigen helft; alleen de aftrappende spits gaat naar de bal.
    let pos = { ...home }
    const ownHalfMaxX = d > 0 ? CENTER.x - PLAYER_RADIUS * 4 : CENTER.x + PLAYER_RADIUS * 4
    if (d > 0) pos.x = Math.min(pos.x, ownHalfMaxX)
    else pos.x = Math.max(pos.x, ownHalfMaxX)
    const isTaker = p.team === kickoffTeam && p.role === 'FWD'
    if (isTaker) {
      pos = { x: CENTER.x - d * (PLAYER_RADIUS + 6), y: CENTER.y }
    } else {
      // Iedereen behalve de aftrapper: buiten de middencirkel (voorkomt de kluwen).
      const ax = pos.x - CENTER.x
      const ay = pos.y - CENTER.y
      const dc = Math.hypot(ax, ay)
      const minR = CENTER_CIRCLE_R + PLAYER_RADIUS + 14
      if (dc < minR) {
        if (dc < 1e-3) pos = { x: CENTER.x - d * minR, y: CENTER.y } // dead-center → naar eigen helft
        else pos = { x: CENTER.x + (ax / dc) * minR, y: CENTER.y + (ay / dc) * minR }
      }
    }
    p.pos = pos
    p.vel = { x: 0, y: 0 }
    p.facing = { x: d, y: 0 }
    p.kickCooldown = 0
    p.charge = 0
    p.slideTimer = 0
    p.slideTackle = false
    p.feintTimer = 0
    p.tumbleTimer = 0
    p.tackleCooldown = 0
  }
  state.streaker = null // geen bestormer meer op het veld bij de aftrap
  state.security = null
  state.pendingFoul = null
  // Korte pauze ná de aftrap (niet de volle gap), zodat streakers óók in kort/veel-scorende
  // wedstrijden gewoon tijdens het spel blijven verschijnen.
  state.streakerCooldown = Math.max(state.streakerCooldown, STREAKER_KICKOFF_GAP)
  state.phase = 'kickoff'
  state.phaseTimer = 0
}

// Zet een set-piece op: bal op de plek, alleen `team` mag spelen tot de bal beweegt.
function setPiece(state: GameState, team: TeamId, spot: Vec2, kind: RestartKind): void {
  state.ball.pos = { ...spot }
  state.ball.vel = { x: 0, y: 0 }
  state.ball.z = 0
  state.ball.vz = 0
  state.ball.lastTouch = -1
  state.ball.prevTouch = -1
  state.kickoffTeam = team // hergebruikt als "herstart-team" voor de gating
  state.restartKind = kind
  state.phase = 'setpiece'
  state.phaseTimer = 0
}

// Start de tweede helft: van kant wisselen en de andere ploeg trapt af.
export function startSecondHalf(state: GameState): void {
  state.half = 2
  state.clock = 0
  state.attackDir = (state.attackDir === 1 ? -1 : 1)
  const other: TeamId = state.startKickoffTeam === 0 ? 1 : 0
  placeForKickoff(state, other)
}

// Speler-index in state.players.length-array (id == index dankzij opbouw in teams.ts).
const idx = (p: PlayerState) => p.id

// Registreer een balaanraking en onthoud de vorige (voor doelpunt-toewijzing bij afketsers).
function touch(ball: BallState, id: number) {
  if (id !== ball.lastTouch) {
    ball.prevTouch = ball.lastTouch
    ball.lastTouch = id
  }
}

// ── De simulatie-tick ─────────────────────────────────────────────────────────

export function step(state: GameState, inputs: InputCommand[], dt: number): GameState {
  const { ball } = state

  // Fasen zonder actief spel: bal uitrollen, timers aflopen, verder niets.
  if (state.phase === 'goal') {
    celebrateGoal(state, dt) // on-pitch viering: scorer rent naar de hoek, teamgenoten erbij
    integrateBall(state, dt)
    state.phaseTimer -= dt
    if (state.phaseTimer <= 0) placeForKickoff(state, state.kickoffTeam)
    return state
  }
  if (state.phase === 'halftime' || state.phase === 'fulltime') {
    integrateBall(state, dt)
    return state
  }

  moveRef(state, dt)
  updateStreaker(state, dt)
  if (state.foulCooldown > 0) state.foulCooldown = Math.max(0, state.foulCooldown - dt)

  // Spelers bewegen (met sprint/stamina), sliden, of starten een slide.
  for (const p of state.players) {
    if (p.sentOff) continue // van het veld gestuurd
    if (p.kickCooldown > 0) p.kickCooldown = Math.max(0, p.kickCooldown - dt)
    if (p.tackleCooldown > 0) p.tackleCooldown = Math.max(0, p.tackleCooldown - dt)
    const cmd = inputs[idx(p)] ?? { move: { x: 0, y: 0 }, kick: false }

    // Omvergelopen door een tackle → tuimelt weg (terugstoot rolt uit), even geen controle.
    if (p.tumbleTimer > 0) {
      p.tumbleTimer = Math.max(0, p.tumbleTimer - dt)
      p.vel.x *= 1 - Math.min(1, 6 * dt)
      p.vel.y *= 1 - Math.min(1, 6 * dt)
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
      continue
    }

    // Bezig met sliden → doorglijden in de loeprichting (sliding-tackle).
    if (p.slideTimer > 0) {
      p.slideTimer = Math.max(0, p.slideTimer - dt)
      p.vel = scale(p.facing, SLIDE_SPEED)
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
      if (p.slideTimer <= 0) p.tackleCooldown = SLIDE_COOLDOWN
      continue
    }

    // Bezig met een schijnbeweging/kap → korte dash in de loeprichting (bal volgt via de dribbel).
    if (p.feintTimer > 0) {
      p.feintTimer = Math.max(0, p.feintTimer - dt)
      p.vel = scale(p.facing, FEINT_SPEED)
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
      if (p.feintTimer <= 0) p.tackleCooldown = FEINT_COOLDOWN
      continue
    }

    // Sprint + stamina.
    const moving = Math.hypot(cmd.move.x, cmd.move.y) > 0.05
    const sprinting = !!cmd.sprint && p.role !== 'GK' && p.stamina > SPRINT_MIN && moving
    p.stamina = sprinting ? Math.max(0, p.stamina - SPRINT_DRAIN * dt) : Math.min(1, p.stamina + STAMINA_REGEN * dt)
    let maxSpeed = p.role === 'GK' ? KEEPER_MAX_SPEED : PLAYER_MAX_SPEED
    if (sprinting) maxSpeed *= SPRINT_MULT
    if (p.tackleCooldown > 0) maxSpeed *= RECOVER_SPEED_MULT
    movePlayer(p, cmd.move, dt, maxSpeed)

    // Slide starten met Q = sliding-tackle, alléén zonder bal aan de voet
    // (mét bal gebruik je R voor een kap/dash — dat is de aanvallers-actie).
    if (cmd.slide && !state.prevSlide[idx(p)] && p.tackleCooldown <= 0) {
      const hasBall = dist(p.pos, state.ball.pos) < CONTROL_RADIUS + PLAYER_RADIUS && state.ball.z < AIR_CONTROL_HEIGHT
      if (!hasBall) {
        let d = norm(cmd.move)
        if (d.x === 0 && d.y === 0) d = p.facing
        if (d.x === 0 && d.y === 0) d = { x: teamDir(p.team, state.attackDir), y: 0 }
        p.facing = d
        p.slideTackle = true
        p.slideTimer = SLIDE_TIME
        p.vel = scale(d, SLIDE_SPEED)
      }
    }

    // Schijnbeweging/kap (R): alleen met de bal aan de voet → snelle dash in de gekozen richting.
    if (cmd.feint && !state.prevFeint[idx(p)] && p.feintTimer <= 0 && p.tackleCooldown <= 0) {
      const hasBall = dist(p.pos, state.ball.pos) < CONTROL_RADIUS + PLAYER_RADIUS && state.ball.z < AIR_CONTROL_HEIGHT
      if (hasBall) {
        let d = norm(cmd.move)
        if (d.x === 0 && d.y === 0) d = p.facing
        if (d.x === 0 && d.y === 0) d = { x: teamDir(p.team, state.attackDir), y: 0 }
        p.facing = d
        p.feintTimer = FEINT_TIME
        p.vel = scale(d, FEINT_SPEED)
      }
    }
  }
  separatePlayers(state.players)

  // Aftrap/set-piece: tegenstander mag niet bij de bal tot deze genomen is.
  if (state.phase === 'kickoff' || state.phase === 'setpiece') keepOpponentsAway(state)

  // Balbezit: trappen op de LOSLAAT-flank (power uit de laadtijd) of dribbelen.
  handleBallContact(state, inputs)

  // Tackle-inslag: getackelde tegenstander tuimelt (terugstoot). Daarna de overtredings-check,
  // en een lopende (vertraagde) overtreding afhandelen (fluit/kaart komt ná de tumble-animatie).
  applyTackleImpacts(state)
  checkSlideFouls(state)
  resolvePendingFoul(state, dt)

  // Bal integreren, lichamen laten blokkeren, muren/goals/uit afhandelen.
  integrateBall(state, dt)
  collideBallBodies(state)
  const scored = handleBoundsAndGoals(state)

  // Aftrap/set-piece wordt "spel" zodra de bal echt in beweging is.
  if (state.phase === 'kickoff') {
    if (dist2(ball.pos, CENTER) > 26 * 26 || Math.hypot(ball.vel.x, ball.vel.y) > 40) state.phase = 'playing'
  } else if (state.phase === 'setpiece') {
    if (Math.hypot(ball.vel.x, ball.vel.y) > 45) {
      state.phase = 'playing'
      state.restartKind = null
    }
  }

  // Klok + helft/einde + balbezit-tijd (voor de post-match stats).
  if (state.phase === 'playing' && !scored) {
    state.clock += dt
    const owner = ball.lastTouch >= 0 ? state.players[ball.lastTouch]?.team : -1
    if (owner === 0 || owner === 1) state.stats.possMs[owner] += dt
    if (state.clock >= state.halfLengthSec) {
      state.phase = state.half === 1 ? 'halftime' : 'fulltime'
    }
  }

  // Power-balk opladen (knop vastgehouden) + edge-detectie voor de volgende tick.
  // Gebeurt ná de trap zodat de loslaat-flank nog de opgebouwde charge kon uitlezen.
  for (const p of state.players) {
    const held = inputs[idx(p)]?.kick ?? false
    p.charge = held ? Math.min(MAX_CHARGE_TIME, p.charge + dt) : 0
    state.prevKick[idx(p)] = held
    state.prevSlide[idx(p)] = inputs[idx(p)]?.slide ?? false
    state.prevChip[idx(p)] = inputs[idx(p)]?.chip ?? false
    state.prevFeint[idx(p)] = inputs[idx(p)]?.feint ?? false
  }
  return state
}

// ── Onderdelen ─────────────────────────────────────────────────────────────────

function movePlayer(p: PlayerState, move: Vec2, dt: number, maxSpeed: number) {
  const ml = Math.hypot(move.x, move.y)
  if (ml > 1e-3) {
    const dir = { x: move.x / ml, y: move.y / ml }
    const target = scale(dir, maxSpeed * Math.min(1, ml))
    p.vel.x += (target.x - p.vel.x) * Math.min(1, PLAYER_ACCEL * dt / maxSpeed)
    p.vel.y += (target.y - p.vel.y) * Math.min(1, PLAYER_ACCEL * dt / maxSpeed)
    p.facing = dir
  } else {
    // Uitlopen/afremmen.
    const f = Math.max(0, 1 - PLAYER_FRICTION * dt)
    p.vel.x *= f
    p.vel.y *= f
  }
  const capped = clampLen(p.vel, maxSpeed)
  p.vel = capped
  p.pos.x = clamp(p.pos.x + p.vel.x * dt, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
  p.pos.y = clamp(p.pos.y + p.vel.y * dt, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
}

// Zachte scheiding van overlappende spelers.
function separatePlayers(players: PlayerState[]) {
  const min = PLAYER_RADIUS * 2
  const min2 = min * min
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]
      const b = players[j]
      const d2 = dist2(a.pos, b.pos)
      if (d2 > 0 && d2 < min2) {
        const d = Math.sqrt(d2)
        const push = (min - d) / 2
        const nx = (a.pos.x - b.pos.x) / d
        const ny = (a.pos.y - b.pos.y) / d
        a.pos.x += nx * push
        a.pos.y += ny * push
        b.pos.x -= nx * push
        b.pos.y -= ny * push
      }
    }
  }
}

// Wie raakt de bal, en trapt/dribbelt die?
function handleBallContact(state: GameState, inputs: InputCommand[]) {
  const { ball } = state
  // Bal in de lucht (geloft schot): niemand kan 'm controleren — hij vliegt over.
  if (ball.z > AIR_CONTROL_HEIGHT) return
  const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
  const prevOwner = ball.lastTouch
  const prevTeam = prevOwner >= 0 ? state.players[prevOwner]?.team : -1

  // Slide-tackle: een glijdende speler die de bal raakt, wipt 'm los in z'n glijrichting.
  for (const p of state.players) {
    if (p.slideTimer <= 0) continue
    if (dist(p.pos, ball.pos) < SLIDE_STEAL_RADIUS + BALL_RADIUS) {
      const d = norm(p.facing)
      ball.pos = add(p.pos, scale(d, PLAYER_RADIUS + BALL_RADIUS))
      ball.vel = scale(d, 250)
      ball.z = 0
      ball.vz = 0
      touch(ball, p.id)
      return
    }
  }

  // Dichtstbijzijnde speler binnen controle-straal. Een net-getrapte speler (kickCooldown)
  // telt niet mee, zodat je je eigen uitgaande bal niet meteen weer "opzuigt".
  let best: PlayerState | null = null
  let bestD = CONTROL_RADIUS + PLAYER_RADIUS
  for (const p of state.players) {
    if (p.kickCooldown > 0 || p.sentOff || p.tumbleTimer > 0) continue // getuimelde speler heeft even geen controle
    const d = dist(p.pos, ball.pos)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best) return
  // Bij aftrap/set-piece mag alleen het nemende team de bal spelen.
  if ((state.phase === 'kickoff' || state.phase === 'setpiece') && best.team !== state.kickoffTeam) return
  touch(ball, best.id)

  const cmd = inputs[idx(best)] ?? { move: { x: 0, y: 0 }, kick: false }
  // LOSLAAT-flank: knop was ingedrukt en is nu los → trap met de opgebouwde power.
  const releaseEdge = state.prevKick[idx(best)] && !cmd.kick

  // Q mét bal: staat er een verdediger recht vóór je? → PANNA-poging (bal door de benen,
  // lukt niet altijd). Anders een hakje/wip: bal vooruit de lucht in over een sliding heen.
  const flickEdge = !!cmd.slide && !state.prevSlide[idx(best)]
  if (flickEdge && best.kickCooldown <= 0) {
    let dir = norm(cmd.move)
    if (dir.x === 0 && dir.y === 0) dir = best.facing
    if (dir.x === 0 && dir.y === 0) dir = { x: teamDir(best.team, state.attackDir), y: 0 }
    // verdediger recht vooruit binnen panna-bereik?
    let victim: PlayerState | null = null
    let vBest = PANNA_RANGE + PLAYER_RADIUS
    for (const o of state.players) {
      if (o.team === best.team || o.sentOff) continue
      const to = sub(o.pos, best.pos)
      const od = Math.hypot(to.x, to.y)
      if (od < 1e-3 || od > vBest) continue
      if ((to.x / od) * dir.x + (to.y / od) * dir.y < 0.55) continue // niet echt vooruit
      vBest = od
      victim = o
    }
    if (victim) {
      if (Math.random() < PANNA_CHANCE) {
        // Gelukt: bal door de benen, net achter de verdediger; jij loopt erop, hij is beduusd.
        ball.pos = { x: victim.pos.x + dir.x * (PLAYER_RADIUS + 16), y: victim.pos.y + dir.y * (PLAYER_RADIUS + 16) }
        ball.vel = scale(dir, PANNA_SPEED)
        ball.z = 0
        ball.vz = 0
        touch(ball, best.id)
        best.kickCooldown = KICK_COOLDOWN * 0.55
        victim.tumbleTimer = Math.max(victim.tumbleTimer, 0.45)
        state.pannaCount += 1
        state.stats.pannas[best.team] += 1
      } else {
        // Mislukt: de verdediger onderschept → jij bent de bal kwijt.
        ball.pos = { x: victim.pos.x + dir.x * (PLAYER_RADIUS + BALL_RADIUS), y: victim.pos.y + dir.y * (PLAYER_RADIUS + BALL_RADIUS) }
        ball.vel = scale(dir, -70)
        ball.z = 0
        ball.vz = 0
        touch(ball, victim.id)
        best.kickCooldown = KICK_COOLDOWN
      }
      if (state.phase === 'kickoff' || state.phase === 'setpiece') { state.phase = 'playing'; state.restartKind = null }
      return
    }
    // geen verdediger vooruit → hakje/wip
    ball.vel = scale(dir, FLICK_SPEED)
    ball.pos = add(ball.pos, scale(dir, PLAYER_RADIUS + BALL_RADIUS))
    ball.z = 0
    ball.vz = FLICK_LIFT
    touch(ball, best.id)
    best.kickCooldown = KICK_COOLDOWN
    if (state.phase === 'kickoff' || state.phase === 'setpiece') { state.phase = 'playing'; state.restartKind = null }
    return
  }

  // Stift (E): gerichte lofte pass met assist, altijd omhoog → over de verdediging heen.
  const chipEdge = !!cmd.chip && !state.prevChip[idx(best)]
  if (chipEdge && best.kickCooldown <= 0) {
    let dir = norm(cmd.move)
    if (dir.x === 0 && dir.y === 0) dir = best.facing
    if (dir.x === 0 && dir.y === 0) dir = { x: teamDir(best.team, state.attackDir), y: 0 }
    let power = 470
    const mate = bestPassTarget(state, best, dir)
    if (mate) {
      const rough = dist(ball.pos, mate.pos)
      const travel = Math.min(0.7, rough / 520)
      const lead = add(mate.pos, scale(mate.vel, travel))
      dir = norm(sub(lead, ball.pos))
      power = clamp(360 + dist(ball.pos, lead) * 1.15, PASS_POWER, KICK_POWER - 60)
    }
    const carry = Math.max(0, best.vel.x * dir.x + best.vel.y * dir.y)
    ball.vel = scale(dir, power + carry * 0.3)
    ball.pos = add(ball.pos, scale(dir, PLAYER_RADIUS + BALL_RADIUS))
    ball.z = 0
    ball.vz = SHOT_LIFT_VZ * 0.92 // altijd lift → over verdedigers
    touch(ball, best.id)
    best.kickCooldown = KICK_COOLDOWN
    best.charge = 0
    if (state.phase === 'kickoff' || state.phase === 'setpiece') { state.phase = 'playing'; state.restartKind = null }
    return
  }

  if (releaseEdge && best.kickCooldown <= 0) {
    // Richting: laatste input-richting indien aanwezig, anders de loeprichting.
    let dir = norm(cmd.move)
    if (dir.x === 0 && dir.y === 0) dir = best.facing
    if (dir.x === 0 && dir.y === 0) dir = { x: teamDir(best.team, state.attackDir), y: 0 }

    // Power schaalt met de laadtijd: korte tik → pass, vol → knal.
    const t = Math.min(1, best.charge / MAX_CHARGE_TIME)
    let power = PASS_POWER + (KICK_POWER - PASS_POWER) * t
    // Een geladen trap (geen tik-pass) telt als schotpoging.
    if (best.charge >= PASS_CHARGE_MAX) state.stats.shots[best.team] += 1

    // Pass-assist: bij een korte tik richten we naar de best passende medespeler — en
    // mikken op waar die medespeler ZAL zijn (reistijd-lead), zodat lopende spelers 'm halen.
    if (best.charge < PASS_CHARGE_MAX) {
      const mate = bestPassTarget(state, best, dir)
      if (mate) {
        const rough = dist(ball.pos, mate.pos)
        const travel = Math.min(0.65, rough / 560) // geschatte reistijd bij ~pass-snelheid
        const lead = add(mate.pos, scale(mate.vel, travel))
        dir = norm(sub(lead, ball.pos))
        const d = dist(ball.pos, lead)
        // Ruim genoeg kracht om aan te komen (de trap dempt 'm bij ontvangst).
        power = clamp(320 + d * 1.2, PASS_POWER, KICK_POWER - 10)
      }
    }

    const carry = Math.max(0, best.vel.x * dir.x + best.vel.y * dir.y)
    ball.vel = scale(dir, power + carry * 0.3)
    ball.pos = add(ball.pos, scale(dir, PLAYER_RADIUS + BALL_RADIUS))
    // Lift: alleen een geladen schot wipt omhoog (pass/zacht schot blijft op de grond).
    const liftT = (t - LIFT_MIN_CHARGE) / (1 - LIFT_MIN_CHARGE)
    ball.z = 0
    ball.vz = liftT > 0 ? SHOT_LIFT_VZ * liftT : 0
    touch(ball, best.id)
    best.kickCooldown = KICK_COOLDOWN
    best.charge = 0
    if (state.phase === 'kickoff') state.phase = 'playing'
    return
  }

  // Trap: ontvang je een pass van een ANDERE teamgenoot, dan dempen we de vaart → aan de voet.
  // (Nooit je eigen uitgaande bal; tegenstanders "trappen" niet maar ketsen 'm weg.)
  if (best.id !== prevOwner && best.team === prevTeam && ballSpeed > TRAP_MIN_SPEED && ballSpeed < TRAP_MAX_SPEED) {
    ball.vel.x *= TRAP_DAMPEN
    ball.vel.y *= TRAP_DAMPEN
    return
  }

  // Dribbelen: trek de bal naar een punt VÓÓR de speler (in z'n loeprichting), zodat-ie
  // niet achter 'm blijft hangen — ook als de speler even stilstaat.
  if (ballSpeed < TAKE_OVER_SPEED) {
    let dir = best.facing
    if (dir.x === 0 && dir.y === 0) dir = norm(best.vel)
    if (dir.x === 0 && dir.y === 0) dir = { x: teamDir(best.team, state.attackDir), y: 0 }
    const targetPos = add(best.pos, scale(dir, DRIBBLE_KEEP))
    const toTarget = sub(targetPos, ball.pos)
    ball.vel.x += toTarget.x * DRIBBLE_PULL
    ball.vel.y += toTarget.y * DRIBBLE_PULL
    const moving = Math.hypot(best.vel.x, best.vel.y)
    ball.vel = clampLen(ball.vel, Math.max(DRIBBLE_PUSH, moving * DRIBBLE_MAX_FACTOR + 40))
  }
}

// Fysieke botsing bal ↔ lichamen: snelle ballen (schoten/harde passes) ketsen af tegen
// spelers die niet zelf net trapten. Zo blokkeren verdedigers én keepers de bal echt.
function collideBallBodies(state: GameState) {
  const { ball } = state
  const speed = Math.hypot(ball.vel.x, ball.vel.y)
  if (speed < BODY_BLOCK_SPEED) return
  for (const p of state.players) {
    // net getrapt, de huidige balbezitter, of van het veld → niet blokkeren
    if (p.kickCooldown > 0 || p.id === ball.lastTouch || p.sentOff) continue
    const isGK = p.role === 'GK'
    // Veldspelers laten hoge ballen over zich heen; alleen keepers pakken die (tot reach-hoogte).
    if (ball.z > AIR_CONTROL_HEIGHT && !(isGK && ball.z < GK_REACH_HEIGHT)) continue
    // Keeper: reikwijdte krimpt met de balsnelheid → geladen power-shots zijn moeilijker te pakken.
    const react = 1 - Math.min(0.62, Math.max(0, (speed - 450) / 620))
    const rad = isGK ? GK_SAVE_RADIUS * react : PLAYER_RADIUS + BALL_RADIUS * state.ballScale
    const dx = ball.pos.x - p.pos.x
    const dy = ball.pos.y - p.pos.y
    const d = Math.hypot(dx, dy)
    if (d >= rad || d < 1e-3) continue
    if (isGK) {
      // Redding: bal afstoppen (parade) en voor de voeten laten vallen → keeper werkt 'm weg.
      ball.z = 0
      ball.vz = 0
      ball.vel.x *= 0.16
      ball.vel.y *= 0.16
      ball.pos.x = p.pos.x + (dx / d) * rad
      ball.pos.y = p.pos.y + (dy / d) * rad
      if (speed > 470) state.saveCount += 1 // knappe redding op een harde bal → "WAT EEN REDDING!"
    } else {
      const nx = dx / d
      const ny = dy / d
      const vDotN = ball.vel.x * nx + ball.vel.y * ny
      if (vDotN < 0) {
        ball.vel.x -= (1 + BODY_RESTITUTION) * vDotN * nx
        ball.vel.y -= (1 + BODY_RESTITUTION) * vDotN * ny
      }
      ball.pos.x = p.pos.x + nx * rad
      ball.pos.y = p.pos.y + ny * rad
    }
    touch(ball, p.id)
    return // één blok per tick is genoeg
  }
}

// Beste medespeler om naar te passen: binnen de kegel rond `dir` en binnen bereik.
function bestPassTarget(state: GameState, from: PlayerState, dir: Vec2): PlayerState | null {
  let best: PlayerState | null = null
  let bestScore = Infinity
  for (const p of state.players) {
    if (p.team !== from.team || p.id === from.id) continue
    const to = sub(p.pos, state.ball.pos)
    const d = Math.hypot(to.x, to.y)
    if (d < 40 || d > PASS_ASSIST_RANGE) continue
    const nd = { x: to.x / d, y: to.y / d }
    const dot = nd.x * dir.x + nd.y * dir.y
    const ang = Math.acos(clamp(dot, -1, 1))
    if (ang > PASS_ASSIST_CONE) continue
    // Voorkeur voor kleine hoek én redelijke afstand.
    const score = ang * 220 + d * 0.25
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

function integrateBall(state: GameState, dt: number) {
  const { ball } = state
  // Ondergrond bepaalt de wrijving: zand/sneeuw remmen de bal harder, een zaalvloer minder.
  const surfMul = state.surface === 'sneeuw' ? 1.9 : state.surface === 'strand' ? 1.5 : state.surface === 'zaal' ? 0.82 : 1
  // Grondwrijving remt alleen als de bal (bijna) op de grond ligt; in de lucht rolt-ie niet.
  const onGround = ball.z <= AIR_CONTROL_HEIGHT
  const f = onGround ? Math.max(0, 1 - BALL_FRICTION * surfMul * dt) : 1
  ball.vel.x *= f
  ball.vel.y *= f
  // Wind duwt de bal: subtiel op de grond, flink sterker als-ie in de lucht is.
  const windMul = onGround ? 0.3 : 1.6
  ball.vel.x += state.wind.x * windMul * dt
  ball.vel.y += state.wind.y * windMul * dt
  ball.vel = clampLen(ball.vel, BALL_MAX_SPEED)
  ball.pos.x += ball.vel.x * dt
  ball.pos.y += ball.vel.y * dt
  // Hoogte (z) met zwaartekracht.
  if (ball.z > 0 || ball.vz > 0) {
    ball.vz -= BALL_GRAVITY * dt
    ball.z += ball.vz * dt
    if (ball.z <= 0) {
      ball.z = 0
      ball.vz = 0
    }
  }
}

// Arcade-boarding: de bal blijft altijd in het spel en kaatst tegen de lijnen (gedempt).
// Alleen in de doelopening loopt-ie door → goal. Retourneert true als er zojuist gescoord is.
function handleBoundsAndGoals(state: GameState): boolean {
  const { ball } = state
  const L = PITCH_LENGTH
  const W = PITCH_WIDTH
  const br = BALL_RADIUS * state.ballScale // effectieve balstraal (giant-ball)

  // Zijlijnen (y) → kaatsen.
  if (ball.pos.y < br) {
    ball.pos.y = br
    ball.vel.y = Math.abs(ball.vel.y) * WALL_RESTITUTION
  } else if (ball.pos.y > W - br) {
    ball.pos.y = W - br
    ball.vel.y = -Math.abs(ball.vel.y) * WALL_RESTITUTION
  }

  const inMouth = Math.abs(ball.pos.y - CENTER.y) < goalHalf

  // Linker doellijn (x=0): goal in de mond, anders kaatsen.
  if (inMouth && ball.pos.x <= 0) {
    return awardGoal(state, teamDir(0, state.attackDir) < 0 ? 0 : 1)
  }
  if (!inMouth && ball.pos.x < br) {
    ball.pos.x = br
    ball.vel.x = Math.abs(ball.vel.x) * WALL_RESTITUTION
  }
  // Rechter doellijn (x=L): goal in de mond, anders kaatsen.
  if (inMouth && ball.pos.x >= L) {
    return awardGoal(state, teamDir(0, state.attackDir) > 0 ? 0 : 1)
  }
  if (!inMouth && ball.pos.x > L - br) {
    ball.pos.x = L - br
    ball.vel.x = -Math.abs(ball.vel.x) * WALL_RESTITUTION
  }
  return false
}

// Scheidsrechter loopt mee met de bal (op afstand); raakt de bal niet.
function moveRef(state: GameState, dt: number): void {
  const r = state.ref
  const dx = state.ball.pos.x - r.pos.x
  const dy = state.ball.pos.y - r.pos.y
  const d = Math.hypot(dx, dy)
  if (d > REF_LAG) {
    const stepLen = Math.min(REF_SPEED * dt, d - REF_LAG)
    r.pos.x += (dx / d) * stepLen
    r.pos.y += (dy / d) * stepLen
  }
  r.pos.x = clamp(r.pos.x, 20, PITCH_LENGTH - 20)
  r.pos.y = clamp(r.pos.y, 20, PITCH_WIDTH - 20)
}

// Willekeurig punt nét buiten een van de vier randen (de tribune).
// Punt op het veld, `r` verwijderd van (cx,cy) onder hoek `ang`, geklemd binnen de lijnen.
function streakerPointNear(cx: number, cy: number, ang: number, r: number): Vec2 {
  return {
    x: clamp(cx + Math.cos(ang) * r, 40, PITCH_LENGTH - 40),
    y: clamp(cy + Math.sin(ang) * r, 40, PITCH_WIDTH - 40),
  }
}

// Veldbestormer: spawnt af en toe RONDOM de bal (waar de camera staat → altijd in beeld),
// slentert daar rond, ketst de bal weg (kan 'm niet bezitten) + loopt spelers omver.
function updateStreaker(state: GameState, dt: number): void {
  const s = state.streaker
  if (!s) {
    if (state.streakerCooldown > 0) state.streakerCooldown -= dt
    else if (state.phase === 'playing' && Math.random() < STREAKER_SPAWN_CHANCE * dt) {
      const b = state.ball.pos
      const ang = Math.random() * Math.PI * 2
      const pos = streakerPointNear(b.x, b.y, ang, 330) // net binnen beeld, aan één kant van de bal
      const target = streakerPointNear(b.x, b.y, ang + Math.PI, 330) // dwars door de bal-omgeving
      const variant: 0 | 1 = Math.random() < 0.5 ? 0 : 1
      state.streaker = { pos, vel: { x: 0, y: 0 }, target, timer: STREAKER_MAX_LIFE, variant, caught: false }
    }
    return
  }

  s.timer -= dt
  if (s.timer <= 0) {
    // Veiligheids-timeout → weg, korte pauze tot de volgende.
    state.streaker = null
    state.security = null
    state.streakerCooldown = STREAKER_MIN_GAP
    return
  }
  let dx = s.target.x - s.pos.x
  let dy = s.target.y - s.pos.y
  let d = Math.hypot(dx, dy)
  if (d < 8) {
    if (s.caught) {
      // Bij de tribune aangekomen → beiden weg, korte pauze tot de volgende.
      state.streaker = null
      state.security = null
      state.streakerCooldown = STREAKER_MIN_GAP
      return
    }
    // Doel bereikt → nieuw doel bij de (huidige) bal, zodat-ie in beeld blijft slenteren.
    s.target = streakerPointNear(state.ball.pos.x, state.ball.pos.y, Math.random() * Math.PI * 2, 280)
    dx = s.target.x - s.pos.x
    dy = s.target.y - s.pos.y
    d = Math.hypot(dx, dy) || 1
  }
  const nx = dx / d
  const ny = dy / d
  const spd = s.caught ? STREAKER_SPEED * 1.15 : STREAKER_SPEED // gepakt → wat kwieker de tribune op
  s.vel = { x: nx * spd, y: ny * spd }
  s.pos.x += s.vel.x * dt
  s.pos.y += s.vel.y * dt

  // Zolang hij nog vrij rondloopt: bal wegketsen + spelers hinderen. Gepakt = alleen nog aflopen.
  if (!s.caught) {
    const ball = state.ball
    const bd = Math.hypot(ball.pos.x - s.pos.x, ball.pos.y - s.pos.y)
    const minB = STREAKER_RADIUS + BALL_RADIUS
    if (ball.z < 18 && bd < minB && bd > 1e-3) {
      const bx = (ball.pos.x - s.pos.x) / bd
      const by = (ball.pos.y - s.pos.y) / bd
      ball.pos.x = s.pos.x + bx * minB
      ball.pos.y = s.pos.y + by * minB
      const speed = Math.max(STREAKER_BALL_KICK, Math.hypot(ball.vel.x, ball.vel.y) * 0.7)
      ball.vel.x = bx * speed
      ball.vel.y = by * speed
    }
    for (const p of state.players) {
      if (p.sentOff) continue
      const pd = Math.hypot(p.pos.x - s.pos.x, p.pos.y - s.pos.y)
      const minP = STREAKER_RADIUS + PLAYER_RADIUS
      if (pd < minP && pd > 1e-3) {
        const pnx = (p.pos.x - s.pos.x) / pd
        const pny = (p.pos.y - s.pos.y) / pd
        if (p.tumbleTimer <= 0 && Math.random() < 0.05) {
          p.tumbleTimer = TUMBLE_TIME
          p.slideTimer = 0
          p.feintTimer = 0
          p.vel = { x: pnx * TUMBLE_KNOCK, y: pny * TUMBLE_KNOCK }
        } else {
          const push = minP - pd
          p.pos.x = clamp(p.pos.x + pnx * push, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
          p.pos.y = clamp(p.pos.y + pny * push, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
        }
      }
    }
  }

  // Beveiliger: verschijnt kort na de streaker aan de dichtstbijzijnde rand en zit 'm achterna.
  if (!state.security && STREAKER_MAX_LIFE - s.timer > SECURITY_SPAWN_AFTER) {
    const edges = [{ x: -20, y: s.pos.y }, { x: PITCH_LENGTH + 20, y: s.pos.y }, { x: s.pos.x, y: -20 }, { x: s.pos.x, y: PITCH_WIDTH + 20 }]
    const dists = [s.pos.x, PITCH_LENGTH - s.pos.x, s.pos.y, PITCH_WIDTH - s.pos.y]
    let mi = 0
    for (let i = 1; i < 4; i++) if (dists[i] < dists[mi]) mi = i
    state.security = { pos: { ...edges[mi] }, vel: { x: 0, y: 0 } }
  }
  if (state.security) {
    const sec = state.security
    const cdx = s.pos.x - sec.pos.x
    const cdy = s.pos.y - sec.pos.y
    const cd = Math.hypot(cdx, cdy) || 1
    sec.vel = { x: (cdx / cd) * SECURITY_SPEED, y: (cdy / cd) * SECURITY_SPEED }
    sec.pos.x += sec.vel.x * dt
    sec.pos.y += sec.vel.y * dt
    if (!s.caught && cd < SECURITY_CATCH_RADIUS) {
      // Gepakt! Samen naar de dichtstbijzijnde rand (tribune) → daar verdwijnen ze.
      s.caught = true
      const dd = [s.pos.x, PITCH_LENGTH - s.pos.x, s.pos.y, PITCH_WIDTH - s.pos.y]
      let mi = 0
      for (let i = 1; i < 4; i++) if (dd[i] < dd[mi]) mi = i
      s.target = mi === 0 ? { x: -60, y: s.pos.y } : mi === 1 ? { x: PITCH_LENGTH + 60, y: s.pos.y } : mi === 2 ? { x: s.pos.x, y: -60 } : { x: s.pos.x, y: PITCH_WIDTH + 60 }
    }
  }
}

// Herstart: houd de tegenstander (niet het herstart-team) buiten een straal rond de bal,
// zodat die er pas bij kan als de bal echt genomen is. Bij de aftrap = de middencirkel.
function keepOpponentsAway(state: GameState): void {
  const ball = state.ball
  const R = state.phase === 'kickoff' ? CENTER_CIRCLE_R + PLAYER_RADIUS : RESTART_KEEP_RADIUS
  for (const p of state.players) {
    if (p.sentOff || p.team === state.kickoffTeam) continue
    const dx = p.pos.x - ball.pos.x
    const dy = p.pos.y - ball.pos.y
    const d = Math.hypot(dx, dy)
    if (d < R) {
      const nx = d > 1e-3 ? dx / d : 1
      const ny = d > 1e-3 ? dy / d : 0
      p.pos.x = clamp(ball.pos.x + nx * R, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
      p.pos.y = clamp(ball.pos.y + ny * R, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
      p.vel = { x: 0, y: 0 }
      p.slideTimer = 0
    }
  }
}

// Tackle-inslag: een glijdende tackelaar die een tegenstander raakt, loopt 'm omver → tuimelen +
// terugstoot (los van of het een overtreding is; puur voor de fun/feedback). Eén keer per tuimeling.
function applyTackleImpacts(state: GameState): void {
  for (const p of state.players) {
    if (p.slideTimer <= 0 || !p.slideTackle || p.sentOff) continue
    for (const o of state.players) {
      if (o.team === p.team || o.sentOff || o.tumbleTimer > 0) continue
      const dx = o.pos.x - p.pos.x
      const dy = o.pos.y - p.pos.y
      const d = Math.hypot(dx, dy)
      if (d < FOUL_RADIUS + PLAYER_RADIUS) {
        o.tumbleTimer = TUMBLE_TIME
        o.slideTimer = 0
        o.feintTimer = 0
        const nx = d > 1e-3 ? dx / d : p.facing.x || 1
        const ny = d > 1e-3 ? dy / d : p.facing.y
        o.vel = { x: nx * TUMBLE_KNOCK, y: ny * TUMBLE_KNOCK }
        state.tackleCount += 1
        state.stats.tackles[p.team] += 1
      }
    }
  }
}

// Sliding-overtredingen: een glijdende speler die de MAN raakt (en de bal niet won) → vrije trap + evt. kaart.
function checkSlideFouls(state: GameState): void {
  if (state.phase !== 'playing') return
  if (state.foulCooldown > 0) return // net een overtreding gehad → even geen nieuwe (geen dubbele kaart)
  for (const p of state.players) {
    if (p.slideTimer <= 0 || !p.slideTackle || p.sentOff) continue // aanvallers-boost telt niet als overtreding
    if (state.ball.lastTouch === p.id) continue // schone tackle (bal gewonnen) → geen overtreding
    for (const o of state.players) {
      if (o.team === p.team || o.sentOff) continue
      if (dist(p.pos, o.pos) < FOUL_RADIUS + PLAYER_RADIUS) {
        const behind = p.facing.x * o.facing.x + p.facing.y * o.facing.y > 0.3
        // Nog niet meteen fluiten: eerst even de tumble/roll laten zien (FOUL_ANIM_DELAY),
        // dán pas de overtreding + kaart toekennen. Cooldown voorkomt intussen een tweede.
        state.pendingFoul = {
          slider: p.id,
          victim: o.id,
          behind,
          spot: { x: clamp(o.pos.x, 40, PITCH_LENGTH - 40), y: clamp(o.pos.y, 40, PITCH_WIDTH - 40) },
          delay: FOUL_ANIM_DELAY,
        }
        state.foulCooldown = FOUL_COOLDOWN
        return
      }
    }
  }
}

// Verstreken tackle-vertraging → de overtreding nu écht toekennen (fluit/kaart/vrije trap).
function resolvePendingFoul(state: GameState, dt: number): void {
  const pf = state.pendingFoul
  if (!pf) return
  pf.delay -= dt
  if (pf.delay > 0) return
  state.pendingFoul = null
  const slider = state.players[pf.slider]
  const victim = state.players[pf.victim]
  if (!slider || !victim || slider.sentOff) return
  awardFoul(state, slider, victim, pf.behind, pf.spot)
}

function awardFoul(state: GameState, slider: PlayerState, victim: PlayerState, behind: boolean, spot: Vec2): void {
  const r = Math.random()
  let red = false
  let yellow = false
  if (behind) {
    if (r < FOUL_BEHIND_RED) red = true
    else if (r < FOUL_BEHIND_RED + FOUL_BEHIND_YELLOW) yellow = true
  } else {
    if (r < FOUL_FRONT_RED) red = true
    else if (r < FOUL_FRONT_RED + FOUL_FRONT_YELLOW) yellow = true
  }
  if (yellow && slider.yellow) { yellow = false; red = true } // tweede geel = rood
  if (yellow) slider.yellow = true
  if (red) {
    slider.sentOff = true
    slider.pos = { x: PITCH_LENGTH / 2, y: -70 } // van het veld af
    slider.vel = { x: 0, y: 0 }
  }
  if (yellow || red) state.cards.push({ player: slider.id, team: slider.team, red, clock: state.clock, half: state.half })
  state.foulCount += 1
  state.foulCooldown = FOUL_COOLDOWN
  slider.slideTimer = 0
  slider.tackleCooldown = SLIDE_COOLDOWN * 1.5
  setPiece(state, victim.team, spot, 'freekick')
}

// On-pitch goalviering tijdens de 'goal'-fase: de maker rent juichend naar de dichtstbijzijnde
// hoek van de aanvalskant, z'n teamgenoten lopen naar hem toe; de tegenstanders staan er wat bij.
function celebrateGoal(state: GameState, dt: number): void {
  const team = state.lastGoalBy
  if (team === null) return
  const g = state.goals[state.goals.length - 1]
  let celebId = g && g.scorer >= 0 && state.players[g.scorer]?.team === team ? g.scorer : -1
  if (celebId < 0) celebId = nearestTeammateToBall(state, team) // eigen doelpunt → dichtstbijzijnde
  const goalX = teamDir(team, state.attackDir) > 0 ? PITCH_LENGTH : 0
  const corner = {
    x: goalX === 0 ? 70 : PITCH_LENGTH - 70,
    y: state.ball.pos.y < PITCH_WIDTH / 2 ? 70 : PITCH_WIDTH - 70,
  }
  const celeb = celebId >= 0 ? state.players[celebId] : null
  for (const p of state.players) {
    if (p.sentOff) continue
    if (p.team !== team) { p.vel.x *= 0.9; p.vel.y *= 0.9; continue }
    const target = celeb && p.id === celeb.id ? corner : (celeb ? celeb.pos : corner)
    const dir = norm(sub(target, p.pos))
    const near = dist(p.pos, target) < 26
    p.vel = near ? { x: p.vel.x * 0.8, y: p.vel.y * 0.8 } : scale(dir, 155)
    if (!near) p.facing = dir
    p.pos.x = clamp(p.pos.x + p.vel.x * dt, PLAYER_RADIUS, PITCH_LENGTH - PLAYER_RADIUS)
    p.pos.y = clamp(p.pos.y + p.vel.y * dt, PLAYER_RADIUS, PITCH_WIDTH - PLAYER_RADIUS)
  }
}

function awardGoal(state: GameState, scorer: TeamId): boolean {
  state.score[scorer] += 1
  state.lastGoalBy = scorer
  // Toewijzing: laatste aanraker van het scorende team = de maker. Ketste 'm er af een
  // tegenstander in, dan crediteren we de schutter ervóór (indien van het scorende team);
  // anders is het een echt eigen doelpunt.
  const last = state.ball.lastTouch
  const lastP = last >= 0 ? state.players[last] : null
  let scorerId = last
  let ownGoal = false
  if (lastP && lastP.team !== scorer) {
    const prev = state.ball.prevTouch
    const prevP = prev >= 0 ? state.players[prev] : null
    if (prevP && prevP.team === scorer) scorerId = prev
    else ownGoal = true
  }
  state.goals.push({ team: scorer, scorer: scorerId, ownGoal, clock: state.clock, half: state.half })
  // Soort doelpunt (voor de banner): eigen goal, of een SCREAMER (harde knal van afstand).
  const goalX = teamDir(scorer, state.attackDir) > 0 ? PITCH_LENGTH : 0
  const shotSpeed = Math.hypot(state.ball.vel.x, state.ball.vel.y)
  const fromFar = scorerId >= 0 && Math.abs(state.players[scorerId].pos.x - goalX) > 390
  state.lastGoalKind = ownGoal ? 'owngoal' : (shotSpeed > 520 && fromFar ? 'screamer' : 'normal')
  state.phase = 'goal'
  state.phaseTimer = GOAL_CELEBRATION
  state.kickoffTeam = scorer === 0 ? 1 : 0 // incasserend team trapt af
  state.ball.vel = { x: 0, y: 0 }
  return true
}

// Kleine util die de client gebruikt om de bestuurde speler te bepalen.
export function nearestTeammateToBall(state: GameState, team: TeamId, excludeGK = true): number {
  let best = -1
  let bestD = Infinity
  for (const p of state.players) {
    if (p.team !== team) continue
    if (excludeGK && p.role === 'GK') continue
    if (p.sentOff) continue
    const d = dist2(p.pos, state.ball.pos)
    if (d < bestD) {
      bestD = d
      best = p.id
    }
  }
  return best
}

export { CENTER, GOAL_CELEBRATION }

// ── Debug-hulpjes (alleen aangeroepen vanuit dev-hotkeys) ─────────────────────
// Forceer een streaker (met beveiliger) nu.
export function debugSpawnStreaker(state: GameState): void {
  const b = state.ball.pos
  const ang = Math.random() * Math.PI * 2
  const pos = streakerPointNear(b.x, b.y, ang, 330)
  const target = streakerPointNear(b.x, b.y, ang + Math.PI, 330)
  state.streaker = { pos, vel: { x: 0, y: 0 }, target, timer: STREAKER_MAX_LIFE, variant: Math.random() < 0.5 ? 0 : 1, caught: false }
  state.security = null
  state.streakerCooldown = 0
}
// Forceer een gele/rode kaart voor een veldspeler van team 0 (+ vrije trap voor team 1).
export function debugCard(state: GameState, red: boolean): void {
  const p = state.players.find((x) => x.team === 0 && x.role !== 'GK' && !x.sentOff)
  if (!p) return
  if (red) { p.sentOff = true; p.pos = { x: PITCH_LENGTH / 2, y: -70 }; p.vel = { x: 0, y: 0 } } else p.yellow = true
  state.cards.push({ player: p.id, team: p.team, red, clock: state.clock, half: state.half })
  state.foulCount += 1
  state.foulCooldown = FOUL_COOLDOWN
  setPiece(state, 1, { x: PITCH_LENGTH * 0.5, y: PITCH_WIDTH * 0.5 }, 'freekick')
}
// Forceer een doelpunt voor team 0.
export function debugGoal(state: GameState): void {
  const scorer = state.players.find((x) => x.team === 0 && x.role === 'FWD') ?? state.players.find((x) => x.team === 0)
  if (scorer) { state.ball.prevTouch = state.ball.lastTouch; state.ball.lastTouch = scorer.id }
  awardGoal(state, 0)
}
