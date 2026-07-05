'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * "Groot scherm"-knop. Werkt overal (ook iPhone Safari, dat de native
 * Fullscreen API mist): we togglen `data-immersive` op de dichtstbijzijnde
 * [data-game-root] en regelen de fullscreen-layout via CSS. Waar de echte
 * Fullscreen API wél bestaat (Android/desktop/iPad) vragen we die er als bonus bij.
 */
export default function ImmersiveToggle() {
  const btn = useRef<HTMLButtonElement>(null)
  const [on, setOn] = useState(false)

  const root = () => btn.current?.closest('[data-game-root]') as HTMLElement | null

  const apply = (v: boolean) => {
    root()?.setAttribute('data-immersive', v ? 'true' : 'false')
    setOn(v)
  }

  const toggle = async () => {
    const next = !on
    apply(next)
    try {
      const el = root()
      if (next) await el?.requestFullscreen?.()
      else if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* iPhone Safari e.d.: de in-app modus volstaat */
    }
  }

  // Esc / swipe-out uit native fullscreen → ook onze in-app modus uitzetten
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement && on) apply(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [on])

  // Bij verlaten van de pagina netjes opruimen
  useEffect(() => () => {
    root()?.setAttribute('data-immersive', 'false')
    if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])

  return (
    <button
      ref={btn}
      type="button"
      onClick={toggle}
      aria-label={on ? 'Verlaat groot scherm' : 'Groot scherm'}
      className="fixed top-4 right-16 z-[61] flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
    >
      {on ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m7 5l5 5m0 0v-4m0 4h-4M9 15l-5 5m0 0v-4m0 4h4m7-11l5-5m0 0v4m0-4h-4" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      )}
    </button>
  )
}
