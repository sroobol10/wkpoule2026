'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { KO_POINTS } from '@/lib/constants'
import { BRACKET, assignThirdPlaceSlots } from '@/lib/bracket'
import { sortGroupStandings, type TeamStat } from '@/lib/group-standings'

type AdminResult = { ok: true } | { ok: false; error: string }

// PostgREST levert standaard max. 1000 rijen — paginate bij bulk-fetches.
async function fetchAllAdmin<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await make(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

// Voer taken parallel uit met een begrensde concurrency (voorkomt dat we de
// database overspoelen, maar veel sneller dan strikt sequentieel).
async function runPool<T>(items: T[], limit: number, fn: (item: T) => PromiseLike<unknown>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  })
  await Promise.all(workers)
}

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

  // Wedstrijden van deze ronde ophalen. We scoren de bracket-picks pas wanneer de
  // héle ronde gespeeld is — dan staan alle doorgangers vast (winnaars van de ronde).
  const { data: roundMatches } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, result_entered')
    .eq('stage', stage)
  if (!roundMatches || roundMatches.length === 0) return []

  const allDone = roundMatches.every((m) => m.result_entered && m.home_score != null && m.away_score != null)
  if (!allDone) return []

  // Doorgestoten teams = winnaars van deze ronde (voor final/troostfinale idem: de winnaar)
  const advancedTeams = new Set<string>()
  for (const m of roundMatches) {
    const w = (m.home_score ?? 0) > (m.away_score ?? 0) ? m.home_team_id : m.away_team_id
    if (w) advancedTeams.add(w)
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
  const correctIds: string[] = []
  const wrongIds: string[] = []
  for (const pick of picks as { id: string; user_id: string; predicted_team_id: string }[]) {
    ;(advancedTeams.has(pick.predicted_team_id) ? correctIds : wrongIds).push(pick.id)
    affectedUsers.push(pick.user_id)
  }
  // Twee bulk-updates i.p.v. één per pick
  await Promise.all([
    correctIds.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any).from('bracket_predictions').update({ points_awarded: pointsForStage }).in('id', correctIds)
      : Promise.resolve(),
    wrongIds.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any).from('bracket_predictions').update({ points_awarded: 0 }).in('id', wrongIds)
      : Promise.resolve(),
  ])
  return affectedUsers
}

