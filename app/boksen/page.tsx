import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BoksClient from './boks-client'

export const metadata = { title: 'Knokstukken' }

export default async function BoksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag de ring in (zelfde regel als de andere games).
  if (!user) redirect('/login')

  return <BoksClient />
}
