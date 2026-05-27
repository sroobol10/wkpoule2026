'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconClipboard, IconTrophy, IconQuestion, IconUsers, IconUser, IconShield } from '@/components/icons'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<Readonly<{ className?: string }>>
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/voorspellingen', label: 'Groepsfase', icon: IconClipboard },
  { href: '/knockout',       label: 'Knockout',    icon: IconTrophy },
  { href: '/bonusvragen',    label: 'Bonus',        icon: IconQuestion },
  { href: '/poules',         label: 'Poules',       icon: IconUsers },
  { href: '/profiel',        label: 'Profiel',      icon: IconUser },
  { href: '/admin',          label: 'Admin',        icon: IconShield, adminOnly: true },
]

type Props = Readonly<{ isAdmin: boolean }>

export default function BottomNav({ isAdmin }: Props) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin)

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-wk-bg2 border-t border-white/10 md:hidden">
      <div className="flex h-16">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-mono font-medium tracking-widest uppercase transition-colors ${
                active ? 'text-wk-gold' : 'text-wk-muted'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-wk-gold' : 'text-wk-muted'}`} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
