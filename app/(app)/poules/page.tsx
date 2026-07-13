import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PouleStand } from './poule-stand'
import { DagOverzicht } from './dag-overzicht'
import { isPadelUser } from '@/lib/padel'

export default async function PoulesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Padel Club: alleen zichtbaar voor de vier leden
  const { data: meProfile } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  const isPadelMember = isPadelUser(meProfile?.username)

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
      {/* Padel Club — exclusieve takeover voor de vier leden */}
      {isPadelMember && (
        <Link
          href="/padelclub"
          className="group flex items-center gap-3 rounded-xl border border-wk-gold/30 bg-gradient-to-r from-wk-gold/10 via-wk-green/10 to-wk-blue/10 px-5 py-3.5 transition-colors hover:border-wk-gold/60"
        >
          <span className="text-2xl">🎾</span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg uppercase leading-none bg-gradient-to-r from-wk-gold via-wk-green to-wk-blue bg-clip-text text-transparent">
              Padel Club
            </p>
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mt-0.5">De onderlinge strijd</p>
          </div>
          <span className="font-mono text-xs text-wk-gold tracking-[0.14em] uppercase group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      )}

      {/* Dagoverzicht — compacte samenvatting van vandaag, per deelnemer */}
      <DagOverzicht userId={user.id} />

      {/* Scenario — filter op de resterende uitslagen en zie je eindstand */}
      <Link
        href="/poules/scenario"
        className="group flex items-center gap-3 rounded-xl border border-wk-blue/30 bg-gradient-to-r from-wk-blue/10 via-wk-gold/10 to-wk-green/10 px-5 py-3.5 transition-colors hover:border-wk-blue/60"
      >
        <span className="text-2xl">🔮</span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg uppercase leading-none bg-gradient-to-r from-wk-blue via-wk-gold to-wk-green bg-clip-text text-transparent">
            Wie wint de poule?
          </p>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase mt-0.5">Speel de halve finales, finale, 3e plaats, MVP &amp; topscorer</p>
        </div>
        <span className="font-mono text-xs text-wk-blue tracking-[0.14em] uppercase group-hover:translate-x-0.5 transition-transform">→</span>
      </Link>

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
