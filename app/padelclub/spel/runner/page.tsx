import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPadelUser } from '@/lib/padel'
import { getPadelLeaderboard } from '@/lib/padel-leaderboard'
import RunnerClient from './runner-client'

export const metadata = { title: 'Sunny Sprint · Padel Club' }

export default async function RunnerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  const leaderboard = await getPadelLeaderboard('runner')
  return <RunnerClient leaderboard={leaderboard} currentUserId={user.id} />
}
