import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import AdminClient from './admin-client'

const KNOCKOUT_STAGES = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']

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
    .select('id, question, description, type, unlock_date, correct_answer, correct_answer_set, answer_type, answer_options')
    .order('type', { ascending: true })
    .order('created_at', { ascending: true })

  // Bestaande kaartdata per wedstrijd
  const matchIds = (matches ?? []).map((m) => m.id)
  const { data: cards } = matchIds.length > 0
    ? await supabase
        .from('match_cards')
        .select('match_id, team_id, yellow_cards, red_cards')
        .in('match_id', matchIds)
    : { data: [] }

  // Gegroepeerd per wedstrijd
  type CardRow = { match_id: string; team_id: string; yellow_cards: number; red_cards: number }
  const cardsByMatch: Record<string, CardRow[]> = {}
  for (const c of cards ?? []) {
    if (!cardsByMatch[c.match_id]) cardsByMatch[c.match_id] = []
    cardsByMatch[c.match_id].push(c)
  }

  // ── Deelnemers-overzicht ───────────────────────────────────────────────────
  // Service client om RLS te omzeilen zodat admin ALLE poules en leden ziet
  const serviceClient = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = serviceClient as any
  const { data: allPouleRows } = await sc.from('poules').select('id, name, is_general')
  const { data: memberRows }   = await sc.from('poule_members').select('user_id, poule_id')

  const memberUserIds = [...new Set(((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id))]

  // Poule-filter data: unieke poules + per user welke poules
  type PouleRef = { id: string; name: string; isGeneral: boolean }
  const poulesMap: Record<string, PouleRef> = {}
  for (const p of (allPouleRows ?? []) as { id: string; name: string; is_general: boolean }[]) {
    poulesMap[p.id] = { id: p.id, name: p.name, isGeneral: p.is_general }
  }
  const userPouleIds: Record<string, string[]> = {}
  for (const row of (memberRows ?? []) as { user_id: string; poule_id: string }[]) {
    userPouleIds[row.user_id] ??= []
    if (!userPouleIds[row.user_id].includes(row.poule_id)) userPouleIds[row.user_id].push(row.poule_id)
  }
  const allPoules = Object.values(poulesMap)
    .filter((p) => !p.isGeneral)
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: profileRows } = memberUserIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', memberUserIds)
        .order('username')
    : { data: [] }

  type ProfileRef = { id: string; username: string; avatar_url: string | null }
  const uniqueUsers: Record<string, ProfileRef> = {}
  for (const p of profileRows ?? []) {
    uniqueUsers[p.id] = p
  }

  const allUserIds = Object.keys(uniqueUsers)
  const groupMatchIds = (matches ?? []).filter((m) => m.stage === 'group').map((m) => m.id)

  // Chunked .in() queries: max 20 user-IDs per request → URL blijft kort (~740 chars).
  // Voorkomt zowel URL-lengte issues als call-stack problemen van 200 parallelle requests.
  async function countPerUser(table: string, userIds: string[], rowLimit = 1000): Promise<Record<string, number>> {
    if (userIds.length === 0) return {}
    const CHUNK = 10  // 10 users × max 72 rows = 720 < PostgREST default max_rows (1000)
    const chunks: string[][] = []
    for (let i = 0; i < userIds.length; i += CHUNK) chunks.push(userIds.slice(i, i + CHUNK))
    const results = await Promise.all(
      chunks.map((chunk) => sc.from(table).select('user_id').in('user_id', chunk).limit(rowLimit))
    )
    const map: Record<string, number> = {}
    for (const { data } of results)
      for (const row of (data ?? []) as { user_id: string }[])
        map[row.user_id] = (map[row.user_id] ?? 0) + 1
    return map
  }

  const [predCountMap, jokerCountMap, bracketCountMap, bonusCountMap] = await Promise.all([
    countPerUser('predictions',        allUserIds),
    countPerUser('jokers',             allUserIds),
    countPerUser('bracket_predictions',allUserIds),
    countPerUser('bonus_answers',      allUserIds),
  ])

  const totalGroupMatches = groupMatchIds.length
  const totalBonusQuestions = (questions ?? []).filter((q) => q.type === 'pre_tournament').length

  // Emails ophalen via service role (auth.users is niet toegankelijk via reguliere client)
  const { data: { users: authUsers } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 })
  const emailMap: Record<string, string> = {}
  for (const u of authUsers ?? []) {
    if (u.email) emailMap[u.id] = u.email
  }

  const participants = Object.values(uniqueUsers).map((p) => ({
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url ?? null,
    email: emailMap[p.id] ?? '',
    pouleIds: userPouleIds[p.id] ?? [],
    predictions: predCountMap[p.id] ?? 0,
    jokers: jokerCountMap[p.id] ?? 0,
    bracketPicks: bracketCountMap[p.id] ?? 0,
    bonusAnswers: bonusCountMap[p.id] ?? 0,
  }))

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
          cardsByMatch={cardsByMatch}
          participants={participants}
          allPoules={allPoules}
          totalGroupMatches={totalGroupMatches}
          totalBonusQuestions={totalBonusQuestions}
        />
      </main>
    </div>
  )
}
