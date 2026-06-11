'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'

// Alleen op de detailpagina van de Ennovate-poule wisselt de hero
const ENNOVATE_POULE_PATH = '/poules/14ccff59-b97a-41d9-9856-5c6413cd2c05'

// Client component zodat de hero per route kan wisselen (layout is server-side
// en kent het pad niet). `pouleSrc` overschrijft de hero op de Ennovate-poulepagina.
export default function HeroImage({
  src,
  pouleSrc,
  alt,
}: {
  src: string
  pouleSrc: string | null
  alt: string
}) {
  const pathname = usePathname()
  const finalSrc = pouleSrc && pathname.startsWith(ENNOVATE_POULE_PATH) ? pouleSrc : src

  // key zorgt voor remount bij beeldwissel → fade-in speelt opnieuw af
  return (
    <Image
      key={finalSrc}
      src={finalSrc}
      alt={alt}
      fill
      className="object-cover object-center animate-hero-in"
      priority
    />
  )
}
