'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function NavProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const prev = useRef(pathname)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (prev.current !== pathname) {
      // Nieuwe pagina geladen — verberg balk
      prev.current = pathname
      setVisible(false)
    }
  }, [pathname])

  useEffect(() => {
    const onStart = () => {
      if (timer.current) clearTimeout(timer.current)
      setVisible(true)
      // Veiligheidsnet: verberg altijd na 3s
      timer.current = setTimeout(() => setVisible(false), 3000)
    }
    window.addEventListener('beforeunload', onStart)
    return () => {
      window.removeEventListener('beforeunload', onStart)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 overflow-hidden pointer-events-none">
      <div className="h-full bg-wk-red animate-loading-bar" />
    </div>
  )
}
