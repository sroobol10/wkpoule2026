import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PouleStand } from '../poule-stand'

export default async function PoulePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: poule } = await supabase
    .from('poules')
    .select('id')
    .eq('id', id)
    .single()
  if (!poule) notFound()

  const { data: membership } = await supabase
    .from('poule_members')
    .select('id')
    .eq('poule_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/poules')

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/poules"
          className="inline-flex items-center gap-1 font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.14em] uppercase mb-5 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Terug
        </Link>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Klassement</p>
      </div>

      <PouleStand pouleId={id} currentUserId={user.id} />
    </div>
  )
}
