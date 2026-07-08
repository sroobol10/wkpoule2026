// Computer-strandspeler (1v1): één poppetje dat z'n hele helft dekt. Loopt onder de voorspelde
// landing, bumpt 'm terug, springt-en-smasht als de bal hoog bij het net hangt, en duikt als-ie
// net te ver ligt. Alles schaalt met de moeilijkheid — op makkelijk traag, onnauwkeurig en zelden
// een smash, zodat je als mens gewoon punten kunt maken.

import { FLOOR, NET_TOP, NET_X, predictLandingX, REACH, W, type VInput, type VState } from './sim'

const FLOOR_APPROACH = FLOOR - 190 // bal daalt richting de vloer → tijd om te duiken/slaan

export function aiInput(s: VState, id: number, difficulty: number): VInput {
  const diff = Math.max(0, Math.min(1, difficulty))
  const me = s.players[id]
  const idle: VInput = { moveX: 0, jump: false, hit: false, dink: false, dive: false, block: false }
  if (!s.live) return idle
  const b = s.ball
  const speedF = 0.34 + 0.52 * diff // op makkelijk loopt-ie duidelijk trager → je speelt 'm voorbij
  const home = me.team === 0 ? W * 0.28 : W * 0.72

  const moveTo = (tx: number): VInput => {
    const d = tx - me.x
    return { ...idle, moveX: Math.abs(d) < 10 ? 0 : Math.sign(d) * speedF }
  }

  const cx = me.x
  const cy = me.y - 46
  const inReach = Math.hypot(b.x - cx, b.y - cy) < REACH + 6

  const ballComing = (b.x < NET_X) === (me.team === 0) || (b.vx > 0) === (me.team === 1)
  if (!ballComing) return moveTo(home) // bal bij de tegenstander → terug naar het midden van je helft

  // Positie-doel = voorspelde landing, met een moeilijkheids-afhankelijke mikfout (op makkelijk
  // staat-ie er vaak nét naast → punt voor jou). Stabiel-ish, geen per-frame getril.
  const land = predictLandingX(b)
  const err = (1 - diff) * 155 * (((id * 37 + Math.round(b.x)) % 7) / 3 - 1)
  const target = land + err
  const m = moveTo(target)

  // Smash: alleen als de bal hoog bij het net hangt én we eronder staan. Zeldzaam op makkelijk.
  const nearNet = Math.abs(b.x - NET_X) < 150 && (b.x < NET_X) === (me.team === 0)
  if (nearNet && b.y < NET_TOP + 60 && b.vy > -40 && diff > 0.35) {
    const jumpNow = Math.abs(b.x - me.x) < 60 && b.y < me.y - 40 && Math.random() < 0.4 + 0.5 * diff
    const hitNow = inReach && b.y < me.y - 30
    if (jumpNow || hitNow) return { ...idle, moveX: Math.sign(b.x - me.x) * speedF, jump: jumpNow, hit: hitNow }
  }

  // Duiken als de landing net buiten loopbereik ligt (redt anders het punt niet).
  const gap = Math.abs(target - me.x)
  if (b.y > FLOOR_APPROACH && gap > REACH + 24 && gap < REACH + 130 && Math.random() < 0.02 + 0.06 * diff) {
    return { ...m, dive: true }
  }

  // Bumpen: sla pas als de bal echt binnen bereik is en daalt — met een trefkans die met de
  // moeilijkheid meeschaalt (op makkelijk mist-ie 'm regelmatig → punt voor jou).
  if (inReach && b.vy > 20) {
    if (Math.random() < 0.06 + 0.6 * diff) return { ...m, hit: true }
  }
  return m
}
