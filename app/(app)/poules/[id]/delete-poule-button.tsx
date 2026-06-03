'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deletePoule } from '@/app/actions/poules'

export default function DeletePouleButton({ pouleId }: { pouleId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    if (!confirm) { setConfirm(true); return }
    startTransition(async () => {
      const result = await deletePoule(pouleId)
      if (result.ok) router.push('/poules')
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className={`font-mono text-[10px] tracking-[0.12em] uppercase transition-colors disabled:opacity-50 ${
        confirm
          ? 'text-wk-red hover:text-wk-red'
          : 'text-wk-muted hover:text-wk-red'
      }`}
    >
      {isPending ? '…' : confirm ? 'Weet je het zeker? Klik nogmaals.' : 'Poule verwijderen'}
    </button>
  )
}
