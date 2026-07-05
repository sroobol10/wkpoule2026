'use client'

import { useEffect, useState } from 'react'

// Gedeelde mobiel-helpers voor alle playground-games. Volledig additief: op desktop (fine pointer)
// blijft alles exact zoals het was — deze hook levert dan gewoon isTouch=false en portrait=false,
// en niets rendert of verandert.

export function useLandscapeGate(): { isTouch: boolean; portrait: boolean } {
  const [isTouch, setIsTouch] = useState(false)
  const [portrait, setPortrait] = useState(false)
  useEffect(() => {
    const check = () => {
      const touch = window.matchMedia('(pointer: coarse)').matches
      setIsTouch(touch)
      setPortrait(touch && window.matchMedia('(orientation: portrait)').matches)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])
  return { isTouch, portrait }
}

// "Draai je toestel"-overlay — tonen wanneer een touch-toestel in portret staat.
export function RotateNotice({ game }: { game: string }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-wk-bg/95 px-8 text-center">
      <span className="animate-pulse text-5xl">📱↻</span>
      <h2 className="font-display text-2xl uppercase text-wk-gold">Draai je toestel</h2>
      <p className="max-w-xs text-sm text-wk-soft">{game} speel je liggend (landscape). Draai je telefoon een kwartslag.</p>
    </div>
  )
}

// Live check op een grof aanwijsapparaat (touch/mobiel), bruikbaar in module-level canvas-draws
// zonder hook. De MediaQueryList wordt hergebruikt; .matches blijft actueel. Op de server: false.
let _coarseMql: MediaQueryList | null = null
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false
  if (!_coarseMql) _coarseMql = window.matchMedia('(pointer: coarse)')
  return _coarseMql.matches
}

// Mobiel: ga naar immersive + fullscreen + landscape (best-effort). Op desktop laat dit alles met rust.
export function enterImmersiveIfMobile() {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
  const root = document.querySelector('[data-game-root]') as HTMLElement | null
  root?.setAttribute('data-immersive', 'true')
  root?.requestFullscreen?.().then(() => {
    const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined
    so?.lock?.('landscape').catch(() => {})
  }).catch(() => { /* iOS Safari: in-app immersive volstaat */ })
}
