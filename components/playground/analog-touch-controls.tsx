'use client'

import { useEffect, useRef } from 'react'

// On-screen besturing voor de PlayerInput-games (voetbal & ijshockey): een drijvende joystick links
// (analoog, 360°) + actieknoppen rechts. Schrijft rechtstreeks in de PlayerInput-instantie via
// getInput() — command() telt het per frame op bij toetsenbord/controller. Eén inputpad; op desktop
// wordt dit component nooit gerenderd, dus daar verandert niets.

// De actie-knoppen komen 1-op-1 overeen met de ActionId-union van lib/soccer én lib/hockey.
export type PadAction = 'kick' | 'sprint' | 'slide' | 'switch' | 'chip' | 'feint'

// Minimale interface — dekt zowel lib/soccer als lib/hockey PlayerInput (duck-typed).
type TouchSink = { setTouchMove: (x: number, y: number) => void; setTouchAction: (a: PadAction, p: boolean) => void }

export type AnalogButton = { action: PadAction; label: string; color?: string; big?: boolean }

export function AnalogTouchControls({ getInput, buttons }: { getInput: () => TouchSink | null; buttons: AnalogButton[] }) {
  const stickWrap = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const stickPointer = useRef<number | null>(null)
  const center = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const wrap = stickWrap.current
    const k = knob.current
    if (!wrap || !k) return
    const R = 56

    const setVec = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy)
      const cl = len > R ? R / len : 1
      k.style.transform = `translate(${dx * cl}px, ${dy * cl}px)`
      getInput()?.setTouchMove(Math.max(-1, Math.min(1, dx / R)), Math.max(-1, Math.min(1, dy / R)))
    }
    const reset = () => {
      k.style.transform = 'translate(0px, 0px)'
      getInput()?.setTouchMove(0, 0)
    }
    const onDown = (e: PointerEvent) => {
      if (stickPointer.current !== null) return
      stickPointer.current = e.pointerId
      const rect = wrap.getBoundingClientRect()
      center.current = { x: e.clientX, y: e.clientY }
      k.style.left = `${e.clientX - rect.left}px`
      k.style.top = `${e.clientY - rect.top}px`
      wrap.setPointerCapture(e.pointerId)
      setVec(0, 0)
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (stickPointer.current !== e.pointerId) return
      setVec(e.clientX - center.current.x, e.clientY - center.current.y)
      e.preventDefault()
    }
    const onUp = (e: PointerEvent) => {
      if (stickPointer.current !== e.pointerId) return
      stickPointer.current = null
      const rect = wrap.getBoundingClientRect()
      k.style.left = `${rect.width / 2}px`
      k.style.top = `${rect.height / 2}px`
      reset()
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
    }
  }, [getInput])

  return (
    <div className="pointer-events-none fixed inset-0 z-[62] select-none" style={{ touchAction: 'none' }}>
      <div
        ref={stickWrap}
        className="pointer-events-auto absolute bottom-4 left-4 h-40 w-40 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"
        style={{ touchAction: 'none' }}
      >
        <div
          ref={knob}
          className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-white/25 shadow-lg"
          style={{ left: '50%', top: '50%' }}
        />
      </div>

      <div className="pointer-events-auto absolute bottom-4 right-4 flex flex-wrap-reverse items-end justify-end gap-2.5" style={{ maxWidth: '58vw', touchAction: 'none' }}>
        {buttons.map((b) => (
          <button
            key={b.action + b.label}
            type="button"
            onPointerDown={(e) => { e.preventDefault(); getInput()?.setTouchAction(b.action, true) }}
            onPointerUp={(e) => { e.preventDefault(); getInput()?.setTouchAction(b.action, false) }}
            onPointerLeave={() => getInput()?.setTouchAction(b.action, false)}
            onPointerCancel={() => getInput()?.setTouchAction(b.action, false)}
            onContextMenu={(e) => e.preventDefault()}
            className={`flex items-center justify-center rounded-full border font-display uppercase tracking-wide text-white/90 active:scale-95 transition-transform ${b.big ? 'h-[76px] w-[76px] text-sm' : 'h-14 w-14 text-[11px]'} ${b.color ?? 'border-white/25 bg-white/10'}`}
            style={{ touchAction: 'none', WebkitUserSelect: 'none' }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}