// ─── Point system ─────────────────────────────────────────────────────────────
// Exact score:                               5 pt
// Correct result + één doelpunttotaal klopt: 3 pt
// Correct result:                            2 pt
// Fout resultaat + één doelpunttotaal klopt: 1 pt
// Fout:                                      0 pt
// KO winner: zie KO_POINTS (5/15/25/50/100 per ronde)
// Group advancement: 5 pt per correct eindpositie

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

  // Snapshot huidige rangschikking per poule (vóór de update) — parallel
  const oldRankMap: Record<string, Record<string, number>> = {}
  await Promise.all(affectedPouleIds.map(async (pouleId) => {
    const { data: cur } = await supabase
      .from('poule_scores')
      .select('user_id, total_pts')
      .eq('poule_id', pouleId)
      .order('total_pts', { ascending: false })
    if (cur) {
      oldRankMap[pouleId] = {}
      cur.forEach((s, i) => { oldRankMap[pouleId][s.user_id] = i + 1 })
    }
  }))

  // Haal pre-tournament vraag-IDs eenmalig op voor bonus-opsplitsing
  const { data: preQRows } = await supabase
    .from('bonus_questions')
    .select('id')
    .eq('type', 'pre_tournament')
  const preQuestionIds = new Set((preQRows ?? []).map((q) => q.id))

  // ── Bulk-fetch alle scoringsdata voor álle betrokken gebruikers in één keer ──
  // Voorheen deden we per gebruiker 6 queries + per-poule upserts (sequentieel),
  // wat bij ~65 deelnemers honderden round-trips opleverde (~30s). Nu halen we
  // alles in 6 gepagineerde bulk-queries op en schrijven in batches weg.
  type PredRow = {
    user_id: string
    points_awarded: number | null
    predicted_home: number
    predicted_away: number
    match: { home_score: number | null; away_score: number | null; result_entered: boolean } | null
  }
  const [preds, koPreds, advancement, bonuses, jokerRows, bracketRows] = await Promise.all([
    fetchAllAdmin<PredRow>((from, to) => supabase.from('predictions')
      .select('user_id, points_awarded, predicted_home, predicted_away, match:matches!predictions_match_id_fkey(home_score, away_score, result_entered)')
      .in('user_id', userIds).not('points_awarded', 'is', null).range(from, to)),
    fetchAllAdmin<{ user_id: string; points_awarded: number | null }>((from, to) => supabase.from('knockout_predictions')
      .select('user_id, points_awarded').in('user_id', userIds).not('points_awarded', 'is', null).range(from, to)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllAdmin<{ user_id: string; points: number | null }>((from, to) => (supabase as any).from('group_standings_scores')
      .select('user_id, points').in('user_id', userIds).range(from, to)),
    fetchAllAdmin<{ user_id: string; points_awarded: number | null; question_id: string }>((from, to) => supabase.from('bonus_answers')
      .select('user_id, points_awarded, question_id').in('user_id', userIds).not('points_awarded', 'is', null).range(from, to)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllAdmin<{ user_id: string; match: { result_entered: boolean } | null }>((from, to) => supabase.from('jokers')
      .select('user_id, match:matches!jokers_match_id_fkey(result_entered)').in('user_id', userIds).range(from, to)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllAdmin<{ user_id: string; points_awarded: number | null }>((from, to) => (supabase as any).from('bracket_predictions')
      .select('user_id, points_awarded').in('user_id', userIds).not('points_awarded', 'is', null).range(from, to)),
  ])

  // Groepeer per gebruiker
  const groupBy = <T extends { user_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of rows) {
      const arr = m.get(r.user_id) ?? []
      arr.push(r)
      m.set(r.user_id, arr)
    }
    return m
  }
  const predsByUser   = groupBy(preds)
  const koByUser      = groupBy(koPreds)
  const advByUser     = groupBy(advancement)
  const bonusByUser   = groupBy(bonuses)
  const jokersByUser  = groupBy(jokerRows)
  const bracketByUser = groupBy(bracketRows)
  const poulesByUser  = new Map<string, string[]>()
  for (const m of memberships) {
    const arr = poulesByUser.get(m.user_id) ?? []
    arr.push(m.poule_id)
    poulesByUser.set(m.user_id, arr)
  }

  // Bereken per gebruiker en bouw alle upsert-rijen op
  type ScoredPred = {
    predicted_home: number
    predicted_away: number
    match: { home_score: number | null; away_score: number | null; result_entered: boolean } | null
  }
  type ScoreRow = {
    user_id: string; poule_id: string; total_pts: number; exact_hits: number; correct_results: number
    group_match_pts: number; group_standings_pts: number; knockout_pts: number
    bonus_pre_pts: number; bonus_daily_pts: number; jokers_played: number
  }
  const upsertRows: ScoreRow[] = []
  for (const userId of userIds) {
    const uPreds   = predsByUser.get(userId)   ?? []
    const uKo      = koByUser.get(userId)      ?? []
    const uAdv     = advByUser.get(userId)     ?? []
    const uBonus   = bonusByUser.get(userId)   ?? []
    const uJokers  = jokersByUser.get(userId)  ?? []
    const uBracket = bracketByUser.get(userId) ?? []

    const groupMatchPts     = uPreds.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    // Eindstand-punten tellen mee zodra een groep gescoord is — group_advancement
    // krijgt alleen points_awarded via scoreGroupAdvancement, en dat gebeurt pas
    // als die groep volledig (6/6) gespeeld is. Dus deze waarden zijn al definitief.
    const groupStandingsPts = uAdv.reduce((s, r) => s + (r.points ?? 0), 0)
    const knockoutPts       = uKo.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
                            + uBracket.reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const bonusPrePts       = uBonus.filter((b) => preQuestionIds.has(b.question_id))
                                .reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const bonusDailyPts     = uBonus.filter((b) => !preQuestionIds.has(b.question_id))
                                .reduce((s, r) => s + (r.points_awarded ?? 0), 0)
    const jokersPlayed      = uJokers.filter((j) => j.match?.result_entered === true).length

    const totalPts = groupMatchPts + groupStandingsPts + knockoutPts + bonusPrePts + bonusDailyPts

    // Exact/correct op basis van de echte uitslag — niet op puntwaarden,
    // want jokers verdubbelen de punten (richting+1 mét joker = 6 ≠ exact)
    const scored = (uPreds as unknown as ScoredPred[]).filter(
      (r) => r.match?.result_entered && r.match.home_score != null && r.match.away_score != null
    )
    const isExact = (r: ScoredPred) =>
      r.predicted_home === r.match!.home_score && r.predicted_away === r.match!.away_score
    const exactHits      = scored.filter(isExact).length
    const correctResults = scored.filter(
      (r) => !isExact(r) && Math.sign(r.predicted_home - r.predicted_away) === Math.sign((r.match!.home_score ?? 0) - (r.match!.away_score ?? 0))
    ).length

    for (const pouleId of poulesByUser.get(userId) ?? []) {
      upsertRows.push({
        user_id: userId, poule_id: pouleId,
        total_pts: totalPts, exact_hits: exactHits, correct_results: correctResults,
        group_match_pts: groupMatchPts, group_standings_pts: groupStandingsPts,
        knockout_pts: knockoutPts, bonus_pre_pts: bonusPrePts, bonus_daily_pts: bonusDailyPts,
        jokers_played: jokersPlayed,
      })
    }
  }

  // Bulk-upsert in batches
  const CHUNK = 200
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    await supabase.from('poule_scores').upsert(upsertRows.slice(i, i + CHUNK), { onConflict: 'user_id,poule_id' })
  }

  // Bereken nieuwe rangschikking en sla rank_change op (per poule parallel,
  // updates met begrensde concurrency)
  await Promise.all(affectedPouleIds.map(async (pouleId) => {
    const { data: updated } = await supabase
      .from('poule_scores')
      .select('user_id, total_pts')
      .eq('poule_id', pouleId)
      .order('total_pts', { ascending: false })
    if (!updated) return

    const oldRanks = oldRankMap[pouleId] ?? {}
    const changes = updated.map((row, i) => {
      const oldRank = oldRanks[row.user_id] ?? null
      return { uid: row.user_id, rankChange: oldRank != null ? oldRank - (i + 1) : null }
    })
    await runPool(changes, 12, (c) =>
      supabase.from('poule_scores').update({ rank_change: c.rankChange }).eq('poule_id', pouleId).eq('user_id', c.uid)
    )
  }))
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

    // Groepeer voorspellingen op puntenwaarde → één update per waarde i.p.v.
    // één per voorspelling (scheelt tientallen round-trips per wedstrijd).
    const idsByPts = new Map<number, string[]>()
    for (const pred of preds) {
      const base = calcMatchPoints(homeScore, awayScore, pred.predicted_home, pred.predicted_away)
      const pts  = base * (jokerUserIds.has(pred.user_id) ? 2 : 1)
      const arr = idsByPts.get(pts) ?? []
      arr.push(pred.id)
      idsByPts.set(pts, arr)
    }
    await Promise.all(
      [...idsByPts.entries()].map(([pts, ids]) =>
        supabase.from('predictions').update({ points_awarded: pts }).in('id', ids)
      )
    )
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

    const idsByPts = new Map<number, string[]>()
    for (const ans of answers) {
      let pts: number
      if (isGedoseerd && !isNaN(correctNum)) {
        const userNum = parseInt(ans.answer.trim(), 10)
        pts = isNaN(userNum) ? 0 : Math.max(0, 10 - Math.abs(userNum - correctNum))
      } else {
        pts = ans.answer.trim().toLowerCase() === normalized ? pointsForCorrect : 0
      }
      const arr = idsByPts.get(pts) ?? []
      arr.push(ans.id)
      idsByPts.set(pts, arr)
    }
    await Promise.all(
      [...idsByPts.entries()].map(([pts, ids]) =>
        supabase.from('bonus_answers').update({ points_awarded: pts }).in('id', ids)
      )
    )
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
    .select('stage, home_team_id, away_team_id')
    .single()

  if (error || !match) return { ok: false, error: 'Opslaan mislukt.' }

  const pointsForRound = KO_POINTS[match.stage] ?? 0
  const loserId = match.home_team_id === winnerId ? match.away_team_id : match.home_team_id

  const affectedUsers = new Set<string>()

  // (Optioneel) per-wedstrijd knockout_predictions scoren — meestal leeg.
  const { data: preds } = await supabase
    .from('knockout_predictions')
    .select('id, user_id, predicted_winner_id')
    .eq('match_id', matchId)
  if (preds && preds.length > 0) {
    const correctIds: string[] = []
    const wrongIds: string[] = []
    for (const pred of preds) {
      ;(pred.predicted_winner_id === winnerId ? correctIds : wrongIds).push(pred.id)
      affectedUsers.add(pred.user_id)
    }
    await Promise.all([
      correctIds.length ? supabase.from('knockout_predictions').update({ points_awarded: pointsForRound }).in('id', correctIds) : Promise.resolve(),
      wrongIds.length ? supabase.from('knockout_predictions').update({ points_awarded: 0 }).in('id', wrongIds) : Promise.resolve(),
    ])
  }

  // Bracket-voorspellingen direct scoren voor de twee landen die net speelden:
  // wie de winnaar koos krijgt de rondepunten, wie de verliezer koos krijgt 0.
  // (Andere picks worden gescoord zodra hún wedstrijd is ingevoerd.)
  if (pointsForRound > 0) {
    const slotsInStage = BRACKET.filter((b) => b.stage === match.stage).map((b) => b.slot)
    const teamIds = [winnerId, loserId].filter(Boolean) as string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: picks } = await (supabase as any)
      .from('bracket_predictions')
      .select('id, user_id, predicted_team_id')
      .in('slot', slotsInStage)
      .in('predicted_team_id', teamIds)
    const correctIds: string[] = []
    const wrongIds: string[] = []
    for (const p of (picks ?? []) as { id: string; user_id: string; predicted_team_id: string }[]) {
      ;(p.predicted_team_id === winnerId ? correctIds : wrongIds).push(p.id)
      affectedUsers.add(p.user_id)
    }
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      correctIds.length ? (supabase as any).from('bracket_predictions').update({ points_awarded: pointsForRound }).in('id', correctIds) : Promise.resolve(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wrongIds.length ? (supabase as any).from('bracket_predictions').update({ points_awarded: 0 }).in('id', wrongIds) : Promise.resolve(),
    ])
  }

  // Winnaar(s) automatisch doorzetten naar de volgende ronde (vult de fixtures zodra
  // beide feeders gespeeld zijn).
  await propagateKoTeams(supabase)

  // Sluitstuk: zodra de héle ronde gespeeld is, alle resterende picks consistent zetten.
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

  // Ook eindstand-punten resetten (zodat ze niet doorsijpelen bij herberekening)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: advErr } = await (supabase as any)
    .from('group_standings_scores')
    .delete()
    .not('user_id', 'is', null)
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

