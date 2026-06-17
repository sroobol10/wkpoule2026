'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { KO_POINTS } from '@/lib/constants'
import { BRACKET, assignThirdPlaceSlots } from '@/lib/bracket'

type AdminResult = { ok: true } | { ok: false; error: string }

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, userId: null }
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return { supabase: null, userId: null }
  return { supabase, userId: user.id }
}

// ─── Bracket-scoring: ronde-gebaseerd (doorgestoten ploegen) ─────────────────
// Scoort alle bracket-picks voor 'stage' op basis van welke ploegen
// daadwerkelijk doorgaan naar de volgende ronde — ongeacht het specifieke slot.
async function scoreBracketAdvancement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stage: string
): Promise<string[]> {
  const pointsForStage = KO_POINTS[stage] ?? 0
  if (pointsForStage === 0) return []

  // Verzamel de doorgestoten teams voor deze ronde
  let advancedTeams: Set<string>

  if (stage === 'final' || stage === 'third_place') {
    // Final / troostfinale: de winnaar is de enige die "doorgaat" (= kampioen / 3e plek)
    const { data: m } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id, home_score, away_score')
      .eq('stage', stage)
      .eq('result_entered', true)
      .maybeSingle()
    if (!m || m.home_score == null || m.away_score == null) return []
    const winner = m.home_score > m.away_score ? m.home_team_id! : m.away_team_id!
    advancedTeams = new Set([winner])
  } else {
    // Andere rondes: kijk welke ploegen DEELNEMEN aan de VOLGENDE ronde
    const nextStageMap: Record<string, string[]> = {
      r32: ['r16'],
      r16: ['qf'],
      qf:  ['sf'],
      sf:  ['final', 'third_place'],
    }
    const nextStages = nextStageMap[stage] ?? []
    if (nextStages.length === 0) return []

    const { data: nextMatches } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id')
      .in('stage', nextStages)
      .not('home_team_id', 'is', null)
      .not('away_team_id', 'is', null)

    advancedTeams = new Set<string>()
    for (const m of nextMatches ?? []) {
      if (m.home_team_id) advancedTeams.add(m.home_team_id)
      if (m.away_team_id) advancedTeams.add(m.away_team_id)
    }
  }

  if (advancedTeams.size === 0) return []

  // Haal alle bracket-picks op voor slots in deze ronde
  const slotsInStage = BRACKET.filter((b) => b.stage === stage).map((b) => b.slot)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: picks } = await (supabase as any)
    .from('bracket_predictions')
    .select('id, user_id, predicted_team_id')
    .in('slot', slotsInStage)

  if (!picks?.length) return []

  const affectedUsers: string[] = []
  for (const pick of picks as { id: string; user_id: string; predicted_team_id: string }[]) {
    const pts = advancedTeams.has(pick.predicted_team_id) ? pointsForStage : 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('bracket_predictions')
      .update({ points_awarded: pts })
      .eq('id', pick.id)
    affectedUsers.push(pick.user_id)
  }
  return affectedUsers
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
  if (actualHome === predHome && actualAway === predAway) return 10
  const correctResult = Math.sign(actualHome - actualAway) === Math.sign(predHome - predAway)
  const homeMatch = predHome === actualHome
  const awayMatch = predAway === actualAway
  if (correctResult && (homeMatch || awayMatch)) return 7
  if (correctResult) return 5
  if (homeMatch || awayMatch) return 2
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

  // Haal pre-tournament vraag-IDs eenmalig op voor bonus-opsplitsing
  const { data: preQRows } = await supabase
    .from('bonus_questions')
    .select('id')
    .eq('type', 'pre_tournament')
  const preQuestionIds = new Set((preQRows ?? []).map((q) => q.id))

  // Eindstand-punten tellen pas mee als de VOLLEDIGE groepsfase gespeeld is (alle 72 matches)
  const { count: totalGroupMatches } = await supabase
    .from('matches').select('id', { count: 'exact', head: true }).eq('stage', 'group')
  const { count: playedGroupMatches } = await supabase
    .from('matches').select('id', { count: 'exact', head: true }).eq('stage', 'group').eq('result_entered', true)
  const allGroupMatchesPlayed = (totalGroupMatches ?? 0) > 0 && totalGroupMatches === playedGroupMatches

  // Herbereken punten per gebruiker (inclusief breakdown)
  for (const userId of userIds) {
    const [predsRes, koRes, advRes, bonusRes, jokersRes, bracketRes] = await Promise.all([
      supabase.from('predictions')
        .select('points_awarded, predicted_home, predicted_away, match:matches!predictions_match_id_fkey(home_score, away_score, result_entered)')
        .eq('user_id', userId).not('points_awarded', 'is', null),
      supabase.from('knockout_predictions').select('points_awarded')
        .eq('user_id', userId).not('points_awarded', 'is', null),
      supabase.from('group_advancement').select('points_awarded')
        .eq('user_id', userId).not('points_awarded', 'is', null),
      supabase.from('bonus_answers').select('points_awarded, question_id')
        .eq('user_id', userId).not('points_awarded', 'is', null),
      // Jokers op al-gespeelde wedstrijden (result_entered = true)
      supabase.from('jokers')
        .select('id, match:matches!jokers_match_id_fkey(result_entered)')
        .eq('user_id', userId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('bracket_predictions').select('points_awarded')
        .eq('user_id', userId).not('points_awarded', 'is', null),
    ])

    const preds       = predsRes.data   ?? []
    const koPreds     = koRes.data      ?? []
    const advancement = advRes.data     ?? []
    const bonuses     = bonusRes.data   ?? []
    const jokerRows   = jokersRes.data  ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bracketRows = (bracketRes.data ?? []) as { points_awarded: number | null }[]

    const groupMatchPts     = preds.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    // Eindstand-punten alleen meenemen als de volledige groepsfase klaar is
    const groupStandingsPts = allGroupMatchesPlayed
      ? advancement.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
      : 0
    const knockoutPts       = koPreds.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
                            + bracketRows.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const bonusPrePts       = bonuses.filter((b) => preQuestionIds.has(b.question_id))
                                .reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const bonusDailyPts     = bonuses.filter((b) => !preQuestionIds.has(b.question_id))
                                .reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const jokersPlayed      = jokerRows.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (j: any) => j.match?.result_entered === true
    ).length

    const totalPts       = groupMatchPts + groupStandingsPts + knockoutPts + bonusPrePts + bonusDailyPts

    // Exact/correct op basis van de echte uitslag — niet op puntwaarden,
    // want jokers verdubbelen de punten (richting+1 mét joker = 6 ≠ exact)
    type ScoredPred = {
      predicted_home: number
      predicted_away: number
      match: { home_score: number | null; away_score: number | null; result_entered: boolean } | null
    }
    const scored = (preds as unknown as ScoredPred[]).filter(
      (r) => r.match?.result_entered && r.match.home_score != null && r.match.away_score != null
    )
    const isExact = (r: ScoredPred) =>
      r.predicted_home === r.match!.home_score && r.predicted_away === r.match!.away_score
    const exactHits      = scored.filter(isExact).length
    const correctResults = scored.filter(
      (r) => !isExact(r) && Math.sign(r.predicted_home - r.predicted_away) === Math.sign((r.match!.home_score ?? 0) - (r.match!.away_score ?? 0))
    ).length

    const userPoules = memberships.filter((m) => m.user_id === userId).map((m) => m.poule_id)
    for (const pouleId of userPoules) {
      await supabase.from('poule_scores').upsert(
        {
          user_id: userId, poule_id: pouleId,
          total_pts: totalPts, exact_hits: exactHits, correct_results: correctResults,
          group_match_pts: groupMatchPts, group_standings_pts: groupStandingsPts,
          knockout_pts: knockoutPts, bonus_pre_pts: bonusPrePts, bonus_daily_pts: bonusDailyPts,
          jokers_played: jokersPlayed,
        },
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

  const { data: question } = await supabase
    .from('bonus_questions')
    .select('type, question')
    .eq('id', questionId)
    .single()

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
    // "Gedoseerde groepsfase": max 10 pt, -1 per gelijkspel ernaast, min 0
    const isGedoseerd = question?.question?.toLowerCase().includes('gedoseerd')
    const correctNum = isGedoseerd ? parseInt(correctAnswer.trim(), 10) : NaN

    // Punten conform de puntentelling op de bonusvragenpagina:
    // Topscorer 25 · Beste speler 15 · overige pre-tournament (GOAT) 5 · dagelijks 1
    const qLower = question?.question?.toLowerCase() ?? ''
    const pointsForCorrect = question?.type === 'pre_tournament'
      ? (qLower.includes('topscorer') ? 25 : qLower.includes('beste speler') ? 15 : 5)
      : 1
    const normalized = correctAnswer.trim().toLowerCase()

    for (const ans of answers) {
      let pts: number
      if (isGedoseerd && !isNaN(correctNum)) {
        const userNum = parseInt(ans.answer.trim(), 10)
        pts = isNaN(userNum) ? 0 : Math.max(0, 10 - Math.abs(userNum - correctNum))
      } else {
        pts = ans.answer.trim().toLowerCase() === normalized ? pointsForCorrect : 0
      }
      await supabase.from('bonus_answers').update({ points_awarded: pts }).eq('id', ans.id)
    }
    await recalcPouleScores(supabase, [...new Set(answers.map((a) => a.user_id))])
  }

  revalidatePath('/admin')
  revalidatePath('/bonusvragen')
  return { ok: true }
}

// ─── Update answer config for a bonus question ────────────────────────────────
export async function updateBonusAnswerConfig(
  questionId: string,
  answerType: 'free' | 'options' | 'yesno',
  answerOptions: string[] | null
): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { error } = await supabase
    .from('bonus_questions')
    .update({ answer_type: answerType, answer_options: answerOptions })
    .eq('id', questionId)

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

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

  const affectedUsers = new Set<string>()

  if (preds && preds.length > 0) {
    for (const pred of preds) {
      const pts = pred.predicted_winner_id === winnerId ? pointsForRound : 0
      await supabase.from('knockout_predictions').update({ points_awarded: pts }).eq('id', pred.id)
      affectedUsers.add(pred.user_id)
    }
  }

  // Bracket-voorspellingen: score alle picks voor deze ronde o.b.v. doorgestoten ploegen
  // (ronde-gebaseerd: slot is niet relevant, puur welke teams de ronde halen)
  const bracketUsers = await scoreBracketAdvancement(supabase, match.stage)
  bracketUsers.forEach((u) => affectedUsers.add(u))

  if (affectedUsers.size > 0) {
    await recalcPouleScores(supabase, [...affectedUsers])
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

  if (!matches || matches.length === 0) {
    return { ok: false, error: 'Geen openstaande wedstrijden gevonden — is Leegmaken uitgevoerd?' }
  }

  const affectedUserIds = new Set<string>()

  for (const match of matches) {
    const homeScore = Math.floor(Math.random() * 5)
    const awayScore = Math.floor(Math.random() * 5)

    const { error: mErr } = await supabase
      .from('matches')
      .update({ home_score: homeScore, away_score: awayScore, result_entered: true })
      .eq('id', match.id)
    if (mErr) return { ok: false, error: `Match update mislukt: ${mErr.message}` }

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

  // Matches resetten (admin heeft ALL-policy op matches)
  const { error: matchErr } = await supabase
    .from('matches')
    .update({ home_score: null, away_score: null, result_entered: false })
    .in('id', matchIds)
  if (matchErr) return { ok: false, error: `Matches: ${matchErr.message}` }

  // Punten wissen (admin heeft nu ALL-policy op predictions)
  const { error: predErr } = await supabase
    .from('predictions')
    .update({ points_awarded: null })
    .in('match_id', matchIds)
  if (predErr) return { ok: false, error: `Voorspellingen: ${predErr.message}` }

  // Ook groepsstand-punten resetten (zodat ze niet doorsijpelen bij herberekening)
  const { error: advErr } = await supabase
    .from('group_advancement')
    .update({ points_awarded: null })
    .not('id', 'is', null)
  if (advErr) return { ok: false, error: `Eindstanden: ${advErr.message}` }

  // Klassement nullen (admin heeft nu ALL-policy op poule_scores)
  const { error: scoreErr } = await supabase
    .from('poule_scores')
    .update({ total_pts: 0, exact_hits: 0, correct_results: 0, rank_change: null,
              group_match_pts: 0, group_standings_pts: 0, knockout_pts: 0,
              bonus_pre_pts: 0, bonus_daily_pts: 0, jokers_played: 0 })
    .not('user_id', 'is', null)
  if (scoreErr) return { ok: false, error: `Standen: ${scoreErr.message}` }

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

  // Alle 6 wedstrijden in de groep moeten gespeeld zijn (4 teams × 3 duels / 2 = 6)
  if (gm.length < 6) {
    return { ok: false, error: `Groep ${group} is nog niet volledig gespeeld (${gm.length}/6 wedstrijden).` }
  }

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
    const pts = (actualPosition[pick.team_id] ?? 99) === pick.predicted_position ? 5 : 0
    await supabase.from('group_advancement').update({ points_awarded: pts }).eq('id', pick.id)
  }

  await recalcPouleScores(supabase, [...new Set(picks.map((p) => p.user_id))])

  revalidatePath('/admin')
  revalidatePath('/poules')
  revalidatePath('/voorspellingen')
  return { ok: true }
}

// ─── Kaarten opslaan per wedstrijd ────────────────────────────────────────────
export async function saveMatchCards(
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeYellow: number,
  homeRed: number,
  awayYellow: number,
  awayRed: number
): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  // match_cards heeft alleen een SELECT-policy (RLS) — schrijven kan
  // uitsluitend via de service role
  const service = createServiceClient()
  const { error } = await service
    .from('match_cards')
    .upsert(
      [
        { match_id: matchId, team_id: homeTeamId, yellow_cards: homeYellow, red_cards: homeRed },
        { match_id: matchId, team_id: awayTeamId, yellow_cards: awayYellow, red_cards: awayRed },
      ],
      { onConflict: 'match_id,team_id' }
    )

  if (error) return { ok: false, error: 'Opslaan mislukt.' }
  return { ok: true }
}

