import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/nav/sidebar'
import BottomNav from '@/components/nav/bottom-nav'
import NavProgress from '@/components/nav/nav-progress'

export default async function ProfileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, is_admin')
    .eq('id', user.id)
    .single()

  const username = profile?.username ?? user.email ?? 'Gebruiker'
  const isAdmin = profile?.is_admin ?? false

  return (
    <div className="min-h-screen">
      <NavProgress />
      <Sidebar isAdmin={isAdmin} username={username} />
      <BottomNav isAdmin={isAdmin} />
      <div className="md:pl-56 pb-20 md:pb-0 min-h-screen relative z-10">
        <div className="mx-auto max-w-2xl px-4 md:px-8 py-8">
          {children}
        </div>
      </div>
    </div>
  )
}
