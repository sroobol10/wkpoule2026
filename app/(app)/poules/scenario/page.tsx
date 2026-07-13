import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePlayerIds } from '@/lib/active-players'
import { koWinnerId, koLoserId } from '@/lib/ko-winner'
import ScenarioClient, {
  type ScenarioData, type ScenarioLeague, type ScenarioMember, type ScenarioTeam,
} from './scenario-client'

export const metadata = { title: 'Wie wint de poule?' }

// Slots van de nog-open KO-rondes waarop gefilterd wordt.
const KO_SLOTS = [101, 102, 103, 104] as const

type PouleRef = { id: string; name: string; is_general: boolean }

export default async function ScenarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Eigen league(s): privé eerst, anders de algemene poule ──────────────────
  const { data: memberships } = await supabase
    .from('poule_members')
    .select('poules(id, name, is_general)')
    .eq('user_id', user.id)
  const mine = ((memberships ?? []).map((m) => m.poules as PouleRef | null).filter(Boolean)) as PouleRef[]
  const prive = mine.filter((p) => !p.is_general).sort((a, b) => a.name.localeCompare(b.name))
  const algemeen = mine.find((p) => p.is_general)
  const leaguesRef = prive.length > 0 ? prive : algemeen ? [algemeen] : []

  if (leaguesRef.length === 0) {
    return (
      <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center">
        <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Je zit nog niet in een poule.</p>
      </div>
    )
  }

  const leagueIds = leaguesRef.map((l) => l.id)

  // Leden per league.
  const { data: memRows } = await supabase
    .from('poule_members')
    .select('poule_id, user_id')
    .in('poule_id', leagueIds)
  const membersByLeague: Record<string, string[]> = {}
  const allIds = new Set<string>()
  for (const r of (memRows ?? []) as { poule_id: string; user_id: string }[]) {
    (membersByLeague[r.poule_id] ??= []).push(r.user_id)
    allIds.add(r.user_id)
  }
  const idArr = [...allIds]

  const activeIds = await getActivePlayerIds(supabase)

  // Profielen + basistotalen.
  const [{ data: profs }, { data: scoreRows }] = await Promise.all([
    idArr.length
      ? supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', idArr)
      : Promise.resolve({ data: [] as { id: string; username: string; full_name: string | null; avatar_url: string | null }[] }),
    idArr.length
      ? supabase.from('poule_scores').select('user_id, total_pts').in('poule_id', leagueIds).in('user_id', idArr)
      : Promise.resolve({ data: [] as { user_id: string; total_pts: number }[] }),
  ])
  const profMap: Record<string, { username: string; full_name: string | null; avatar_url: string | null }> = {}
  for (const p of profs ?? []) profMap[p.id] = p
  const totalByUser: Record<string, number> = {}
  for (const s of (scoreRows ?? []) as { user_id: string; total_pts: number }[]) totalByUser[s.user_id] = s.total_pts

  // KO-wedstrijden 101-104 (halve finales, troostfinale, finale).
  const { data: koMatches } = await supabase
    .from('matches')
    .select('match_number, stage, home_team_id, away_team_id, home_score, away_score, shootout_winner_id, result_entered')
    .in('match_number', [...KO_SLOTS])
  type KoMatch = {
    match_number: number; stage: string
    home_team_id: string | null; away_team_id: string | null
    home_score: number | null; away_score: number | null
    shootout_winner_id: string | null; result_entered: boolean
  }
  const matchBySlot: Record<number, KoMatch> = {}
  for (const m of (koMatches ?? []) as KoMatch[]) matchBySlot[m.match_number] = m

  // Team-info voor de halve-finaledeelnemers (finale/3e-plaats-kandidaten zijn hier subsets van).
  const sfTeamIds = new Set<string>()
  for (const slot of [101, 102]) {
    const m = matchBySlot[slot]
    if (m?.home_team_id) sfTeamIds.add(m.home_team_id)
    if (m?.away_team_id) sfTeamIds.add(m.away_team_id)
  }
  const { data: teamRows } = sfTeamIds.size
    ? await supabase.from('teams').select('id, name, flag_url').in('id', [...sfTeamIds])
    : { data: [] as { id: string; name: string; flag_url: string }[] }
  const teams: Record<string, ScenarioTeam> = {}
  for (const t of teamRows ?? []) teams[t.id] = { id: t.id, name: t.name, flag: t.flag_url }

  // Bracket-picks van alle leden voor de open slots (gepagineerd).
  const picksByUser: Record<string, Record<number, { team: string | null; pts: number }>> = {}
  if (idArr.length) {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('bracket_predictions')
        .select('user_id, slot, predicted_team_id, points_awarded')
        .in('user_id', idArr)
        .in('slot', [...KO_SLOTS])
        .range(from, from + PAGE - 1)
      const rows = (data ?? []) as { user_id: string; slot: number; predicted_team_id: string | null; points_awarded: number | null }[]
      for (const r of rows) {
        (picksByUser[r.user_id] ??= {})[r.slot] = { team: r.predicted_team_id, pts: r.points_awarded ?? 0 }
      }
      if (rows.length < PAGE) break
    }
  }

  // MVP + Topscorer bonusvragen + antwoorden.
  const { data: bqRows } = await supabase
    .from('bonus_questions')
    .select('id, question, answer_options')
    .in('question', ['Beste speler', 'Topscorer'])
  type BQ = { id: string; question: string; answer_options: string[] | null }
  const mvpQ = (bqRows as BQ[] | null)?.find((q) => q.question.toLowerCase().includes('beste speler')) ?? null
  const topQ = (bqRows as BQ[] | null)?.find((q) => q.question.toLowerCase().includes('topscorer')) ?? null
  const bonusIds = [mvpQ?.id, topQ?.id].filter(Boolean) as string[]
  const bonusByUser: Record<string, { mvpA?: string; mvpPts?: number; topA?: string; topPts?: number }> = {}
  if (idArr.length && bonusIds.length) {
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from('bonus_answers')
        .select('user_id, question_id, answer, points_awarded')
        .in('user_id', idArr)
        .in('question_id', bonusIds)
        .range(from, from + PAGE - 1)
      const rows = (data ?? []) as { user_id: string; question_id: string; answer: string | null; points_awarded: number | null }[]
      for (const r of rows) {
        const b = (bonusByUser[r.user_id] ??= {})
        if (r.question_id === mvpQ?.id) { b.mvpA = r.answer ?? undefined; b.mvpPts = r.points_awarded ?? 0 }
        else if (r.question_id === topQ?.id) { b.topA = r.answer ?? undefined; b.topPts = r.points_awarded ?? 0 }
      }
      if (rows.length < PAGE) break
    }
  }

  // ── Payload samenstellen (alleen actieve deelnemers) ───────────────────────
  const members: Record<string, ScenarioMember> = {}
  for (const id of idArr) {
    if (!activeIds.has(id) || !profMap[id]) continue
    const pk = picksByUser[id] ?? {}
    const bn = bonusByUser[id] ?? {}
    members[id] = {
      id,
      username: profMap[id].username,
      fullName: profMap[id].full_name,
      avatarUrl: profMap[id].avatar_url,
      base: totalByUser[id] ?? 0,
      picks: {
        101: pk[101] ?? { team: null, pts: 0 },
        102: pk[102] ?? { team: null, pts: 0 },
        103: pk[103] ?? { team: null, pts: 0 },
        104: pk[104] ?? { team: null, pts: 0 },
      },
      mvpAnswer: bn.mvpA ?? null, mvpPts: bn.mvpPts ?? 0,
      topAnswer: bn.topA ?? null, topPts: bn.topPts ?? 0,
    }
  }

  const leagues: ScenarioLeague[] = leaguesRef.map((l) => ({
    id: l.id,
    name: l.name,
    memberIds: (membersByLeague[l.id] ?? []).filter((id) => members[id]),
  }))

  const sfSlot = (slot: 101 | 102) => {
    const m = matchBySlot[slot]
    if (!m || !m.home_team_id || !m.away_team_id) return null
    return {
      slot,
      home: m.home_team_id,
      away: m.away_team_id,
      actualWinner: m.result_entered ? koWinnerId(m) : null,
      actualLoser: m.result_entered ? koLoserId(m) : null,
    }
  }

  const m103 = matchBySlot[103]
  const m104 = matchBySlot[104]
  const data: ScenarioData = {
    leagues,
    members,
    teams,
    sf1: sfSlot(101),
    sf2: sfSlot(102),
    actualFinalWinner: m104?.result_entered ? koWinnerId(m104) : null,
    actualThirdWinner: m103?.result_entered ? koWinnerId(m103) : null,
    mvp: mvpQ ? { id: mvpQ.id, options: mvpQ.answer_options ?? [] } : null,
    topscorer: topQ ? { id: topQ.id, options: topQ.answer_options ?? [] } : null,
  }

  return <ScenarioClient data={data} currentUserId={user.id} />
}
