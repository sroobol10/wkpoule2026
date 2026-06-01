'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { KO_POINTS } from '@/lib/constants'

type AdminResult = { ok: true } | { ok: false; error: string }

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, userId: null }
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { supabase: null, userId: null }
  return { supabase, userId: user.id }
}

// ─── Point system ─────────────────────────────────────────────────────────────
// Exact score:                               5 pt
// Correct result + één doelpunttotaal klopt: 3 pt
// Correct result:                            2 pt
// Fout resultaat + één doelpunttotaal klopt: 1 pt
// Fout:                                      0 pt
// KO winner: zie KO_POINTS (5/15/25/50/100 per ronde)
// Group advancement: 3 pt per correct eindpositie

function calcMatchPoints(actualHome: number, actualAway: number, predHome: number, predAway: number): number {
  if (actualHome === predHome && actualAway === predAway) return 5
  const correctResult = Math.sign(actualHome - actualAway) === Math.sign(predHome - predAway)
  const homeMatch = predHome === actualHome
  const awayMatch = predAway === actualAway
  if (correctResult && (homeMatch || awayMatch)) return 3
  if (correctResult) return 2
  if (homeMatch || awayMatch) return 1
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

  const affectedPouleIds = [...new Set(memberships.map((m) => m.poule_id))]

  // Snapshot huidige rangschikking per poule (vóór de update)
  const oldRankMap: Record<string, Record<string, number>> = {}
  for (const pouleId of affectedPouleIds) {
    const { data: cur } = await supabase
      .from('poule_scores')
      .select('user_id, total_pts')
      .eq('poule_id', pouleId)
      .order('total_pts', { ascending: false })
    if (cur) {
      oldRankMap[pouleId] = {}
      cur.forEach((s, i) => { oldRankMap[pouleId][s.user_id] = i + 1 })
    }
  }

  // Herbereken punten per gebruiker
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

    const { data: advancement } = await supabase
      .from('group_advancement')
      .select('points_awarded')
      .eq('user_id', userId)
      .not('points_awarded', 'is', null)

    const { data: bonuses } = await supabase
      .from('bonus_answers')
      .select('points_awarded')
      .eq('user_id', userId)
      .not('points_awarded', 'is', null)

    const predPts        = (preds         ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const knockoutPts    = (knockoutPreds ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const advancementPts = (advancement   ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const bonusPts       = (bonuses       ?? []).reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const totalPts       = predPts + knockoutPts + advancementPts + bonusPts

    const exactHits      = (preds ?? []).filter((r) => (r.points_awarded ?? 0) >= 5).length
    const correctResults = (preds ?? []).filter((r) => r.points_awarded && r.points_awarded >= 2 && r.points_awarded < 5).length

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

  // Bereken nieuwe rangschikking en sla rank_change op
  for (const pouleId of affectedPouleIds) {
    const { data: updated } = await supabase
      .from('poule_scores')
      .select('user_id, total_pts')
      .eq('poule_id', pouleId)
      .order('total_pts', { ascending: false })
    if (!updated) continue

    const oldRanks = oldRankMap[pouleId] ?? {}
    for (let i = 0; i < updated.length; i++) {
      const uid = updated[i].user_id
      const newRank = i + 1
      const oldRank = oldRanks[uid] ?? null
      const rankChange = oldRank != null ? oldRank - newRank : null
      await supabase
        .from('poule_scores')
        .update({ rank_change: rankChange })
        .eq('poule_id', pouleId)
        .eq('user_id', uid)
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
    const { data: jokers } = await supabase
      .from('jokers')
      .select('user_id')
      .eq('match_id', matchId)
    const jokerUserIds = new Set((jokers ?? []).map((j) => j.user_id))

    for (const pred of preds) {
      const base = calcMatchPoints(homeScore, awayScore, pred.predicted_home, pred.predicted_away)
      const pts  = base * (jokerUserIds.has(pred.user_id) ? 2 : 1)
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

  const { data: match, error } = await supabase
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, result_entered: true })
    .eq('id', matchId)
    .select('stage')
    .single()

  if (error || !match) return { ok: false, error: 'Opslaan mislukt.' }

  const pointsForRound = KO_POINTS[match.stage] ?? 0

  const { data: preds } = await supabase
    .from('knockout_predictions')
    .select('id, user_id, predicted_winner_id')
    .eq('match_id', matchId)

  if (preds && preds.length > 0) {
    for (const pred of preds) {
      const pts = pred.predicted_winner_id === winnerId ? pointsForRound : 0
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
  // Verify admin via session client, then use service role to bypass RLS.
  // The DB trigger only fires when result_entered goes false→true, so clearing
  // never triggers automatic recalculation — we must do it manually with a
  // client that can write other users' rows.
  const { supabase: sessionClient } = await assertAdmin()
  if (!sessionClient) return { ok: false, error: 'Geen toegang.' }

  const db = createServiceClient()

  const { data: groupMatches } = await db
    .from('matches')
    .select('id')
    .eq('stage', 'group')

  if (!groupMatches) return { ok: false, error: 'Ophalen mislukt.' }

  const matchIds = groupMatches.map((m) => m.id)

  await db
    .from('matches')
    .update({ home_score: null, away_score: null, result_entered: false })
    .in('id', matchIds)

  await db
    .from('predictions')
    .update({ points_awarded: null })
    .in('match_id', matchIds)

  await db
    .from('poule_scores')
    .update({ total_pts: 0, exact_hits: 0, correct_results: 0 })
    .not('user_id', 'is', null)

  revalidatePath('/admin')
  revalidatePath('/voorspellingen')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── Score group advancement for a completed group ─────────────────────────────
// Roep aan nadat alle 6 groepswedstrijden een resultaat hebben.
// Berekent de werkelijke eindstand en kent 3 pt toe per correct voorspelde positie.
export async function scoreGroupAdvancement(group: string): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { data: groupMatches } = await supabase
    .from('matches')
    .select('id, home_score, away_score, home_team:teams!home_team_id(id, group_name), away_team:teams!away_team_id(id, group_name)')
    .eq('stage', 'group')
    .eq('result_entered', true)

  if (!groupMatches) return { ok: false, error: 'Ophalen mislukt.' }

  type TeamRef = { id: string; group_name: string }
  const gm = groupMatches.filter((m) => (m.home_team as TeamRef | null)?.group_name === group)
  if (gm.length === 0) return { ok: false, error: `Geen resultaten voor groep ${group}.` }

  // Werkelijke eindstand
  const st: Record<string, { points: number; gd: number; gf: number }> = {}
  for (const m of gm) {
    const ht = m.home_team as TeamRef | null
    const at = m.away_team as TeamRef | null
    if (!ht || !at) continue
    st[ht.id] ??= { points: 0, gd: 0, gf: 0 }
    st[at.id] ??= { points: 0, gd: 0, gf: 0 }
    const h = m.home_score!, a = m.away_score!
    st[ht.id].gf += h; st[ht.id].gd += h - a
    st[at.id].gf += a; st[at.id].gd += a - h
    if (h > a) st[ht.id].points += 3
    else if (h < a) st[at.id].points += 3
    else { st[ht.id].points += 1; st[at.id].points += 1 }
  }

  const sorted = Object.entries(st)
    .sort(([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf)
  const actualPosition: Record<string, number> = {}
  sorted.forEach(([teamId], i) => { actualPosition[teamId] = i + 1 })

  // Picks ophalen voor teams in deze groep
  const { data: picks } = await supabase
    .from('group_advancement')
    .select('id, user_id, team_id, predicted_position')
    .in('team_id', Object.keys(st))

  if (!picks || picks.length === 0) return { ok: true }

  for (const pick of picks) {
    const pts = (actualPosition[pick.team_id] ?? 99) === pick.predicted_position ? 3 : 0
    await supabase.from('group_advancement').update({ points_awarded: pts }).eq('id', pick.id)
  }

  await recalcPouleScores(supabase, [...new Set(picks.map((p) => p.user_id))])

  revalidatePath('/admin')
  revalidatePath('/poules')
  revalidatePath('/voorspellingen')
  return { ok: true }
}
