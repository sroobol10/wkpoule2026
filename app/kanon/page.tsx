import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import KanonClient from './kanon-client'

export const metadata = { title: 'Koppenkanon' }

export default async function KanonPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <KanonClient />
}
