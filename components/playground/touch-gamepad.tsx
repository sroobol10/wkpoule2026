'use client'

import { useEffect, useRef } from 'react'

// Generieke on-screen besturing voor de keyboard-games. De knoppen/joystick dispatchen
// synthetische KeyboardEvents op window → de bestaande keydown/keyup-logica van elke game
// draait volledig ongewijzigd. Op desktop wordt dit component nooit gerenderd, dus daar
// verandert er niets. Zo blijft precies één inputpad bestaan.

export type PadButton = {
  code: string // KeyboardEvent.code dat we simuleren (bijv. 'Space', 'KeyQ')
  label: string
  color?: string // tailwind border/bg-classes
  big?: boolean
}

// Richtingsmodus: 'lr' = alleen links/rechts (joystick horizontaal), 'full' = 4-weg, 'none' = geen joystick.
type DirMode = 'lr' | 'full' | 'none'

// We dispatchen WASD (niet de pijltjes): elke keyboard-game leest WASD rechtstreeks, dus dit
// werkt overal zonder aannames. De 'lr'-modus laat up/down weg — handig voor games waar W/S
// eigen acties zijn (boksen dodge/blok, volley sprong) die als knop verschijnen.
const DIR_CODE = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }

function press(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
}
function release(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}

export function TouchGamepad({ dir = 'lr', buttons }: { dir?: DirMode; buttons: PadButton[] }) {
  const stickWrap = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)
  const center = useRef({ x: 0, y: 0 })
  const activeDirs = useRef<Set<string>>(new Set())

  // Joystick → richtingstoetsen. We houden bij welke richtingscodes "ingedrukt" zijn en
  // dispatchen alleen de randen (keydown bij intrede, keyup bij verlaten) → geen dubbele events.
  useEffect(() => {
    if (dir === 'none') return
    const wrap = stickWrap.current
    const k = knob.current
    if (!wrap || !k) return
    const R = 52
    const DEAD = 0.4

    const apply = (dx: number, dy: number) => {
      const nx = Math.max(-1, Math.min(1, dx / R))
      const ny = Math.max(-1, Math.min(1, dy / R))
      const want = new Set<string>()
      if (nx < -DEAD) want.add(DIR_CODE.left)
      else if (nx > DEAD) want.add(DIR_CODE.right)
      if (dir === 'full') {
        if (ny < -DEAD) want.add(DIR_CODE.up)
        else if (ny > DEAD) want.add(DIR_CODE.down)
      }
      for (const c of activeDirs.current) if (!want.has(c)) { release(c); activeDirs.current.delete(c) }
      for (const c of want) if (!activeDirs.current.has(c)) { press(c); activeDirs.current.add(c) }
      const len = Math.hypot(dx, dy)
      const cl = len > R ? R / len : 1
      k.style.transform = `translate(${dx * cl}px, ${dir === 'full' ? dy * cl : 0}px)`
    }
    const clear = () => {
      for (const c of activeDirs.current) release(c)
      activeDirs.current.clear()
      k.style.transform = 'translate(0px, 0px)'
    }
    const onDown = (e: PointerEvent) => {
      if (pointerId.current !== null) return
      pointerId.current = e.pointerId
      center.current = { x: e.clientX, y: e.clientY }
      const rect = wrap.getBoundingClientRect()
      k.style.left = `${e.clientX - rect.left}px`
      k.style.top = `${e.clientY - rect.top}px`
      wrap.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return
      apply(e.clientX - center.current.x, e.clientY - center.current.y)
      e.preventDefault()
    }
    const onUp = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return
      pointerId.current = null
      const rect = wrap.getBoundingClientRect()
      k.style.left = `${rect.width / 2}px`
      k.style.top = `${rect.height / 2}px`
      clear()
    }
    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp)
    wrap.addEventListener('pointercancel', onUp)
    return () => {
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('pointercancel', onUp)
      clear()
    }
  }, [dir])

  return (
    <div className="pointer-events-none fixed inset-0 z-[62] select-none" style={{ touchAction: 'none' }}>
      {dir !== 'none' && (
        <div
          ref={stickWrap}
          className="pointer-events-auto absolute bottom-4 left-4 h-36 w-36 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"
          style={{ touchAction: 'none' }}
        >
          <div
            ref={knob}
            className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-white/25 shadow-lg"
            style={{ left: '50%', top: '50%' }}
          />
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-wrap-reverse items-end justify-end gap-2.5" style={{ maxWidth: '58vw', touchAction: 'none' }}>
        {buttons.map((b) => (
          <button
            key={b.code + b.label}
            type="button"
            onPointerDown={(e) => { e.preventDefault(); press(b.code) }}
            onPointerUp={(e) => { e.preventDefault(); release(b.code) }}
            onPointerLeave={() => release(b.code)}
            onPointerCancel={() => release(b.code)}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex items-center justify-center rounded-full border font-display uppercase tracking-wide text-white/90 active:scale-95 transition-transform ${b.big ? 'h-[74px] w-[74px] text-sm' : 'h-14 w-14 text-[11px]'} ${b.color ?? 'border-white/25 bg-white/10'}`}
            style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
