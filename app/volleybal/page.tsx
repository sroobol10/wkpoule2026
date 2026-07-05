import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VolleyClient from './volley-client'

export const metadata = { title: 'Netwerk' }

export default async function VolleyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Iedere ingelogde poule-deelnemer mag het zand in (zelfde regel als de andere games).
  if (!user) redirect('/login')

  return <VolleyClient />
}
