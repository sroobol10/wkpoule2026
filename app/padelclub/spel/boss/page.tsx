import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'
import { getPadelLeaderboard } from '@/lib/padel-leaderboard'
import BossClient from './boss-client'

export const metadata = { title: 'Boss Rush · Padel Club' }

export default async function BossPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  const leaderboard = await getPadelLeaderboard('boss')
  return <BossClient leaderboard={leaderboard} currentUserId={user.id} />
}
