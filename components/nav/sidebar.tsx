'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'

type NavItem = {
  href: string
  label: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/voorspellingen', label: 'Voorspellingen' },
  { href: '/knockout',       label: 'Knockout' },
  { href: '/bonusvragen',    label: 'Bonusvragen' },
  { href: '/profiel',        label: 'Profiel' },
  { href: '/admin',          label: 'Admin', adminOnly: true },
]

type Props = Readonly<{ isAdmin: boolean; username: string }>

export default function Sidebar({ isAdmin, username }: Props) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin)

  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-56 flex-col bg-wk-bg2 border-r border-white/10">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-wk-red shrink-0" />
          <span className="font-mono text-xs font-bold tracking-[0.18em] text-wk-text uppercase">
            WK Poule
          </span>
        </div>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase pl-4.5">
          Editie 2026
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(({ href, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between rounded px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/10 text-wk-text'
                  : 'text-wk-muted hover:bg-white/5 hover:text-wk-soft'
              }`}
            >
              {label}
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-wk-gold shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <div className="px-4 py-2 flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-wk-surface border border-white/10 flex items-center justify-center text-xs font-bold text-wk-gold shrink-0 font-mono">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-wk-soft truncate">{username}</span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-left rounded px-4 py-2.5 text-sm font-medium text-wk-muted hover:bg-white/5 hover:text-wk-soft transition-colors"
          >
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  )
}
