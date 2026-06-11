'use client'

export default function DeelnemerBackground({ avatarUrl }: { avatarUrl: string | null }) {
  if (!avatarUrl) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
      }}
      aria-hidden
    >
      {/* Blurry avatar als full-screen achtergrond */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.05)',
          filter: 'blur(8px) saturate(1.2) brightness(0.6)',
          opacity: 0.8,
        }}
      />
      {/* Donkere overlay — niet te zwaar zodat de kleur zichtbaar blijft */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(11, 14, 20, 0.55)',
        }}
      />
      {/* Vignette randen */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%)',
        }}
      />
    </div>
  )
}
