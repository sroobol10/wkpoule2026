// Knokstukken — pure boks-sim. Eén step() met vaste timestep; de client krijgt per tick
// events terug (treffers, knockdowns, bel, einde) voor toasts, deeltjes en geluid.
// Alles draait om afstand + timing: de jab is snel, de hoek is getelegrafeerd maar rámt.

import {
  BLOCK_MOVE_MULT, BLOCK_REDUCE, BLOCK_STAM_COST, CLEAN_BASE, CLEAN_MULT, CLEAN_PER_SHOT,
  COUNT_MAX, FIGHTER_GAP, GETUP_BASE, GETUP_HP, GETUP_PER_KD, HIT_PUSHBACK, HIT_STUN,
  HOOK_DMG, HOOK_RANGE, HOOK_STAM, HOOK_TOTAL, HOOK_WINDUP, JAB_DMG, JAB_RANGE, JAB_STAM,
  JAB_TOTAL, JAB_WINDUP, LOW_STAM, MAX_HP, MAX_KNOCKDOWNS, MAX_STAM, MOVE_SPEED,
  REST_HEAL, REST_TIME, RING_MAX_X, RING_MIN_X, ROUND_TIME, STAM_REGEN_BLOCK,
  STAM_REGEN_IDLE, STAM_REGEN_MOVE, TRAIT_CHIN, TRAIT_DMG, TRAIT_SPEED,
  DODGE_TIME, DODGE_CD, DODGE_STEP,
  GRAB_WINDUP, GRAB_TOTAL, GRAB_RANGE, GRAB_DMG, GRAB_STAM, GRAB_PUSHBACK, GRAB_STUN,
  UPPERCUT_BLOCK_REDUCE, UPPERCUT_DMG, UPPERCUT_KD, UPPERCUT_RANGE, UPPERCUT_STAM,
  UPPERCUT_TOTAL, UPPERCUT_WINDUP, ULT_BLOCK_REDUCE, ULT_DMG, ULT_GAIN_CLEAN, ULT_GAIN_LAND,
  ULT_GAIN_TAKE, ULT_MAX, ULT_RANGE, ULT_TOTAL, ULT_WINDUP, ULT_RUSH_SPEED,
} from './constants'
import type { BoksEvent, BoksInput, Fighter, Match, PlayerTraits, PunchKind, Side } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const speedMul = (f: Fighter) => (1 + (f.traits.pace - 3) * TRAIT_SPEED) * (f.stamina < LOW_STAM ? 0.75 : 1)

// Per-slag parameters (bereik / basisschade / windup / totale duur / blok-doorlaat).
const PUNCH = {
  jab: { range: JAB_RANGE, dmg: JAB_DMG, windup: JAB_WINDUP, total: JAB_TOTAL, block: BLOCK_REDUCE },
  hook: { range: HOOK_RANGE, dmg: HOOK_DMG, windup: HOOK_WINDUP, total: HOOK_TOTAL, block: BLOCK_REDUCE },
  uppercut: { range: UPPERCUT_RANGE, dmg: UPPERCUT_DMG, windup: UPPERCUT_WINDUP, total: UPPERCUT_TOTAL, block: UPPERCUT_BLOCK_REDUCE },
  ultimate: { range: ULT_RANGE, dmg: ULT_DMG, windup: ULT_WINDUP, total: ULT_TOTAL, block: ULT_BLOCK_REDUCE },
} as const

export function makeMatch(picks: [{ face: string; name: string; traits: PlayerTraits }, { face: string; name: string; traits: PlayerTraits }], rounds: number): Match {
  const mk = (side: Side): Fighter => ({
    side, face: picks[side].face, name: picks[side].name, traits: picks[side].traits,
    x: side === 0 ? 380 : 620,
    state: 'idle', t: 0, struck: false,
    hp: MAX_HP, stamina: MAX_STAM,
    knockdowns: 0, points: 0, getupMeter: 0, headKnock: 0, ultimate: 0, dodgeCd: 0,
  })
  return {
    f: [mk(0), mk(1)], round: 1, rounds, clock: ROUND_TIME,
    phase: 'fight', count: 0, down: -1, restT: 0, winner: -1, how: null,
    prevJab: [false, false], prevHook: [false, false], prevUppercut: [false, false], prevUltimate: [false, false],
    prevDodge: [false, false], prevGrab: [false, false],
  }
}