// ─── Score eindstand van een afgeronde groep ───────────────────────────────────
// Roep aan nadat alle 6 groepswedstrijden een resultaat hebben.
// Vergelijkt per gebruiker zijn voorspelde eindstand (afgeleid uit zijn
// voorspelde uitslagen) met de werkelijke eindstand en kent 5 pt toe per correct
// voorspelde positie (alle 4 plekken). Resultaat in group_standings_scores.
export async function scoreGroupAdvancement(group: string): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }

  const { data: groupMatches } = await supabase
    .from('matches')
    .select('id, home_score, away_score, home_team:teams!home_team_id(id, name, group_name), away_team:teams!away_team_id(id, name, group_name)')
    .eq('stage', 'group')
    .eq('result_entered', true)

  if (!groupMatches) return { ok: false, error: 'Ophalen mislukt.' }

  type TeamRef = { id: string; name: string; group_name: string }
  const gm = groupMatches.filter((m) => (m.home_team as TeamRef | null)?.group_name === group)
  if (gm.length === 0) return { ok: false, error: `Geen resultaten voor groep ${group}.` }

  // Alle 6 wedstrijden in de groep moeten gespeeld zijn (4 teams × 3 duels / 2 = 6)
  if (gm.length < 6) {
    return { ok: false, error: `Groep ${group} is nog niet volledig gespeeld (${gm.length}/6 wedstrijden).` }
  }

  // Werkelijke eindstand
  const st: Record<string, TeamStat> = {}
  const teamNames: Record<string, string> = {}
  const h2hMatches: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }[] = []
  for (const m of gm) {
    const ht = m.home_team as TeamRef | null
    const at = m.away_team as TeamRef | null
    if (!ht || !at) continue
    teamNames[ht.id] = ht.name; teamNames[at.id] = at.name
    st[ht.id] ??= { points: 0, gd: 0, gf: 0 }
    st[at.id] ??= { points: 0, gd: 0, gf: 0 }
    const h = m.home_score!, a = m.away_score!
    h2hMatches.push({ homeTeamId: ht.id, awayTeamId: at.id, homeGoals: h, awayGoals: a })
    st[ht.id].gf += h; st[ht.id].gd += h - a
    st[at.id].gf += a; st[at.id].gd += a - h
    if (h > a) st[ht.id].points += 3
    else if (h < a) st[at.id].points += 3
    else { st[ht.id].points += 1; st[at.id].points += 1 }
  }

  // Zelfde FIFA-tiebreak als de client gebruikt bij het opslaan van de voorspelde
  // posities (H2H → H2H-saldo → H2H-doelpunten → totaal saldo → doelpunten →
  // FIFA-ranking). Een simpele sort op punten/saldo/doelpunten wijkt bij gelijke
  // standen af van de voorspelling, waardoor terecht voorspelde posities 0 pt
  // zouden krijgen.
  const sorted = sortGroupStandings(Object.entries(st) as [string, TeamStat][], h2hMatches, teamNames)
  const actualPosition: Record<string, number> = {}
  sorted.forEach(([teamId], i) => { actualPosition[teamId] = i + 1 })

  // Voorspelde eindstand per gebruiker afleiden uit zijn voorspelde uitslagen en
  // alle 4 posities vergelijken met de werkelijke eindstand (5 pt per correcte
  // positie). Losgekoppeld van group_advancement (dat alleen de doorgangers
  // bevat t.b.v. de bracket) zodat ook positie 3 en 4 meetellen.
  const matchTeams: Record<string, { home: string; away: string }> = {}
  for (const m of gm) {
    const ht = m.home_team as TeamRef | null
    const at = m.away_team as TeamRef | null
    if (ht && at) matchTeams[m.id] = { home: ht.id, away: at.id }
  }
  const matchIds = gm.map((m) => m.id)

  const { data: preds } = await supabase
    .from('predictions')
    .select('user_id, match_id, predicted_home, predicted_away')
    .in('match_id', matchIds)

  if (!preds || preds.length === 0) return { ok: true }

  const predsByUser = new Map<string, typeof preds>()
  for (const p of preds) {
    const arr = predsByUser.get(p.user_id) ?? []
    arr.push(p)
    predsByUser.set(p.user_id, arr)
  }

  const rows: { user_id: string; group_name: string; points: number }[] = []
  for (const [userId, ps] of predsByUser) {
    // Alleen scoren als de gebruiker alle 6 wedstrijden van de groep voorspelde
    if (ps.length < 6) {
      rows.push({ user_id: userId, group_name: group, points: 0 })
      continue
    }
    const pst: Record<string, TeamStat> = {}
    const pH2H: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }[] = []
    for (const p of ps) {
      const t = matchTeams[p.match_id]
      if (!t) continue
      pst[t.home] ??= { points: 0, gd: 0, gf: 0 }
      pst[t.away] ??= { points: 0, gd: 0, gf: 0 }
      const h = p.predicted_home, a = p.predicted_away
      pH2H.push({ homeTeamId: t.home, awayTeamId: t.away, homeGoals: h, awayGoals: a })
      pst[t.home].gf += h; pst[t.home].gd += h - a
      pst[t.away].gf += a; pst[t.away].gd += a - h
      if (h > a) pst[t.home].points += 3
      else if (h < a) pst[t.away].points += 3
      else { pst[t.home].points += 1; pst[t.away].points += 1 }
    }
    const pSorted = sortGroupStandings(Object.entries(pst) as [string, TeamStat][], pH2H, teamNames)
    let correct = 0
    pSorted.forEach(([teamId], i) => { if (actualPosition[teamId] === i + 1) correct++ })
    rows.push({ user_id: userId, group_name: group, points: correct * 5 })
  }

  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('group_standings_scores').upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,group_name' })
  }

  await recalcPouleScores(supabase, [...predsByUser.keys()])

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
  const idsByPts = new Map<number, string[]>()
  for (const ans of answers) {
    const pts = pointsByName[ans.answer.trim()] ?? 0
    const arr = idsByPts.get(pts) ?? []
    arr.push(ans.id)
    idsByPts.set(pts, arr)
    affectedUserIds.add(ans.user_id)
  }
  await Promise.all(
    [...idsByPts.entries()].map(([pts, ids]) =>
      supabase.from('bonus_answers').update({ points_awarded: pts }).in('id', ids)
    )
  )

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
// Zet winnaars door naar de volgende ronde: vult elke KO-wedstrijd waarvan beide
// 'feeders' (vorige ronde) gespeeld zijn met de juiste teams. Cascadeert door alle
// rondes. Retourneert hoeveel wedstrijden zijn ingevuld. Herbruikbaar én idempotent.
async function propagateKoTeams(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  // Haal alle KO-wedstrijden op (admin heeft SELECT op alle matches)
  const { data: koMatches } = await supabase
    .from('matches')
    .select('id, match_number, stage, home_team_id, away_team_id, home_score, away_score, result_entered')
    .in('stage', ['r32', 'r16', 'qf', 'sf', 'third_place', 'final'])
    .order('match_number')

  if (!koMatches || koMatches.length === 0) return 0

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

  // Vul alle rondes met null-teams die nu wél op te lossen zijn (cascade in volgorde)
  const stageOrder = ['r32', 'r16', 'qf', 'sf', 'third_place', 'final']
  let updated = 0

  for (const stage of stageOrder) {
    const stageMatches = BRACKET.filter((bm) => bm.stage === stage)
    for (const bm of stageMatches) {
      const m = matchBySlot[bm.slot]
      if (!m || (m.home_team_id && m.away_team_id)) continue
      const homeId = resolveTeam(bm.homeSeed)
      const awayId = resolveTeam(bm.awaySeed)
      if (!homeId || !awayId) continue
      await supabase.from('matches').update({ home_team_id: homeId, away_team_id: awayId }).eq('id', m.id)
      m.home_team_id = homeId; m.away_team_id = awayId   // in-memory zodat latere rondes meeliften
      updated++
    }
  }
  return updated
}

// Admin-actie: winnaars handmatig doorzetten (fallback; gebeurt nu ook automatisch
// bij het invoeren van een KO-uitslag).
export async function assignNextKoRoundTeams(): Promise<AdminResult> {
  const { supabase } = await assertAdmin()
  if (!supabase) return { ok: false, error: 'Geen toegang.' }
  const updated = await propagateKoTeams(supabase)
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
