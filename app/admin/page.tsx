import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AdminClient from './admin-client'

const KNOCKOUT_STAGES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, username')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/voorspellingen')

  const { data: matches } = await supabase
    .from('matches')
    .select('id, stage, kickoff_at, match_number, home_team_id, away_team_id, home_score, away_score, result_entered')
    .in('stage', ['group', ...KNOCKOUT_STAGES])
    .order('kickoff_at', { ascending: true })

  const teamIds = new Set<string>()
  for (const m of matches ?? []) {
    if (m.home_team_id) teamIds.add(m.home_team_id)
    if (m.away_team_id) teamIds.add(m.away_team_id)
  }
  const { data: teams } = teamIds.size > 0
    ? await supabase.from('teams').select('id, name, code, flag_url, group_name').in('id', [...teamIds])
    : { data: [] }

  const { data: questions } = await supabase
    .from('bonus_questions')
    .select('id, question, type, correct_answer, correct_answer_set')
    .order('type', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-wk-bg">
      {/* Admin header */}
      <header className="sticky top-0 z-50 bg-wk-bg2 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-wk-red shrink-0" />
            <span className="font-mono text-xs font-bold tracking-[0.18em] text-wk-text uppercase">Admin</span>
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase hidden sm:block">· WK Poule 2026</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em] hidden sm:block">{profile.username}</span>
            <Link
              href="/voorspellingen"
              className="font-mono text-[10px] text-wk-muted hover:text-wk-soft tracking-[0.14em] uppercase transition-colors border border-white/10 rounded-full px-3 py-1"
            >
              ← App
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Page title */}
        <div className="mb-8">
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Beheer</p>
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Beheerder</h1>
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            Uitslagen invoeren · Bonusvragen beheren
          </p>
        </div>

        <AdminClient
          matches={matches ?? []}
          teams={teams ?? []}
          questions={questions ?? []}
        />
      </main>
    </div>
  )
}
