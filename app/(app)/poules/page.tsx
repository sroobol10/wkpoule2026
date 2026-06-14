import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PouleStand } from './poule-stand'
import { DagOverzicht } from './dag-overzicht'

export default async function PoulesPage() {
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

  // Privé-league(s) eerst, anders de algemene poule. Wie in meerdere leagues
  // zit (Pim & Stefan) ziet ze gewoon onder elkaar — geen filter meer.
  const privePoules = eigenPoules
    .filter((p) => !p.is_general)
    .sort((a, b) => a.name.localeCompare(b.name))
  const algemeen = eigenPoules.find((p) => p.is_general)
  const leagues = privePoules.length > 0 ? privePoules : algemeen ? [algemeen] : []

  return (
    <div className="space-y-8">
      {/* Dagoverzicht — compacte samenvatting van vandaag, per deelnemer */}
      <DagOverzicht userId={user.id} />

      {leagues.length === 0 ? (
        <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center">
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Je zit nog niet in een poule.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {leagues.map((p) => (
            <PouleStand key={p.id} pouleId={p.id} currentUserId={user.id} />
          ))}
        </div>
      )}
    </div>
  )
}
