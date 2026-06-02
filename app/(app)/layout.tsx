import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/nav/sidebar'
import BottomNav from '@/components/nav/bottom-nav'
import NavProgress from '@/components/nav/nav-progress'

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, is_admin')
    .eq('id', user.id)
    .single()

  const username = profile?.username ?? user.email ?? 'Gebruiker'
  const isAdmin  = profile?.is_admin ?? false

  return (
    <div className="min-h-screen bg-wk-bg">
      <NavProgress />
      <Sidebar isAdmin={isAdmin} username={username} />
      <BottomNav isAdmin={isAdmin} />

      <div className="md:pl-56 pb-20 md:pb-0 min-h-screen">
        {/* Header banner */}
        <div className="relative h-40 md:h-80 w-full overflow-hidden">
          <Image
            src="/worldcup.jpeg"
            alt="WK 2026"
            fill
            className="object-cover object-center"
            priority
          />
          {/* Deck-style gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/85" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/40" />

          {/* Top chrome — mono label style from deck */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 md:px-8 pt-5">
            <div className="flex items-center gap-3">
              <span className="bg-wk-red text-white font-mono font-bold text-[11px] tracking-[0.2em] uppercase px-2.5 py-1 rounded">
                WK&nbsp;Poule
              </span>
              <span className="text-white/50 font-mono text-[11px] tracking-[0.16em] uppercase hidden sm:block">
                Editie 2026
              </span>
            </div>
            <span className="text-white/40 font-mono text-[11px] tracking-[0.16em] uppercase hidden sm:block">
              NL · Vrienden &amp; Familie
            </span>
          </div>

          {/* Bottom title block */}
          <div className="absolute bottom-0 left-0 px-6 md:px-8 pb-5 md:pb-6">
            <p className="font-display text-3xl md:text-5xl text-white uppercase leading-none tracking-tight drop-shadow-lg">
              De <span className="text-wk-gold">Poule</span>
            </p>
            <p className="font-mono text-white/50 text-[10px] tracking-[0.18em] uppercase mt-1.5">
              Voorspel · Volgen · Winnen
            </p>
          </div>
        </div>

        {/* Page content */}
        <div className="mx-auto max-w-400 px-4 md:px-8 py-6 md:py-8 animate-fade-up">
          {children}
        </div>
      </div>
    </div>
  )
}
