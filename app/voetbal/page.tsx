import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SoccerClient from './soccer-client'

export const metadata = { title: 'Kopstukken' }

export default async function SoccerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag spelen (geen padel-gate meer).
  if (!user) redirect('/login')

  return <SoccerClient />
}
