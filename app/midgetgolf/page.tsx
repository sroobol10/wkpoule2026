import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GolfClient from './golf-client'

export const metadata = { title: 'Putjesscheppers' }

export default async function GolfPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag putten (zelfde regel als de andere games).
  if (!user) redirect('/login')

  return <GolfClient />
}
