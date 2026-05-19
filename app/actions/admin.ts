'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type AdminResult = { ok: true } | { ok: false; error: string }

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, userId: null }
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { supabase: null, userId: null }
  return { supabase, userId: user.id }
}

// ─── Point system (deck slide 4) ──────────────────────────────────────────────
// Exact score:           5 pt
// Correct result:        2 pt
// Knockout winner:       3 pt
// Group advancement:     1 pt per team (handled separately)
// Pre-tournament bonus:  5 pt
// Daily bonus:           2 pt

function calcMatchPoints(actualHome: number, actualAway: number, predHome: number, predAway: number): number {
  if (actualHome === predHome && actualAway === predAway) return 5
  if (Math.sign(actualHome - actualAway) === Math.sign(predHome - predAway)) return 2
  return 0
}

// ─── Recalculate poule_scores for a list of users ─────────────────────────────
async function recalcPouleScores(supabase: Awaited<ReturnType<typeof createClient>>, userIds: string[]) {
  if (userIds.length === 0) return

  const { data: memberships } = await supabase
    .from('poule_members')
    .select('user_id, poule_id')
    .in('user_id', userIds)

  if (!memberships || memberships.length === 0) return

  for (const userId of userIds) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('points_awarded')
      .eq('user_id', userId)
      .not('points_awarded', 'is', null)

    const { data: knockoutPreds } = await supabase
      .from('knockout_predictions')
      .select('points_awarded')
      .eq('user_id', userId)
      .not('points_awarded', 'is', null)

    const { data: bonuses } = await supabase
      .from('bonus_answers')
      .select('points_awarded')
      .eq('user_id', userId)
      .not('points_awarded', 'is', null)

    const predPts     = (preds         ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const knockoutPts = (knockoutPreds ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const bonusPts    = (bonuses       ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const totalPts    = predPts + knockoutPts + bonusPts

    // exact = 5 pt, correct result = 2 pt
    const exactHits      = (preds ?? []).filter((r) => r.points_awarded === 5).length
    const correctResults = (preds ?? []).filter((r) => r.points_awarded === 2).length

    const userPoules = memberships.filter((m) => m.user_id === userId).map((m) => m.poule_id)
    for (const pouleId of userPoules) {
      await supabase
        .from('poule_scores')
        .upsert(
          { user_id: userId, poule_id: pouleId, total_pts: totalPts, exact_hits: exactHits, correct_results: correctResults },
          { onConflict: 'user_id,poule_id' }
        )
    }
  }
}

// ─── Enter a match result and recalculate points ───────────────────────────────
export async function setMatchResult(
  matchId: string,
  homeScore: number,
  awayScore: number
): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { error: matchErr } = await supabase
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, result_entered: true })
    .eq('id', matchId)

  if (matchErr) return { ok: false, error: 'Opslaan mislukt.' }

  const { data: preds } = await supabase
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away')
    .eq('match_id', matchId)

  if (preds && preds.length > 0) {
    for (const pred of preds) {
      const pts = calcMatchPoints(homeScore, awayScore, pred.predicted_home, pred.predicted_away)
      await supabase.from('predictions').update({ points_awarded: pts }).eq('id', pred.id)
    }
    await recalcPouleScores(supabase, [...new Set(preds.map((p) => p.user_id))])
  }

  revalidatePath('/admin')
  revalidatePath('/voorspellingen')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── Set correct answer for a bonus question ──────────────────────────────────
