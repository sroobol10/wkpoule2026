import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import JoinPouleForm from './join-poule-form'

export default async function PoulesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('poule_members')
    .select('poule_id, poules(id, name, invite_code, is_general, creator_id, creator:profiles!creator_id(is_admin))')
    .eq('user_id', user.id)

  type PouleRow = { id: string; name: string; invite_code: string; is_general: boolean; creator_id: string | null; creator: { is_admin: boolean } | null }
  const poules = (memberships ?? [])
    .map((m) => m.poules as PouleRow | null)
    .filter(Boolean) as PouleRow[]

  const pouleIds = poules.map((p) => p.id)
  const { data: memberCounts } = pouleIds.length > 0
    ? await supabase.from('poule_members').select('poule_id').in('poule_id', pouleIds)
    : { data: [] }

  const countMap: Record<string, number> = {}
  for (const m of memberCounts ?? []) countMap[m.poule_id] = (countMap[m.poule_id] ?? 0) + 1

  const general = poules.find((p) => p.is_general)
  const custom = poules.filter((p) => !p.is_general)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Poules &amp; Klassement</p>
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Poules</h1>
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {poules.length} {poules.length === 1 ? 'poule' : 'poules'}
          </p>
        </div>
        <Link
          href="/poules/aanmaken"
          className="flex items-center gap-2 rounded bg-wk-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <span>+</span>{' '}
          Poule aanmaken
        </Link>
      </div>

      {/* Algemene poule */}
      {general && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-2">Algemeen</p>
          <PouleCard poule={general} memberCount={countMap[general.id] ?? 0} isOwner={false} isOfficial={true} />
        </section>
      )}

      {/* Custom poules */}
      {custom.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-2">Jouw poules</p>
          <div className="space-y-3">
            {custom.map((poule) => (
              <PouleCard
                key={poule.id}
                poule={poule}
                memberCount={countMap[poule.id] ?? 0}
                isOwner={poule.creator_id === user.id}
                isOfficial={poule.creator?.is_admin === true}
              />
            ))}
          </div>
        </section>
      )}

      {/* Join */}
      <section>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-2">Deelnemen</p>
        <JoinPouleForm />
      </section>
    </div>
  )
}

function PouleCard({
  poule,
  memberCount,
  isOwner,
  isOfficial,
}: Readonly<{
  poule: { id: string; name: string; invite_code: string; is_general: boolean }
  memberCount: number
  isOwner: boolean
  isOfficial: boolean
}>) {
  return (
    <Link
      href={`/poules/${poule.id}`}
      className="flex items-center gap-4 bg-wk-surface border border-white/10 rounded-xl px-5 py-4 hover:border-wk-gold/30 transition-colors"
    >
      {/* Left accent bar */}
      <div className={`w-1 self-stretch rounded-full shrink-0 ${poule.is_general ? 'bg-wk-blue' : 'bg-wk-green'}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-wk-text truncate">{poule.name}</p>
          {isOwner && (
            <span className="shrink-0 font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest uppercase">
              Eigenaar
            </span>
          )}
          {poule.is_general && (
            <span className="shrink-0 font-mono text-[9px] text-wk-blue border border-wk-blue/30 rounded-full px-2 py-0.5 tracking-widest uppercase">
              Algemeen
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] text-wk-muted mt-0.5 tracking-[0.12em] uppercase">
          {memberCount} {memberCount === 1 ? 'deelnemer' : 'deelnemers'}
          {!poule.is_general && <span className="ml-2 text-wk-soft">#{poule.invite_code}</span>}
        </p>
      </div>
      <svg className="w-4 h-4 text-wk-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
