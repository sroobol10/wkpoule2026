import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'
import { getPadelLeaderboard } from '@/lib/padel-leaderboard'
import FlappyClient from './flappy-client'

export const metadata = { title: 'Flappy Padel · Padel Club' }

export default async function FlappyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  const leaderboard = await getPadelLeaderboard('flappy')
  return <FlappyClient leaderboard={leaderboard} currentUserId={user.id} />
}