// Iemand tegen het canvas werken (of TKO bij de derde keer).
function knockDown(m: Match, att: Fighter, def: Fighter, events: BoksEvent[]): void {
  def.hp = 0
  def.knockdowns += 1
  if (def.knockdowns >= MAX_KNOCKDOWNS) {
    m.phase = 'over'
    m.winner = att.side
    m.how = 'tko'
    def.state = 'down'
    att.state = 'win'
    events.push({ type: 'knockdown', who: def.side })
    events.push({ type: 'end', winner: att.side, how: 'tko' })
  } else {
    m.phase = 'count'
    m.count = 0
    m.down = def.side
    def.state = 'down'
    def.t = 0
    def.getupMeter = 0
    att.state = 'idle'
    att.t = 0
    events.push({ type: 'knockdown', who: def.side })
  }
}

// Raakmoment van een stoot: mist, wordt geblokt (chip), of komt vol (en soms zúiver) aan.
function resolvePunch(m: Match, att: Fighter, kind: PunchKind, events: BoksEvent[]): void {
  const spec = PUNCH[kind]
  const def = m.f[att.side === 0 ? 1 : 0]
  if (def.state === 'dodge') { events.push({ type: 'dodge', by: def.side, kind }); return } // ontweken → mist
  const dist = Math.abs(def.x - att.x)
  if (dist > spec.range) return // lucht — de menigte joelt

  const dir = att.side === 0 ? 1 : -1
  let dmg = spec.dmg * (1 + (att.traits.tackle - 3) * TRAIT_DMG)
  dmg *= 1 - (def.traits.tackle - 3) * TRAIT_CHIN // een goeie kin incasseert beter
  if (att.stamina < LOW_STAM) dmg *= 0.6 // moe = armen van beton
  att.ultimate = Math.min(ULT_MAX, att.ultimate + ULT_GAIN_LAND) // rammen vult de meter

  if (def.state === 'block') {
    const through = dmg * spec.block
    def.hp = Math.max(1, def.hp - through)
    def.stamina = Math.max(0, def.stamina - BLOCK_STAM_COST)
    def.ultimate = Math.min(ULT_MAX, def.ultimate + ULT_GAIN_TAKE * 0.5)
    def.x = clamp(def.x + dir * HIT_PUSHBACK * 0.5, RING_MIN_X, RING_MAX_X)
    events.push({ type: 'hit', by: att.side, dmg: Math.round(through), clean: false, blocked: true, kind })
    return
  }

  const clean = Math.random() < CLEAN_BASE + att.traits.shot * CLEAN_PER_SHOT
  if (clean) { dmg *= CLEAN_MULT; att.ultimate = Math.min(ULT_MAX, att.ultimate + ULT_GAIN_CLEAN) }
  def.hp -= dmg
  def.state = 'hit'
  def.t = 0
  def.headKnock = 1
  def.ultimate = Math.min(ULT_MAX, def.ultimate + ULT_GAIN_TAKE) // incasseren vult je eigen meter
  def.x = clamp(def.x + dir * HIT_PUSHBACK, RING_MIN_X, RING_MAX_X)
  att.points += (kind === 'jab' ? 1 : kind === 'hook' ? 2 : 3) + (clean ? 1 : 0)
  events.push({ type: 'hit', by: att.side, dmg: Math.round(dmg), clean, blocked: false, kind })

  // Ultimate schoon binnen = gegarandeerde knock-down; uppercut vloert met een flinke kans.
  const forceDown = kind === 'ultimate' || (kind === 'uppercut' && Math.random() < UPPERCUT_KD)
  if (def.hp <= 0 || forceDown) knockDown(m, att, def, events)
}

