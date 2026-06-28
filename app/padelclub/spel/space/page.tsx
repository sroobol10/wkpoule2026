import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'
import { getPadelLeaderboard } from '@/lib/padel-leaderboard'
import SpaceClient from './space-client'

export const metadata = { title: 'Space Strikers · Padel Club' }

export default async function SpacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  const leaderboard = await getPadelLeaderboard('space')
  return <SpaceClient leaderboard={leaderboard} currentUserId={user.id} />
}
