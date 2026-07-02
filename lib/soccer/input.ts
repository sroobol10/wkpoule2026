// Vertaalt toetsenbord → InputCommand voor de menselijke speler.
// De sim doet zelf de edge-detectie op `kick`; wij leveren de rauwe state.
//
// Besturing: WASD/pijltjes = lopen · Spatie = schieten/pass (power) · Q = sliding
//            Shift = sprint · X = wisselen · E = stift/lob-pass · R = schijnbeweging/kap.

import type { InputCommand } from './types'

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
}
const KICK_KEYS = new Set(['Space', 'Enter'])
const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight'])
const SLIDE_KEYS = new Set(['KeyQ'])
const SWITCH_KEYS = new Set(['KeyX', 'ControlLeft', 'ControlRight'])
const CHIP_KEYS = new Set(['KeyE']) // stift / lofte pass
const FEINT_KEYS = new Set(['KeyR']) // schijnbeweging / kap
const HANDLED = new Set([...Object.keys(MOVE_KEYS), ...KICK_KEYS, ...SPRINT_KEYS, ...SLIDE_KEYS, ...SWITCH_KEYS, ...CHIP_KEYS, ...FEINT_KEYS])

export class KeyboardInput {
  private down = new Set<string>()
  private onKeyDown = (e: KeyboardEvent) => {
    if (HANDLED.has(e.code)) e.preventDefault()
    this.down.add(e.code)
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }
  private reset = () => this.down.clear()

  attach() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.reset)
  }
  detach() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.reset)
    this.down.clear()
  }

  private any(keys: Set<string>): boolean {
    for (const k of keys) if (this.down.has(k)) return true
    return false
  }

  command(): InputCommand {
    let x = 0
    let y = 0
    for (const code of this.down) {
      const m = MOVE_KEYS[code]
      if (m) {
        x += m[0]
        y += m[1]
      }
    }
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    return {
      move: { x, y },
      kick: this.any(KICK_KEYS),
      sprint: this.any(SPRINT_KEYS),
      slide: this.any(SLIDE_KEYS),
      switch: this.any(SWITCH_KEYS),
      chip: this.any(CHIP_KEYS),
      feint: this.any(FEINT_KEYS),
    }
  }
}