// Clinch (anti-dodge): raakt dwars door een dodge én een blok heen. Matige schade, flinke
// terugduw + langere stun. Alleen kort bereik; mis = niks (lange recovery in de state-machine).
function resolveGrab(m: Match, att: Fighter, events: BoksEvent[]): void {
  const def = m.f[att.side === 0 ? 1 : 0]
  const dist = Math.abs(def.x - att.x)
  if (dist > GRAB_RANGE || def.state === 'down') { events.push({ type: 'grab', by: att.side, hit: false }); return }
  const dir = att.side === 0 ? 1 : -1
  let dmg = GRAB_DMG * (1 + (att.traits.tackle - 3) * TRAIT_DMG)
  dmg *= 1 - (def.traits.tackle - 3) * TRAIT_CHIN
  def.hp -= dmg
  def.state = 'hit'
  def.t = -(GRAB_STUN - HIT_STUN) // extra lange stun: begin de hit-timer eerder zodat-ie langer duurt
  def.headKnock = 1
  def.x = clamp(def.x + dir * GRAB_PUSHBACK, RING_MIN_X, RING_MAX_X)
  att.points += 1
  att.ultimate = Math.min(ULT_MAX, att.ultimate + ULT_GAIN_LAND)
  events.push({ type: 'grab', by: att.side, hit: true })
  if (def.hp <= 0) knockDown(m, att, def, events)
}

function startRound(m: Match, events: BoksEvent[]): void {
  m.round += 1
  m.clock = ROUND_TIME
  m.phase = 'fight'
  for (const f of m.f) {
    f.x = f.side === 0 ? 380 : 620
    f.state = 'idle'
    f.t = 0
    f.hp = Math.min(MAX_HP, f.hp + REST_HEAL)
    f.stamina = MAX_STAM
    f.headKnock = 0
  }
  events.push({ type: 'round', round: m.round })
}

