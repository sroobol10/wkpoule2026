'use client'

import { useState } from 'react'

export default function SharePouleButton({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)

  function handleShare() {
    const url = `${window.location.origin}/poules/join/${inviteCode}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors text-wk-muted hover:text-wk-gold border border-white/10 hover:border-wk-gold/30 rounded-full px-3 py-1.5"
    >
      {copied ? (
        <>
          <span className="text-wk-green">✓</span>
          <span className="text-wk-green">Link gekopieerd</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Deel link
        </>
      )}
    </button>
  )
}
