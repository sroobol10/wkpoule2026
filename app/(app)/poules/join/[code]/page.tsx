import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { joinPoule } from '@/app/actions/poules'

export default async function JoinPoulePage({
  params,
}: Readonly<{ params: Promise<{ code: string }> }>) {
  const { code } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const result = await joinPoule(code)

  if (result.ok) {
    redirect(`/poules/${result.pouleId}`)
  }

  // Al lid: zoek de poule op en stuur door
  if (result.error === 'Je bent al lid van deze poule.') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (supabase as any)
      .rpc('find_poule_by_invite_code', { invite_code_param: code.trim().toUpperCase() })
    const pouleId = (rows as { id: string }[] | null)?.[0]?.id
    if (pouleId) redirect(`/poules/${pouleId}`)
  }

  // Ongeldige code of andere fout — terug naar poules met foutmelding in URL
  redirect(`/poules?join_error=${encodeURIComponent(result.error)}`)
}
