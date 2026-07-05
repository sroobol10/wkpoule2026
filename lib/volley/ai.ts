// Computer-strandspelers: de achterspeler vangt de landing op, de netspeler loert op
// de smash. Moeilijkheid schaalt loopsnelheid, timing en smash-lust.

import { FLOOR, NET_TOP, NET_X, predictLandingX, REACH, W, type VInput, type VState } from './sim'

const FLOOR_APPROACH = FLOOR - 200 // bal daalt richting de vloer → tijd om te duiken

export function aiInput(s: VState, id: number, difficulty: number): VInput {
  const diff = Math.max(0, Math.min(1, difficulty))
  const me = s.players[id]
  const idle: VInput = { moveX: 0, jump: false, hit: false, dink: false, dive: false, block: false }
  if (!s.live) return idle
  const b = s.ball
  const onOurSide = (b.x < NET_X) === (me.team === 0)
  const isFront = me.id === 1 || me.id === 2 // dichtst bij het net
  const speedF = 0.44 + 0.5 * diff // op makkelijk traag → haalt lang niet elke bal

  const moveTo = (tx: number): VInput => {
    const d = tx - me.x
    return { ...idle, moveX: Math.abs(d) < 8 ? 0 : Math.sign(d) * speedF }
  }

  const cx = me.x
  const cy = me.y - 46
  const inReach = Math.hypot(b.x - cx, b.y - cy) < REACH + 8

  if (onOurSide || (b.vx > 0) === (me.team === 1)) {
    // Bal (komt) op onze helft.
    const land = predictLandingX(b)
    const landOurs = (land < NET_X) === (me.team === 0)
    if (isFront) {
      // Netspeler: springen en meppen zodra de set hoog bij het net hangt.
      const nearNet = Math.abs(b.x - NET_X) < 170 && (b.x < NET_X) === (me.team === 0)
      if (nearNet && b.y < NET_TOP + 120 && b.vy > -60) {
        // Smashen is een gevorderde move: pas vanaf 'Normaal' springt de netspeler ervoor.
        const canSmash = diff >= 0.45
        const jumpNow = canSmash && Math.abs(b.x - me.x) < 70 && b.y < me.y - 60
        const hitNow = inReach && Math.random() < 0.1 + 0.45 * diff
        return { ...idle, moveX: Math.sign(b.x - me.x) * speedF, jump: jumpNow, hit: hitNow }
      }
      const post = me.team === 0 ? NET_X - 110 : NET_X + 110
      if (landOurs && Math.abs(land - post) < 150 && s.touches < 2) return { ...moveTo(land), hit: inReach && b.vy > 40 && Math.random() < 0.16 + 0.5 * diff }
      return moveTo(post)
    }
    // Achterspeler: onder de landing gaan staan en 'm omhoog bumpen — of duiken als-ie net te ver is.
    if (landOurs) {
      const m = moveTo(land)
      const far = Math.abs(land - me.x) > REACH + 20 && Math.abs(land - me.x) < REACH + 110
      if (far && b.y > FLOOR_APPROACH && Math.random() < 0.015 + 0.05 * diff) return { ...m, dive: true }
      const hitNow = inReach && b.vy > 30 && Math.random() < 0.14 + 0.5 * diff
      return { ...m, hit: hitNow }
    }
    return moveTo(me.team === 0 ? 220 : W - 220)
  }

  // Bal bij de tegenstander: terug naar de basis.
  return moveTo(isFront ? (me.team === 0 ? NET_X - 120 : NET_X + 120) : me.team === 0 ? 210 : W - 210)
}
