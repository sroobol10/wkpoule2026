import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfielClient from './profiel-client'

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
    supabase.from('predictions').select('points_awarded')
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

  // Wedstrijd-nauwkeurigheid
  const playedPredCount = scoredPreds?.length ?? 0
  const exactCount = scoredPreds?.filter((p) => p.points_awarded === 5).length ?? 0
  // Correct richting = exact (5) + correctPlusOneGoal (3) + correctResult (2)
  const correctDirectionCount = scoredPreds?.filter((p) => (p.points_awarded ?? 0) >= 2).length ?? 0

  // Bracket-nauwkeurigheid
  const bracketRows = (scoredBracket ?? []) as { points_awarded: number | null }[]
  const bracketScoredCount = bracketRows.length
  const bracketCorrectCount = bracketRows.filter((b) => (b.points_awarded ?? 0) > 0).length

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
    />
  )
}