// ─── Landgebaseerde bonuspunten toekennen ──────────────────────────────────────
// Goalgettergigant : goals gescoord per land
// Desastreuze defensie: tegendoelpunten per land
// Kaartenkoning    : gele kaart = 1 pt, rode kaart = 2 pt
export async function awardCountryBonus(questionId: string): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { data: question } = await supabase
    .from('bonus_questions')
    .select('question')
    .eq('id', questionId)
    .single()

  if (!question) return { ok: false, error: 'Vraag niet gevonden.' }

  const q = question.question.toLowerCase()
  const teamPoints: Record<string, number> = {}

  if (q.includes('goalgettergigant')) {
    const { data: matches } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id, home_score, away_score')
      .eq('result_entered', true)
    for (const m of matches ?? []) {
      if (m.home_team_id && m.home_score != null)
        teamPoints[m.home_team_id] = (teamPoints[m.home_team_id] ?? 0) + m.home_score
      if (m.away_team_id && m.away_score != null)
        teamPoints[m.away_team_id] = (teamPoints[m.away_team_id] ?? 0) + m.away_score
    }
  } else if (q.includes('desastreuze')) {
    const { data: matches } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id, home_score, away_score')
      .eq('result_entered', true)
    for (const m of matches ?? []) {
      if (m.home_team_id && m.away_score != null)
        teamPoints[m.home_team_id] = (teamPoints[m.home_team_id] ?? 0) + m.away_score
      if (m.away_team_id && m.home_score != null)
        teamPoints[m.away_team_id] = (teamPoints[m.away_team_id] ?? 0) + m.home_score
    }
  } else if (q.includes('kaartenkoning')) {
    const { data: cards } = await supabase
      .from('match_cards')
      .select('team_id, yellow_cards, red_cards')
    for (const c of cards ?? []) {
      teamPoints[c.team_id] = (teamPoints[c.team_id] ?? 0) + c.yellow_cards + c.red_cards * 2
    }
  } else {
    return { ok: false, error: 'Onbekend vraagtype voor landgebaseerde score.' }
  }

  // Vertaal team-ID naar teamnaam (bonus_answers slaat de naam op)
  const { data: teams } = await supabase.from('teams').select('id, name')
  const pointsByName: Record<string, number> = {}
  for (const t of teams ?? []) {
    if (teamPoints[t.id] !== undefined) pointsByName[t.name] = teamPoints[t.id]
  }

  const { data: answers } = await supabase
    .from('bonus_answers')
    .select('id, user_id, answer')
    .eq('question_id', questionId)

  if (!answers?.length) return { ok: true }

  const affectedUserIds = new Set<string>()
  for (const ans of answers) {
    const pts = pointsByName[ans.answer.trim()] ?? 0
    await supabase.from('bonus_answers').update({ points_awarded: pts }).eq('id', ans.id)
    affectedUserIds.add(ans.user_id)
  }

  await recalcPouleScores(supabase, [...affectedUserIds])

  revalidatePath('/admin')
  revalidatePath('/bonusvragen')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── Score alle groepsindeling in één keer ────────────────────────────────────
