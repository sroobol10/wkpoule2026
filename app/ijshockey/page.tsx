import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HockeyClient from './hockey-client'

export const metadata = { title: 'Puckstukken' }

export default async function HockeyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag spelen (zelfde regel als /voetbal).
  if (!user) redirect('/login')

  return <HockeyClient />
}
