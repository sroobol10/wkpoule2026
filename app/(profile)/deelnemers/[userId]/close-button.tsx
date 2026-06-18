'use client'

import { useRouter } from 'next/navigation'

// Sluitknop op de deelnemerspagina: terug naar de pagina waar je vandaan kwam
// (meestal het klassement). Valt terug op /poules bij directe navigatie.
export default function CloseButton() {
  const router = useRouter()

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/poules')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClose}
      aria-label="Sluiten"
      className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors cursor-pointer"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}