export async function scoreAllGroupAdvancement(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
  const errors: string[] = []

  for (const group of GROUPS) {
    const result = await scoreGroupAdvancement(group)
    if (!result.ok) errors.push(`Groep ${group}: ${result.error}`)
  }

  revalidatePath('/admin')
  revalidatePath('/poules')
  revalidatePath('/voorspellingen')
  return errors.length === 0 ? { ok: true } : { ok: false, error: errors.join(' | ') }
}

// ─── Auto-fill groepswedstrijden tot een bepaalde datum ──────────────────────
export async function autoFillGroupResultsUntil(isoDate: string): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { data: matches } = await supabase
    .from('matches')
    .select('id')
    .eq('stage', 'group')
    .eq('result_entered', false)
    .lte('kickoff_at', isoDate)

  if (!matches || matches.length === 0) {
    return { ok: false, error: 'Geen wedstrijden gevonden vóór de gekozen datum.' }
  }

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
      const { data: jokers } = await supabase
        .from('jokers').select('user_id').eq('match_id', match.id)
      const jokerUserIds = new Set((jokers ?? []).map((j) => j.user_id))

      for (const pred of preds) {
        const base = calcMatchPoints(homeScore, awayScore, pred.predicted_home, pred.predicted_away)
        const pts  = base * (jokerUserIds.has(pred.user_id) ? 2 : 1)
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

// ─── Vul teams in voor de volgende KO-ronde op basis van gespeelde resultaten ─
export async function assignNextKoRoundTeams(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  // Haal alle KO-wedstrijden op (admin heeft SELECT op alle matches)
  const { data: koMatches } = await supabase
    .from('matches')
    .select('id, match_number, stage, home_team_id, away_team_id, home_score, away_score, result_entered')
    .in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])
    .order('match_number')

  if (!koMatches || koMatches.length === 0) {
    return { ok: false, error: 'Geen KO-wedstrijden gevonden. Maak ze eerst aan via het script.' }
  }

  // Bouw een map: slot → match
  const matchBySlot = Object.fromEntries(koMatches.map((m) => [m.match_number, m]))

  // Bereken groepsfinale-standen voor groep-seeds (1A, 2B etc.)
  const { data: groupMatches } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, result_entered, home_team:teams!matches_home_team_id_fkey(group_name)')
    .eq('stage', 'group')
    .eq('result_entered', true)

  type GroupStats = { pts: number; gd: number; gf: number }
  const groupStandings: Record<string, Record<string, GroupStats>> = {}

  for (const m of groupMatches ?? []) {
    const group = (m.home_team as { group_name: string } | null)?.group_name
    if (!group || m.home_score == null || m.away_score == null) continue
    const h = m.home_score, a = m.away_score
    if (!groupStandings[group]) groupStandings[group] = {}
    if (!groupStandings[group][m.home_team_id!]) groupStandings[group][m.home_team_id!] = { pts: 0, gd: 0, gf: 0 }
    if (!groupStandings[group][m.away_team_id!]) groupStandings[group][m.away_team_id!] = { pts: 0, gd: 0, gf: 0 }
    groupStandings[group][m.home_team_id!].gf += h; groupStandings[group][m.home_team_id!].gd += h - a
    groupStandings[group][m.away_team_id!].gf += a; groupStandings[group][m.away_team_id!].gd += a - h
    if (h > a) groupStandings[group][m.home_team_id!].pts += 3
    else if (h < a) groupStandings[group][m.away_team_id!].pts += 3
    else { groupStandings[group][m.home_team_id!].pts += 1; groupStandings[group][m.away_team_id!].pts += 1 }
  }

  // Sorteer per groep
  const sortedGroups: Record<string, string[]> = {}
  for (const [g, teams] of Object.entries(groupStandings)) {
    sortedGroups[g] = Object.entries(teams)
      .sort(([, x], [, y]) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf)
      .map(([id]) => id)
  }

  // Bepaal beste 8 nummers 3 + slot-toewijzing
  const thirds = Object.entries(sortedGroups)
    .filter(([, t]) => t[2])
    .map(([g, t]) => {
      const st = groupStandings[g][t[2]]
      return { group: g, teamId: t[2], ...st }
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    .slice(0, 8)

  const best8Groups = thirds.map((t) => t.group).sort()
  const thirdAssignment = assignThirdPlaceSlots(best8Groups)
  const thirdTeamBySlot: Record<number, string> = {}
  for (const [slot, group] of Object.entries(thirdAssignment)) {
    const teamId = sortedGroups[group]?.[2]
    if (teamId) thirdTeamBySlot[Number(slot)] = teamId
  }

  // Resolver: seed → teamId
  function resolveTeam(seed: string): string | null {
    if (seed.startsWith('W')) {
      const slot = parseInt(seed.slice(1))
      const m = matchBySlot[slot]
      if (!m?.result_entered || m.home_score == null || m.away_score == null) return null
      return m.home_score > m.away_score ? m.home_team_id : m.away_team_id
    }
    if (seed.startsWith('L')) {
      const slot = parseInt(seed.slice(1))
      const m = matchBySlot[slot]
      if (!m?.result_entered || m.home_score == null || m.away_score == null) return null
      return m.home_score > m.away_score ? m.away_team_id : m.home_team_id
    }
    if (seed.startsWith('3_')) {
      const slot = parseInt(seed.slice(2))
      return thirdTeamBySlot[slot] ?? null
    }
    // '1A', '2B' etc.
    const pos = parseInt(seed[0]) - 1
    const group = seed[1]
    return sortedGroups[group]?.[pos] ?? null
  }

  // Vind de eerste ronde met null-teams en vul die in
  const stageOrder = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']
  let updated = 0

  for (const stage of stageOrder) {
    const stageMatches = BRACKET.filter((bm) => bm.stage === stage)
    const needsTeams = stageMatches.filter((bm) => {
      const m = matchBySlot[bm.slot]
      return m && (!m.home_team_id || !m.away_team_id)
    })

    if (needsTeams.length === 0) continue

    for (const bm of needsTeams) {
      const homeId = resolveTeam(bm.homeSeed)
      const awayId = resolveTeam(bm.awaySeed)
      if (!homeId || !awayId) continue

      const m = matchBySlot[bm.slot]
      await supabase.from('matches').update({ home_team_id: homeId, away_team_id: awayId }).eq('id', m.id)
      updated++
    }

    if (updated > 0) break // verwerk één ronde per keer
  }

  if (updated === 0) return { ok: false, error: 'Geen teams om in te vullen. Controleer of de vorige ronde volledig gespeeld is.' }

  revalidatePath('/admin')
  revalidatePath('/knockout')
  return { ok: true }
}

// ─── KO-wedstrijden aanmaken vanuit admin (zonder npm script) ────────────────
export async function createKoMatches(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const KO_STAGES = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']

  // Check of KO-matches al bestaan
  const { data: existing } = await supabase
    .from('matches')
    .select('id')
    .in('stage', KO_STAGES)
    .limit(1)
  if (existing && existing.length > 0) {
    return { ok: false, error: 'KO-wedstrijden bestaan al. Gebruik "KO leegmaken" eerst.' }
  }

  // Bereken groepsstanden vanuit werkelijke resultaten
  const { data: groupMatches } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, result_entered, home_team:teams!matches_home_team_id_fkey(group_name)')
    .eq('stage', 'group')

  type Stats = { pts: number; gd: number; gf: number }
  const standings: Record<string, Record<string, Stats>> = {}

  for (const m of groupMatches ?? []) {
    if (!m.result_entered || m.home_score == null || m.away_score == null) continue
    const group = (m.home_team as { group_name: string } | null)?.group_name
    if (!group || !m.home_team_id || !m.away_team_id) continue
    if (!standings[group]) standings[group] = {}
    if (!standings[group][m.home_team_id]) standings[group][m.home_team_id] = { pts: 0, gd: 0, gf: 0 }
    if (!standings[group][m.away_team_id]) standings[group][m.away_team_id] = { pts: 0, gd: 0, gf: 0 }
    const h = m.home_score, a = m.away_score
    standings[group][m.home_team_id].gf += h; standings[group][m.home_team_id].gd += h - a
    standings[group][m.away_team_id].gf += a; standings[group][m.away_team_id].gd += a - h
    if (h > a) standings[group][m.home_team_id].pts += 3
    else if (h < a) standings[group][m.away_team_id].pts += 3
    else { standings[group][m.home_team_id].pts += 1; standings[group][m.away_team_id].pts += 1 }
  }

  const sortedGroups: Record<string, string[]> = {}
  const thirds: { group: string; teamId: string; pts: number; gd: number; gf: number }[] = []

  for (const [g, teams] of Object.entries(standings)) {
    const sorted = Object.entries(teams)
      .sort(([, x], [, y]) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf)
      .map(([id]) => id)
    sortedGroups[g] = sorted
    if (sorted[2]) {
      const st = teams[sorted[2]]
      thirds.push({ group: g, teamId: sorted[2], ...st })
    }
  }

  const best8 = [...thirds]
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    .slice(0, 8)
  const best8Groups = best8.map((t) => t.group).sort()
  const thirdAssignment = assignThirdPlaceSlots(best8Groups)
  const thirdTeamBySlot: Record<number, string> = {}
  for (const [slot, group] of Object.entries(thirdAssignment)) {
    const teamId = sortedGroups[group]?.[2]
    if (teamId) thirdTeamBySlot[Number(slot)] = teamId
  }

  function resolveTeam(seed: string): string | null {
    if (seed.startsWith('3_')) return thirdTeamBySlot[parseInt(seed.slice(2))] ?? null
    const pos = parseInt(seed[0]) - 1
    const group = seed[1]
    return sortedGroups[group]?.[pos] ?? null
  }

  const { KO_KICKOFFS } = await import('@/lib/bracket')

  const rows = BRACKET.map((bm) => ({
    match_number: bm.slot,
    stage:        bm.stage,
    kickoff_at:   KO_KICKOFFS[bm.slot],
    home_team_id: bm.stage === 'r32' ? resolveTeam(bm.homeSeed) : null,
    away_team_id: bm.stage === 'r32' ? resolveTeam(bm.awaySeed) : null,
  }))

  const CHUNK = 10
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('matches').insert(rows.slice(i, i + CHUNK))
    if (error) return { ok: false, error: `Wedstrijden aanmaken: ${error.message}` }
  }

  revalidatePath('/admin')
  revalidatePath('/knockout')
  return { ok: true }
}

