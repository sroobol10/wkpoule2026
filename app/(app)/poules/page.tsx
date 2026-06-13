import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PouleStand } from './poule-stand'

export default async function PoulesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ league?: string }> }>) {
  const { league } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  type PouleRef = { id: string; name: string; is_general: boolean }
  const { data: memberships } = await supabase
    .from('poule_members')
    .select('poules(id, name, is_general)')
    .eq('user_id', user.id)

  const eigenPoules = ((memberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter(Boolean) as PouleRef[])

  // Vrijwel iedereen zit in precies één privé-league en ziet die direct.
  // Wie in meerdere leagues zit (Pim & Stefan) krijgt een filter.
  const privePoules = eigenPoules
    .filter((p) => !p.is_general)
    .sort((a, b) => a.name.localeCompare(b.name))
  const algemeen = eigenPoules.find((p) => p.is_general)
  const leagues = privePoules.length > 0 ? privePoules : algemeen ? [algemeen] : []

  const selected = privePoules.length > 1 && privePoules.some((p) => p.id === league)
    ? (league as string)
    : null // null = beiden
  const visible = selected ? leagues.filter((p) => p.id === selected) : leagues

  const pillClass = (active: boolean) =>
    `rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
      active
        ? 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
        : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
    }`

  return (
    <div className="space-y-8">
      {/* Header — eyebrow en titel op één regel */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Klassement</h1>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Tussenstand</p>
      </div>

      {/* League-filter — alleen voor leden van meerdere leagues */}
      {privePoules.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {privePoules.map((p) => (
            <Link key={p.id} href={`/poules?league=${p.id}`} className={pillClass(selected === p.id)}>
              {p.name}
            </Link>
          ))}
          <Link href="/poules" className={pillClass(selected === null)}>
            Beiden
          </Link>
        </div>
      )}

      {leagues.length === 0 ? (
        <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center">
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Je zit nog niet in een poule.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {visible.map((p) => (
            <PouleStand key={p.id} pouleId={p.id} currentUserId={user.id} />
          ))}
        </div>
      )}
    </div>
  )
}
