import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchaatsClient from './schaats-client'

export const metadata = { title: 'De Elfkoppentocht' }

export default async function SchaatsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag het ijs op (zelfde regel als de andere games).
  if (!user) redirect('/login')

  return <SchaatsClient />
}
