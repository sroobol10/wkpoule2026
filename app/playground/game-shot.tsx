'use client'

import { useState } from 'react'

// Toont het screenshotje van een game bovenaan de kaart. Zolang er nog geen screenshot in
// public/playground/shots/ staat (of als-ie faalt) valt-ie netjes terug op de emoji + accent.
export function GameShot({ src, emoji, accent, alt }: { src: string; emoji: string; accent: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-wk-bg">
      {/* placeholder: altijd aanwezig, ligt achter de screenshot */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(120% 120% at 50% 0%, ${accent}22, transparent 70%)` }}>
        <span className="text-[64px] leading-none opacity-40 transition-transform duration-300 group-hover:scale-110">{emoji}</span>
      </div>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
      )}
    </div>
  )
}
