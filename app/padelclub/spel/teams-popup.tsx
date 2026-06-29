'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

// Speelse "Teams-belletje"-popup rechtsonder tijdens elk spel. Verschijnt willekeurig
// (minimaal 10s tussen verschijningen) en blijft hooguit 1 seconde staan. Blokkeert
// het spel niet (pointer-events uit). Speelt een kort Teams-achtig "ba-doop"-geluidje.
export default function TeamsPopup() {
  const [show, setShow] = useState(false)
  const audio = useRef<AudioContext | null>(null)

  // Kort, vriendelijk twee-tonen notificatiegeluidje (synth — geen asset/auteursrecht)
  const playChime = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx = audio.current ?? (audio.current = new Ctx())
      if (ctx.state === 'suspended') void ctx.resume()
      const t0 = ctx.currentTime
      const tone = (freq: number, start: number, dur: number, peak = 0.12) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.type = 'triangle'; o.frequency.value = freq
        o.connect(g); g.connect(ctx.destination)
        g.gain.setValueAtTime(0.0001, t0 + start)
        g.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur)
        o.start(t0 + start); o.stop(t0 + start + dur + 0.03)
      }
      tone(660, 0, 0.18)       // eerste tik
      tone(988, 0.11, 0.34)    // hogere tweede toon → "ba-doop"
    } catch { /* geluid is optioneel */ }
  }

  useEffect(() => {
    let alive = true
    let showT: ReturnType<typeof setTimeout>
    let hideT: ReturnType<typeof setTimeout>
    const cycle = () => {
      const delay = 10000 + Math.random() * 18000 // 10–28s tussen belletjes (max 1x/10s)
      showT = setTimeout(() => {
        if (!alive) return
        setShow(true)
        playChime()
        hideT = setTimeout(() => { if (alive) { setShow(false); cycle() } }, 1000) // max 1s zichtbaar
      }, delay)
    }
    cycle()
    return () => { alive = false; clearTimeout(showT); clearTimeout(hideT); void audio.current?.close() }
  }, [])

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed bottom-4 right-4 z-[70] w-40 sm:w-48 rounded-xl overflow-hidden border border-white/15 shadow-2xl bg-wk-surface transition-all duration-300 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <Image src="/evenbellen.jpeg" alt="" width={289} height={134} className="w-full h-auto" />
    </div>
  )
}
