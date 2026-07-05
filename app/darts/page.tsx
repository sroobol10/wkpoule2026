import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DartsClient from './darts-client'

export const metadata = { title: 'Pijlwerk' }

export default async function DartsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag gooien (zelfde regel als de andere games).
  if (!user) redirect('/login')

  return <DartsClient />
}