export async function setBonusCorrectAnswer(
  questionId: string,
  correctAnswer: string
): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  // Fetch question to determine point value
  const { data: question } = await supabase
    .from('bonus_questions')
    .select('type')
    .eq('id', questionId)
    .single()

  const pointsForCorrect = question?.type === 'pre_tournament' ? 5 : 2

  const { error } = await supabase
    .from('bonus_questions')
    .update({ correct_answer: correctAnswer, correct_answer_set: true })
    .eq('id', questionId)

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  const { data: answers } = await supabase
    .from('bonus_answers')
    .select('id, user_id, answer')
    .eq('question_id', questionId)

  if (answers && answers.length > 0) {
    const normalized = correctAnswer.trim().toLowerCase()
    for (const ans of answers) {
      const pts = ans.answer.trim().toLowerCase() === normalized ? pointsForCorrect : 0
      await supabase.from('bonus_answers').update({ points_awarded: pts }).eq('id', ans.id)
    }
    await recalcPouleScores(supabase, [...new Set(answers.map((a) => a.user_id))])
  }

  revalidatePath('/admin')
  revalidatePath('/bonusvragen')
  return { ok: true }
}

// ─── Enter knockout match result ───────────────────────────────────────────────
export async function setKnockoutResult(
  matchId: string,
  homeScore: number,
  awayScore: number,
  winnerId: string
): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { error } = await supabase
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, result_entered: true })
    .eq('id', matchId)

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  // 3 pt per correct knockout winner pick
  const { data: preds } = await supabase
    .from('knockout_predictions')
    .select('id, user_id, predicted_winner_id')
    .eq('match_id', matchId)

  if (preds && preds.length > 0) {
    for (const pred of preds) {
      const pts = pred.predicted_winner_id === winnerId ? 3 : 0
      await supabase.from('knockout_predictions').update({ points_awarded: pts }).eq('id', pred.id)
    }
    await recalcPouleScores(supabase, [...new Set(preds.map((p) => p.user_id))])
  }

  revalidatePath('/admin')
  revalidatePath('/knockout')
  return { ok: true }
}

// ─── Demo: auto-fill all unfilled group matches with random scores ─────────────
export async function autoFillGroupResults(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { data: matches } = await supabase
    .from('matches')
    .select('id')
    .eq('stage', 'group')
    .eq('result_entered', false)

  if (!matches || matches.length === 0) return { ok: true }

  const affectedUserIds = new Set<string>()

  for (const match of matches) {
    const homeScore = Math.floor(Math.random() * 5)
    const awayScore = Math.floor(Math.random() * 5)

    await supabase
      .from('matches')
      .update({ home_score: homeScore, away_score: awayScore, result_entered: true })
      .eq('id', match.id)

    const { data: preds } = await supabase
      .from('predictions')
      .select('id, user_id, predicted_home, predicted_away')
      .eq('match_id', match.id)

    if (preds && preds.length > 0) {
      for (const pred of preds) {
        const pts = calcMatchPoints(homeScore, awayScore, pred.predicted_home, pred.predicted_away)
        await supabase.from('predictions').update({ points_awarded: pts }).eq('id', pred.id)
        affectedUserIds.add(pred.user_id)
      }
    }
  }

  await recalcPouleScores(supabase, [...affectedUserIds])

  revalidatePath('/admin')
  revalidatePath('/voorspellingen')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── Demo: clear all group match results and reset prediction points ───────────
export async function clearAllGroupResults(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { data: groupMatches } = await supabase
    .from('matches')
    .select('id')
    .eq('stage', 'group')

  if (!groupMatches) return { ok: false, error: 'Ophalen mislukt.' }

  const matchIds = groupMatches.map((m) => m.id)

  await supabase
    .from('matches')
    .update({ home_score: null, away_score: null, result_entered: false })
    .in('id', matchIds)

  const { data: affectedPreds } = await supabase
    .from('predictions')
    .select('user_id')
    .in('match_id', matchIds)
    .not('points_awarded', 'is', null)

  await supabase
    .from('predictions')
    .update({ points_awarded: null })
    .in('match_id', matchIds)

  const userIds = [...new Set((affectedPreds ?? []).map((p) => p.user_id))]
  await recalcPouleScores(supabase, userIds)

  revalidatePath('/admin')
  revalidatePath('/voorspellingen')
  revalidatePath('/poules')
  return { ok: true }
}