export function step(m: Match, inputs: [BoksInput, BoksInput], dt: number): BoksEvent[] {
  const events: BoksEvent[] = []
  if (m.phase === 'over') return events

  // ── Rust in de hoek ──────────────────────────────────────────────────────
  if (m.phase === 'rest') {
    m.restT -= dt
    if (m.restT <= 0) startRound(m, events)
    return events
  }

  // ── De teller: neergeslagen vechter ramt spatie om op te staan ──────────
  if (m.phase === 'count') {
    m.count += dt
    const who = m.down as Side
    const downed = m.f[who]
    const jabEdge = inputs[who].jab && !m.prevJab[who]
    m.prevJab[who] = inputs[who].jab
    m.prevHook[who] = inputs[who].hook
    m.prevUppercut[who] = inputs[who].uppercut
    m.prevUltimate[who] = inputs[who].ultimate
    if (jabEdge) downed.getupMeter += 1
    const need = GETUP_BASE + (downed.knockdowns - 1) * GETUP_PER_KD
    if (downed.getupMeter >= need && m.count < COUNT_MAX) {
      // Hij staat weer! Op karakter — met een deukje.
      downed.hp = Math.max(26, GETUP_HP - (downed.knockdowns - 1) * 8)
      downed.stamina = Math.max(downed.stamina, 55)
      downed.state = 'idle'
      downed.t = 0
      m.phase = 'fight'
      m.down = -1
      events.push({ type: 'getup', who })
    } else if (m.count >= COUNT_MAX) {
      // Uitgeteld: knock-out.
      m.phase = 'over'
      m.winner = (1 - who) as Side
      m.how = 'ko'
      m.f[m.winner].state = 'win'
      events.push({ type: 'end', winner: m.winner, how: 'ko' })
    }
    return events
  }

  // ── De ronde-klok ────────────────────────────────────────────────────────
  m.clock = Math.max(0, m.clock - dt)
  if (m.clock <= 0) {
    const last = m.round >= m.rounds
    events.push({ type: 'bell', round: m.round, last })
    if (last) {
      // Geen KO → de jury beslist op punten.
      m.phase = 'over'
      const [a, b] = m.f
      m.winner = a.points === b.points ? -1 : a.points > b.points ? 0 : 1
      m.how = m.winner === -1 ? 'draw' : 'points'
      if (m.winner !== -1) m.f[m.winner].state = 'win'
      events.push({ type: 'end', winner: m.winner, how: m.how })
    } else {
      m.phase = 'rest'
      m.restT = REST_TIME
      for (const f of m.f) { f.state = 'idle'; f.t = 0 }
    }
    return events
  }

  // ── De vechters ──────────────────────────────────────────────────────────
  for (const f of m.f) {
    const input = inputs[f.side]
    const jabEdge = input.jab && !m.prevJab[f.side]
    const hookEdge = input.hook && !m.prevHook[f.side]
    const uppercutEdge = input.uppercut && !m.prevUppercut[f.side]
    const ultimateEdge = input.ultimate && !m.prevUltimate[f.side]
    const dodgeEdge = input.dodge && !m.prevDodge[f.side]
    const grabEdge = input.grab && !m.prevGrab[f.side]
    m.prevJab[f.side] = input.jab
    m.prevHook[f.side] = input.hook
    m.prevUppercut[f.side] = input.uppercut
    m.prevUltimate[f.side] = input.ultimate
    m.prevDodge[f.side] = input.dodge
    m.prevGrab[f.side] = input.grab

    if (f.headKnock > 0) f.headKnock = Math.max(0, f.headKnock - dt * 3)
    if (f.dodgeCd > 0) f.dodgeCd = Math.max(0, f.dodgeCd - dt)

    const punching = f.state === 'jab' || f.state === 'hook' || f.state === 'uppercut' || f.state === 'ultimate'
    // Stamina-herstel per houding (niet tijdens een stoot/clinch).
    const regen = f.state === 'block' ? STAM_REGEN_BLOCK : Math.abs(input.move) > 0.1 ? STAM_REGEN_MOVE : STAM_REGEN_IDLE
    if (!punching && f.state !== 'dodge' && f.state !== 'grab') f.stamina = Math.min(MAX_STAM, f.stamina + regen * dt)

    if (f.state === 'hit') {
      f.t += dt
      if (f.t >= HIT_STUN) { f.state = 'idle'; f.t = 0 }
      continue
    }
    // Clinch (anti-dodge): korte duw die dwars door dodge/blok raakt.
    if (f.state === 'grab') {
      f.t += dt / speedMul(f)
      if (!f.struck && f.t >= GRAB_WINDUP) {
        f.struck = true
        resolveGrab(m, f, events)
        if (m.phase !== 'fight') return events
      }
      if (f.t >= GRAB_TOTAL) { f.state = 'idle'; f.t = 0 }
      continue
    }
    // Ontwijken: hop naar achteren (weg van de tegenstander) met i-frames.
    if (f.state === 'dodge') {
      f.t += dt
      const away = f.side === 0 ? -1 : 1 // weg van de tegenstander (die aan de andere x-kant staat)
      const prog = f.t / DODGE_TIME
      f.x = clamp(f.x + away * DODGE_STEP * (1 - prog) * dt / DODGE_TIME * 2, RING_MIN_X, RING_MAX_X)
      if (f.t >= DODGE_TIME) { f.state = 'idle'; f.t = 0; f.dodgeCd = DODGE_CD }
      continue
    }
    if (punching) {
      const kind = f.state as PunchKind
      const spec = PUNCH[kind]
      f.t += dt / speedMul(f) // snelle boksers stoten sneller (pace-trait)
      // Ultimate = een storm naar voren: sluit de afstand tot de tegenstander tijdens de uithaal.
      if (kind === 'ultimate') {
        const opp = m.f[f.side === 0 ? 1 : 0]
        const toward = Math.sign(opp.x - f.x) || (f.side === 0 ? 1 : -1)
        f.x = clamp(f.x + toward * ULT_RUSH_SPEED * dt, RING_MIN_X, RING_MAX_X)
      }
      if (!f.struck && f.t >= spec.windup) {
        f.struck = true
        resolvePunch(m, f, kind, events)
        if (m.phase !== 'fight') return events // knockdown/einde → meteen stoppen
      }
      // Combo-cancel: ná het raakmoment mag je de recovery afbreken met een nieuwe stoot → combo's.
      if (f.struck && kind !== 'ultimate') {
        if (uppercutEdge && f.stamina >= UPPERCUT_STAM) { f.state = 'uppercut'; f.t = 0; f.struck = false; f.stamina -= UPPERCUT_STAM; continue }
        if (hookEdge && f.stamina >= HOOK_STAM) { f.state = 'hook'; f.t = 0; f.struck = false; f.stamina -= HOOK_STAM; continue }
        if (jabEdge && f.stamina >= JAB_STAM) { f.state = 'jab'; f.t = 0; f.struck = false; f.stamina -= JAB_STAM; continue }
      }
      if (f.t >= spec.total) { f.state = 'idle'; f.t = 0 }
      continue
    }

    // Dekking op/neer.
    f.state = input.block ? 'block' : 'idle'

    // Ontwijken (W/↑): snappe uitwijk met i-frames — voorrang op stoten, mits niet op cooldown.
    if (dodgeEdge && f.dodgeCd <= 0) {
      f.state = 'dodge'; f.t = 0
      continue
    }

    // Clinch (F): de anti-dodge. Raakt door een dodge/blok heen.
    if (grabEdge && f.stamina >= GRAB_STAM) {
      f.state = 'grab'; f.t = 0; f.struck = false
      f.stamina -= GRAB_STAM
      continue
    }

    // Ultimate (R) heeft voorrang: alleen bij een volle meter → meter leegt, geen stamina-kosten.
    if (ultimateEdge && f.ultimate >= ULT_MAX) {
      f.state = 'ultimate'; f.t = 0; f.struck = false
      f.ultimate = 0
      events.push({ type: 'ultimate', by: f.side })
      continue
    }
    // Stoten (vanuit idle óf blok — het blok zakt dan even).
    if (uppercutEdge && f.stamina >= UPPERCUT_STAM) {
      f.state = 'uppercut'; f.t = 0; f.struck = false
      f.stamina -= UPPERCUT_STAM
      continue
    }
    if (jabEdge && f.stamina >= JAB_STAM) {
      f.state = 'jab'; f.t = 0; f.struck = false
      f.stamina -= JAB_STAM
      continue
    }
    if (hookEdge && f.stamina >= HOOK_STAM) {
      f.state = 'hook'; f.t = 0; f.struck = false
      f.stamina -= HOOK_STAM
      continue
    }

    // Voetenwerk.
    const v = clamp(input.move, -1, 1) * MOVE_SPEED * speedMul(f) * (f.state === 'block' ? BLOCK_MOVE_MULT : 1)
    f.x = clamp(f.x + v * dt, RING_MIN_X, RING_MAX_X)
  }

  // Niet door elkaar heen: houd de minimale afstand aan (duw-en-trek in het midden).
  const [L, R] = m.f
  if (R.x - L.x < FIGHTER_GAP) {
    const mid = (L.x + R.x) / 2
    L.x = clamp(mid - FIGHTER_GAP / 2, RING_MIN_X, RING_MAX_X)
    R.x = clamp(mid + FIGHTER_GAP / 2, RING_MIN_X, RING_MAX_X)
  }

  return events
}
