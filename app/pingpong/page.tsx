import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PongClient from './pong-client'

export const metadata = { title: 'Tafelkoppen' }

export default async function PongPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag aan tafel (zelfde regel als de andere games).
  if (!user) redirect('/login')

  return <PongClient />
}
