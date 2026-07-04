import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { preBonusIndex } from '@/lib/bonus-order'
import { computeAliveTeamIds, type AliveGroupMatch, type AliveKoMatch } from '@/lib/alive-teams'
import ProfielClient from './profiel-client'
import type { PuntenDetail } from './punten-overzicht'

export default async function ProfielPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, email, avatar_url, created_at, theme')
    .eq('id', user.id)
    .single()

  const { data: generalPoule } = await supabase
    .from('poules')
    .select('id')
    .eq('is_general', true)
    .single()

  const { data: score } = generalPoule
    ? await supabase
        .from('poule_scores')
        .select('total_pts, exact_hits, correct_results, group_match_pts, group_standings_pts, knockout_pts, bonus_pre_pts, bonus_daily_pts, jokers_played')
        .eq('poule_id', generalPoule.id)
        .eq('user_id', user.id)
        .single()
    : { data: null }

  // Rang + totaal deelnemers + nauwkeurigheidsdata (parallel)
  const [
    { count: above },
    { count: pouleTotal },
    { data: scoredPreds },
    { data: scoredBracket },
    { count: predCount },
    { count: bonusCount },
  ] = await Promise.all([
    generalPoule && score
      ? supabase.from('poule_scores').select('user_id', { count: 'exact', head: true })
          .eq('poule_id', generalPoule.id).gt('total_pts', score.total_pts)
      : Promise.resolve({ count: null }),
    generalPoule
      ? supabase.from('poule_scores').select('user_id', { count: 'exact', head: true })
          .eq('poule_id', generalPoule.id)
      : Promise.resolve({ count: null }),
    supabase.from('predictions')
      .select('predicted_home, predicted_away, match:matches!predictions_match_id_fkey(home_score, away_score, result_entered)')
      .eq('user_id', user.id).not('points_awarded', 'is', null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('bracket_predictions').select('points_awarded')
      .eq('user_id', user.id).not('points_awarded', 'is', null),
    supabase.from('predictions').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase.from('bonus_answers').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const rank = generalPoule && score ? (above ?? 0) + 1 : null
  const pouleDeelnemers = pouleTotal ?? 0

  // Wedstrijd-nauwkeurigheid — vergelijk voorspelling met de echte uitslag.
  // Niet op points_awarded classificeren: een joker verdubbelt de punten,
  // waardoor puntwaarden niet meer 1-op-1 aan exact/richting te koppelen zijn.
  type ScoredPred = {
    predicted_home: number
    predicted_away: number
    match: { home_score: number | null; away_score: number | null; result_entered: boolean } | null
  }
  const played = ((scoredPreds ?? []) as unknown as ScoredPred[]).filter(
    (p) => p.match?.result_entered && p.match.home_score != null && p.match.away_score != null
  )
  const playedPredCount = played.length
  const exactCount = played.filter(
    (p) => p.predicted_home === p.match!.home_score && p.predicted_away === p.match!.away_score
  ).length
  const correctDirectionCount = played.filter(
    (p) => Math.sign(p.predicted_home - p.predicted_away) === Math.sign((p.match!.home_score ?? 0) - (p.match!.away_score ?? 0))
  ).length

  // Bracket-nauwkeurigheid
  const bracketRows = (scoredBracket ?? []) as { points_awarded: number | null }[]
  const bracketScoredCount = bracketRows.length
  const bracketCorrectCount = bracketRows.filter((b) => (b.points_awarded ?? 0) > 0).length

  // ─── Gedetailleerd puntenoverzicht (eigen data — altijd zichtbaar) ──────────
  type BonusQ = { id: string; question: string; type: string; unlock_date: string | null }
  const [mRes, pRes, jRes, aRes, bqRes, baRes, tRes, brRes] = await Promise.all([
    supabase
      .from('matches')
      .select(`id, kickoff_at, match_number, home_score, away_score, result_entered,
        home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
        away_team:teams!matches_away_team_id_fkey(id, name, flag_url, group_name)`)
      .eq('stage', 'group')
      .order('kickoff_at'),
    supabase.from('predictions').select('match_id, predicted_home, predicted_away, points_awarded').eq('user_id', user.id),
    supabase.from('jokers').select('match_id').eq('user_id', user.id),
    supabase.from('group_advancement').select('team_id, predicted_position').eq('user_id', user.id),
    supabase.from('bonus_questions').select('id, question, type, unlock_date').order('type').order('created_at'),
    supabase.from('bonus_answers').select('question_id, answer, points_awarded').eq('user_id', user.id),
    supabase.from('teams').select('id, name, flag_url, group_name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('bracket_predictions').select('slot, predicted_team_id, points_awarded').eq('user_id', user.id).order('slot'),
  ])

  // Dagelijkse vragen: alleen tonen als van gisteren of eerder én beantwoord
  const today = new Date().toISOString().split('T')[0]
  const bonusAnswerRows = (baRes.data ?? []) as PuntenDetail['bonusAnswerRows']
  const answeredIds = new Set(bonusAnswerRows.map((a) => a.question_id))
  const visibleBonusQuestions = ((bqRes.data ?? []) as BonusQ[])
    .filter((q) => {
      if (q.type === 'pre_tournament') return true
      if (!q.unlock_date || q.unlock_date >= today) return false
      return answeredIds.has(q.id)
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'pre_tournament' ? -1 : 1
      if (a.type === 'pre_tournament') return preBonusIndex(a.question) - preBonusIndex(b.question)
      return (a.unlock_date ?? '').localeCompare(b.unlock_date ?? '')
    })

  // Welke ploegen zijn nog actief? Uitgeschakelde picks worden grijs getoond.
  const { data: koM } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, result_entered, shootout_winner_id')
    .in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])
  const aliveTeamIds = [...computeAliveTeamIds(
    (mRes.data ?? []) as unknown as AliveGroupMatch[],
    (koM ?? []) as unknown as AliveKoMatch[],
  )]

  const detail: PuntenDetail = {
    matches: (mRes.data ?? []) as unknown as PuntenDetail['matches'],
    predRows: (pRes.data ?? []) as PuntenDetail['predRows'],
    jokerRows: (jRes.data ?? []) as PuntenDetail['jokerRows'],
    advancementRows: (aRes.data ?? []) as PuntenDetail['advancementRows'],
    bracketRows: (brRes.data ?? []) as PuntenDetail['bracketRows'],
    allTeams: (tRes.data ?? []) as PuntenDetail['allTeams'],
    aliveTeamIds,
    bonusQuestions: visibleBonusQuestions,
    bonusAnswerRows,
  }

  return (
    <ProfielClient
      profile={profile ?? { id: user.id, username: user.email ?? '', email: user.email ?? '', avatar_url: null, created_at: '' }}
      score={score ?? null}
      predCount={predCount ?? 0}
      bonusCount={bonusCount ?? 0}
      rank={rank}
      pouleDeelnemers={pouleDeelnemers}
      currentTheme={profile?.theme ?? 'default'}
      accuracy={{
        playedPredCount,
        exactCount,
        correctDirectionCount,
        bracketScoredCount,
        bracketCorrectCount,
      }}
      detail={detail}
    />
  )
}