// ─── Verwijder alle KO-wedstrijden en reset bijbehorende punten ───────────────
export async function clearKoResults(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const KO_STAGES = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']

  // Haal KO-match-IDs op
  const { data: koMatches } = await supabase
    .from('matches')
    .select('id')
    .in('stage', KO_STAGES)

  if (!koMatches?.length) return { ok: false, error: 'Geen KO-wedstrijden gevonden.' }

  const koMatchIds = koMatches.map((m) => m.id)

  // Reset knockout_predictions punten
  const { error: koPredErr } = await supabase
    .from('knockout_predictions')
    .update({ points_awarded: null })
    .in('match_id', koMatchIds)
  if (koPredErr) return { ok: false, error: `KO-voorspellingen: ${koPredErr.message}` }

  // Reset bracket_predictions punten (alle slots)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: bracketErr } = await (supabase as any)
    .from('bracket_predictions')
    .update({ points_awarded: null })
    .not('slot', 'is', null)
  if (bracketErr) return { ok: false, error: `Bracket: ${bracketErr.message}` }

  // Verwijder alle KO-wedstrijden (CASCADE verwijdert knockout_predictions ook)
  const { error: matchErr } = await supabase
    .from('matches')
    .delete()
    .in('stage', KO_STAGES)
  if (matchErr) return { ok: false, error: `KO-wedstrijden verwijderen: ${matchErr.message}` }

  // Herbereken klassement (KO-punten zijn nu 0)
  const { data: affectedMembers } = await supabase
    .from('poule_members')
    .select('user_id')
  const userIds = [...new Set((affectedMembers ?? []).map((m) => m.user_id))]
  if (userIds.length > 0) await recalcPouleScores(supabase, userIds)

  revalidatePath('/admin')
  revalidatePath('/knockout')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── Herscore bracket-voorspellingen met het nieuwe doorstroom-model ──────────
export async function rescoreBracket(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const stages = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']
  const affectedUserIds = new Set<string>()

  for (const stage of stages) {
    const users = await scoreBracketAdvancement(supabase, stage)
    users.forEach((u) => affectedUserIds.add(u))
  }

  if (affectedUserIds.size > 0) {
    await recalcPouleScores(supabase, [...affectedUserIds])
  }

  revalidatePath('/admin')
  revalidatePath('/knockout')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── Simuleer volledige KO-fase in één klik ───────────────────────────────────
// Vult alle rondes achter elkaar: R32 → R16 → KF → HF → Finale
// Vereist dat ko:create al gedraaid heeft (KO-wedstrijden bestaan in DB).
export async function simulateFullKo(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const db = createServiceClient()
  const affectedUserIds = new Set<string>()
  let totalFilled = 0
  const MAX_PASSES = 10 // veiligheidsgrens

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // Zoek KO-wedstrijden met teams maar nog geen uitslag
    const { data: open } = await supabase
      .from('matches')
      .select('id, stage, home_team_id, away_team_id')
      .in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])
      .eq('result_entered', false)
      .not('home_team_id', 'is', null)
      .not('away_team_id', 'is', null)
      .order('match_number')

    if (!open || open.length === 0) {
      // Probeer volgende ronde teams toe te wijzen en ga opnieuw
      const assignResult = await assignNextKoRoundTeams()
      if (!assignResult.ok) break // geen teams meer toe te wijzen → klaar
      continue
    }

    for (const match of open) {
      // Genereer willekeurige uitslag met gegarandeerde winnaar
      let homeScore = Math.floor(Math.random() * 4)
      let awayScore = Math.floor(Math.random() * 4)
      if (homeScore === awayScore) {
        // Verlengingstijd: willekeurig een winnaar
        if (Math.random() < 0.5) { homeScore++ } else { awayScore++ }
      }
      const winnerId = homeScore > awayScore ? match.home_team_id! : match.away_team_id!

      const { error: mErr } = await supabase
        .from('matches')
        .update({ home_score: homeScore, away_score: awayScore, result_entered: true })
        .eq('id', match.id)
      if (mErr) return { ok: false, error: `KO match update mislukt: ${mErr.message}` }

      const pointsForRound = KO_POINTS[match.stage] ?? 0

      const { data: preds } = await supabase
        .from('knockout_predictions')
        .select('id, user_id, predicted_winner_id')
        .eq('match_id', match.id)

      if (preds && preds.length > 0) {
        for (const pred of preds) {
          const pts = pred.predicted_winner_id === winnerId ? pointsForRound : 0
          await supabase.from('knockout_predictions').update({ points_awarded: pts }).eq('id', pred.id)
          affectedUserIds.add(pred.user_id)
        }
      }

      totalFilled++
    }

    // Huidige ronde volledig → teams volgende ronde toewijzen
    const currentStage = open[0].stage
    await assignNextKoRoundTeams()

    // Bracket-scoring: nu de volgende ronde teams bekend zijn, score de picks voor de huidige ronde
    // (ronde-gebaseerd: welke ploegen gaan door ongeacht slot)
    const bracketUsers = await scoreBracketAdvancement(supabase, currentStage)
    bracketUsers.forEach((u) => affectedUserIds.add(u))
  }

  if (totalFilled > 0) {
    await recalcPouleScores(supabase, [...affectedUserIds])
  }

  revalidatePath('/admin')
  revalidatePath('/knockout')
  revalidatePath('/poules')

  if (totalFilled === 0) {
    return { ok: false, error: 'Geen KO-wedstrijden gevonden. Voer eerst npm run ko:create uit.' }
  }
  return { ok: true }
}

// ─── Deelnemers: actief/inactief ──────────────────────────────────────────────
// Inactieve deelnemers worden uit alle klassementen gefilterd.
export async function setDeelnemerActive(userId: string, isActive: boolean): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId)

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/admin')
  revalidatePath('/poules')
  return { ok: true }
}

// ─── GOAT-duel: doelpuntenstand Messi vs Ronaldo beheren ──────────────────────
export async function setGoatGoals(messiGoals: number, ronaldoGoals: number): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const messi = Math.max(0, Math.floor(messiGoals))
  const ronaldo = Math.max(0, Math.floor(ronaldoGoals))

  // app_settings heeft alleen een SELECT-policy — schrijven via de service role
  const service = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (service as any)
    .from('app_settings')
    .upsert(
      [
        { key: 'goat_messi_goals', value: String(messi), updated_at: new Date().toISOString() },
        { key: 'goat_ronaldo_goals', value: String(ronaldo), updated_at: new Date().toISOString() },
      ],
      { onConflict: 'key' }
    )

  if (error) return { ok: false, error: 'Opslaan mislukt.' }

  revalidatePath('/goat')
  revalidatePath('/admin')
  return { ok: true }
}
