// Vertaalt toetsenbord ÉN controller (Gamepad API) → InputCommand voor de menselijke speler.
// De sim doet zelf de edge-detectie op de knoppen; wij leveren de rauwe (gecombineerde) state.
// Bindings zijn instelbaar (localStorage) — zie DEFAULT_BINDINGS + de instellingen-UI.

import type { InputCommand } from './types'

export type ActionId = 'kick' | 'sprint' | 'slide' | 'switch' | 'chip' | 'feint'
export type DirId = 'up' | 'down' | 'left' | 'right'

// keys = toetsenbord-codes per actie/richting; pad = gamepad-knopindices per actie.
export type Bindings = {
  keys: Record<ActionId | DirId, string[]>
  pad: Record<ActionId, number[]>
}

// Standaard: WASD/pijltjes lopen · Spatie schot · Q sliding (zonder bal) / truc (met bal) ·
// Shift sprint · X wisselen · E voorzet/lange bal · R omhaal (2× met bal = knal). PS5-controller
// (DualSense): ✕ schot · □ sliding/truc · ○ wisselen · △ voorzet · L1 omhaal · R1 sprint · stick/D-pad.
export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    kick: ['Space', 'Enter'], sprint: ['ShiftLeft', 'ShiftRight'], slide: ['KeyQ'],
    switch: ['KeyX', 'ControlLeft', 'ControlRight'], chip: ['KeyE'], feint: ['KeyR'],
  },
  pad: { kick: [0], sprint: [5], slide: [2], switch: [1], chip: [3], feint: [4] },
}

// Vaste split-keyboard schema's voor lokaal 2v2 (2 mensen delen het toetsenbord). Niet-overlappend
// met elkaar. De aanpasbare bindings (Controls-menu) gelden voor de solo/controller-speler.
export const KB_LEFT_BINDINGS: Bindings = {
  keys: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], kick: ['Space'], sprint: ['ShiftLeft'], slide: ['KeyQ'], switch: ['KeyE'], chip: ['KeyR'], feint: ['KeyF'] },
  pad: DEFAULT_BINDINGS.pad,
}
export const KB_RIGHT_BINDINGS: Bindings = {
  keys: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], kick: ['Enter'], sprint: ['ShiftRight'], slide: ['Slash'], switch: ['Period'], chip: ['Comma'], feint: ['Quote'] },
  pad: DEFAULT_BINDINGS.pad,
}

export const ACTION_IDS: ActionId[] = ['kick', 'sprint', 'slide', 'switch', 'chip', 'feint']
const DIR_IDS: DirId[] = ['up', 'down', 'left', 'right']
const DIR_VEC: Record<DirId, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

const STORAGE_KEY = 'kopstukken:controls:v1'
const PAD_DEADZONE = 0.35
const TRIGGER_THRESHOLD = 0.4

export function loadBindings(): Bindings {
  if (typeof window === 'undefined') return DEFAULT_BINDINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_BINDINGS
    const p = JSON.parse(raw) as Partial<Bindings>
    // Merge over de defaults zodat nieuwe acties nooit ontbreken bij een oude opslag.
    return {
      keys: { ...DEFAULT_BINDINGS.keys, ...(p.keys ?? {}) },
      pad: { ...DEFAULT_BINDINGS.pad, ...(p.pad ?? {}) },
    }
  } catch {
    return DEFAULT_BINDINGS
  }
}

export function saveBindings(b: Bindings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b))
  } catch {
    /* opslag geweigerd → bindings blijven alleen deze sessie actief */
  }
}

// Een verbonden gamepad. Zonder index: de eerste verbonden. Met index: precies die (voor
// lokaal 2-spelers → speler 1 = pad 0, speler 2 = pad 1).
export function activeGamepad(index?: number): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
  const pads = navigator.getGamepads()
  if (index != null) { const p = pads[index]; return p && p.connected ? p : null }
  for (const p of pads) if (p && p.connected) return p
  return null
}

// Aantal verbonden gamepads (voor de UI: is 2-controller-modus mogelijk?).
export function connectedGamepadCount(): number {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0
  let n = 0
  for (const p of navigator.getGamepads()) if (p && p.connected) n++
  return n
}

