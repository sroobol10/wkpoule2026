import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'
import { getPadelLeaderboard } from '@/lib/padel-leaderboard'
import WhackClient from './whack-client'

export const metadata = { title: 'Whack-a-flyer · Padel Club' }

export default async function WhackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  const leaderboard = await getPadelLeaderboard('whack')
  return <WhackClient leaderboard={leaderboard} currentUserId={user.id} />
}