export class PlayerInput {
  private down = new Set<string>()
  private bindings: Bindings
  private padIndex?: number // specifieke controller (lokaal 2-spelers); undefined = eerste verbonden
  private useKeyboard: boolean // false → deze speler leest alleen z'n controller
  // On-screen touch-besturing (mobiel, landscape): virtuele joystick + knoppen schrijven hierin,
  // command() telt ze op bij toetsenbord/controller. Alles blijft één InputCommand.
  private touch = { x: 0, y: 0, kick: false, sprint: false, slide: false, switch: false, chip: false, feint: false }

  constructor(bindings?: Bindings, opts?: { padIndex?: number; keyboard?: boolean }) {
    this.bindings = bindings ?? loadBindings()
    this.padIndex = opts?.padIndex
    this.useKeyboard = opts?.keyboard ?? true
  }
  setBindings(b: Bindings) {
    this.bindings = b
  }
  setTouchMove(x: number, y: number) {
    this.touch.x = x
    this.touch.y = y
  }
  setTouchAction(a: ActionId, pressed: boolean) {
    this.touch[a] = pressed
  }
  clearTouch() {
    this.touch = { x: 0, y: 0, kick: false, sprint: false, slide: false, switch: false, chip: false, feint: false }
  }

  private handled(code: string): boolean {
    for (const arr of Object.values(this.bindings.keys)) if (arr.includes(code)) return true
    return false
  }
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.handled(e.code)) e.preventDefault()
    this.down.add(e.code)
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }
  private reset = () => this.down.clear()

  attach() {
    if (this.useKeyboard) {
      window.addEventListener('keydown', this.onKeyDown)
      window.addEventListener('keyup', this.onKeyUp)
    }
    window.addEventListener('blur', this.reset)
  }
  detach() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.reset)
    this.down.clear()
  }

  private padPressed(gp: Gamepad | null, action: ActionId): boolean {
    if (!gp) return false
    return (this.bindings.pad[action] ?? []).some((i) => {
      const b = gp.buttons[i]
      return !!b && (b.pressed || b.value > TRIGGER_THRESHOLD)
    })
  }

  command(): InputCommand {
    let x = 0
    let y = 0
    // Toetsenbord-richtingen.
    for (const code of this.down) {
      for (const dir of DIR_IDS) {
        if (this.bindings.keys[dir].includes(code)) {
          x += DIR_VEC[dir][0]
          y += DIR_VEC[dir][1]
        }
      }
    }
    // Controller: linkerstick (analoog, 360° + variabele snelheid) + D-pad (digitaal, zoals WASD).
    const gp = activeGamepad(this.padIndex)
    if (gp) {
      // Radiale deadzone: neem de lengte van de stickvector en herschaal 'm vanaf de deadzone-rand
      // naar 0..1. Zo krijg je vloeiend versnellen (zacht duwen = wandelen) i.p.v. een sprong,
      // en geen assen-"snapping" zoals bij een deadzone per as. De sim vertaalt lengte → snelheid.
      const sx = gp.axes[0] ?? 0
      const sy = gp.axes[1] ?? 0
      const mag = Math.hypot(sx, sy)
      if (mag > PAD_DEADZONE) {
        const scaled = Math.min(1, (mag - PAD_DEADZONE) / (1 - PAD_DEADZONE))
        x += (sx / mag) * scaled
        y += (sy / mag) * scaled
      }
      if (gp.buttons[12]?.pressed) y -= 1
      if (gp.buttons[13]?.pressed) y += 1
      if (gp.buttons[14]?.pressed) x -= 1
      if (gp.buttons[15]?.pressed) x += 1
    }
    // On-screen joystick (mobiel): telt mee met toetsenbord/controller.
    x += this.touch.x
    y += this.touch.y
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    const act = (a: ActionId) =>
      this.bindings.keys[a].some((c) => this.down.has(c)) || this.padPressed(gp, a) || this.touch[a]
    return {
      move: { x, y },
      kick: act('kick'),
      sprint: act('sprint'),
      slide: act('slide'),
      switch: act('switch'),
      chip: act('chip'),
      feint: act('feint'),
    }
  }
}

// Alias: de client importeerde de klasse als KeyboardInput.
export { PlayerInput as KeyboardInput }
