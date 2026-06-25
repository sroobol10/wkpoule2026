import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PADEL_USERNAMES, isPadelUser } from '@/lib/padel'
import PadelclubClient, { type PadelPlayer, type DayMatch, type DayQuestion } from './padelclub-client'

export const metadata = { title: 'Padel Club · WK Poule 2026' }

type PredRow = {
  user_id: string
  predicted_home: number
  predicted_away: number
  points_awarded: number | null
  match: { id: string; home_score: number | null; away_score: number | null; result_entered: boolean } | null
}

export default async function PadelclubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Toegangscontrole: alleen de vier padelclub-leden (hoofdletter-ongevoelig)
  const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (!isPadelUser(me?.username)) redirect('/poules')

  // De vier profielen, in vaste volgorde — hoofdletter-ongevoelig matchen
  const orFilter = PADEL_USERNAMES.map((u) => `username.ilike.${u}`).join(',')
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .or(orFilter)
  const ordered = PADEL_USERNAMES
    .map((u) => (profs ?? []).find((p) => p.username.toLowerCase() === u))
    .filter((p): p is NonNullable<typeof p> => !!p)
  const playerIds = ordered.map((p) => p.id)

  // Scores uit de algemene poule (totalen + opsplitsing)
  const { data: generalPoule } = await supabase.from('poules').select('id').eq('is_general', true).limit(1).maybeSingle()
  type ScoreRow = {
    user_id: string; total_pts: number; group_match_pts: number; group_standings_pts: number
    knockout_pts: number; bonus_pre_pts: number; bonus_daily_pts: number
    jokers_played: number; exact_hits: number; correct_results: number
  }
  const { data: scoreRows } = generalPoule
    ? await supabase
        .from('poule_scores')
        .select('user_id, total_pts, group_match_pts, group_standings_pts, knockout_pts, bonus_pre_pts, bonus_daily_pts, jokers_played, exact_hits, correct_results')
        .eq('poule_id', generalPoule.id)
        .in('user_id', playerIds)
    : { data: [] }
  const scoreById: Record<string, ScoreRow> = {}
  for (const s of (scoreRows ?? []) as ScoreRow[]) scoreById[s.user_id] = s

  // Voorspellingen + jokers voor live exact/toto/jokerpunten
  const predSelect = `
    user_id, predicted_home, predicted_away, points_awarded,
    match:matches!predictions_match_id_fkey(id, home_score, away_score, result_entered)
  `
  const [{ data: preds }, { data: jokers }] = await Promise.all([
    supabase.from('predictions').select(predSelect).in('user_id', playerIds),
    supabase.from('jokers').select('user_id, match_id').in('user_id', playerIds),
  ])
  const jokerSetByUser: Record<string, Set<string>> = {}
  for (const j of (jokers ?? []) as { user_id: string; match_id: string }[]) {
    ;(jokerSetByUser[j.user_id] ??= new Set()).add(j.match_id)
  }
  const liveStats: Record<string, { exact: number; toto: number; jokerPts: number }> = {}
  for (const id of playerIds) liveStats[id] = { exact: 0, toto: 0, jokerPts: 0 }
  for (const p of (preds ?? []) as unknown as PredRow[]) {
    const m = p.match
    if (!m) continue
    const st = liveStats[p.user_id]
    if (!st) continue
    if (jokerSetByUser[p.user_id]?.has(m.id)) st.jokerPts += (p.points_awarded ?? 0) / 2
    if (!m.result_entered || m.home_score == null || m.away_score == null) continue
    if (p.predicted_home === m.home_score && p.predicted_away === m.away_score) st.exact++
    if (Math.sign(p.predicted_home - p.predicted_away) === Math.sign(m.home_score - m.away_score)) st.toto++
  }

  const players: PadelPlayer[] = ordered.map((p) => {
    const s = scoreById[p.id]
    const live = liveStats[p.id] ?? { exact: 0, toto: 0, jokerPts: 0 }
    return {
      id: p.id,
      username: p.username,
      fullName: p.full_name,
      avatarUrl: p.avatar_url,
      totalPts: s?.total_pts ?? 0,
      groupMatchPts: s?.group_match_pts ?? 0,
      groupStandingsPts: s?.group_standings_pts ?? 0,
      knockoutPts: s?.knockout_pts ?? 0,
      bonusPrePts: s?.bonus_pre_pts ?? 0,
      bonusDailyPts: s?.bonus_daily_pts ?? 0,
      jokersPlayed: s?.jokers_played ?? 0,
      jokerPts: Math.round(live.jokerPts),
      exactHits: live.exact,
      correctResults: live.toto,
    }
  })

  // ── Dagdashboard: de meest recente speeldag (≤ vandaag) ──────────────────────
  // "Dag" = CEST-kalenderdag, net als het Dagoverzicht. We tonen de dag-bonusvraag
  // van die dag + alle voorspelde uitslagen van de wedstrijden op die dag.
  const cestMs = Date.now() + 2 * 60 * 60 * 1000
  const todayCest = new Date(cestMs).toISOString().slice(0, 10)
  const todayEndUtc = new Date(new Date(todayCest + 'T00:00:00Z').getTime() - 2 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000)

  // Meest recente wedstrijd t/m vandaag → bepaalt de te tonen speeldag
  const { data: lastM } = await supabase
    .from('matches')
    .select('kickoff_at')
    .lt('kickoff_at', todayEndUtc.toISOString())
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const refMs = lastM ? new Date(lastM.kickoff_at).getTime() + 2 * 60 * 60 * 1000 : cestMs
  const dayCest = new Date(refMs).toISOString().slice(0, 10)
  const dayStartUtc = new Date(new Date(dayCest + 'T00:00:00Z').getTime() - 2 * 60 * 60 * 1000)
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000)

  // Wedstrijden van die dag
  const { data: dayMatchRows } = await supabase
    .from('matches')
    .select(`
      id, kickoff_at, stage, home_score, away_score, result_entered,
      home_team:teams!matches_home_team_id_fkey(id, name, flag_url),
      away_team:teams!matches_away_team_id_fkey(id, name, flag_url)
    `)
    .gte('kickoff_at', dayStartUtc.toISOString())
    .lt('kickoff_at', dayEndUtc.toISOString())
    .order('kickoff_at')
  type MTeam = { id: string; name: string; flag_url: string | null } | null
  type MRow = {
    id: string; kickoff_at: string; stage: string
    home_score: number | null; away_score: number | null; result_entered: boolean
    home_team: MTeam; away_team: MTeam
  }
  const dayMatchesRaw = (dayMatchRows ?? []) as unknown as MRow[]
  const dayMatchIds = dayMatchesRaw.map((m) => m.id)

  // Voorspellingen (groep) en KO-keuzes van de vier voor die wedstrijden
  const [{ data: dayPreds }, { data: dayKo }] = await Promise.all([
    dayMatchIds.length
      ? supabase.from('predictions').select('user_id, match_id, predicted_home, predicted_away, points_awarded').in('user_id', playerIds).in('match_id', dayMatchIds)
      : Promise.resolve({ data: [] as { user_id: string; match_id: string; predicted_home: number; predicted_away: number; points_awarded: number | null }[] }),
    dayMatchIds.length
      ? supabase.from('knockout_predictions').select('user_id, match_id, predicted_winner_id, points_awarded').in('user_id', playerIds).in('match_id', dayMatchIds)
      : Promise.resolve({ data: [] as { user_id: string; match_id: string; predicted_winner_id: string; points_awarded: number | null }[] }),
  ])
  const predByKey: Record<string, { h: number; a: number; pts: number | null }> = {}
  for (const p of dayPreds ?? []) predByKey[`${p.user_id}:${p.match_id}`] = { h: p.predicted_home, a: p.predicted_away, pts: p.points_awarded }
  const koByKey: Record<string, { winnerId: string; pts: number | null }> = {}
  for (const k of dayKo ?? []) koByKey[`${k.user_id}:${k.match_id}`] = { winnerId: k.predicted_winner_id, pts: k.points_awarded }

  const dayMatches: DayMatch[] = dayMatchesRaw.map((m) => {
    const home = m.home_team, away = m.away_team
    return {
      id: m.id,
      time: m.kickoff_at,
      home: home ? { name: home.name, flag: home.flag_url } : null,
      away: away ? { name: away.name, flag: away.flag_url } : null,
      actual: m.result_entered ? `${m.home_score}–${m.away_score}` : null,
      preds: Object.fromEntries(
        playerIds.map((id) => {
          if (m.stage === 'group') {
            const p = predByKey[`${id}:${m.id}`]
            return [id, { text: p ? `${p.h}–${p.a}` : null, pts: p?.pts ?? null }]
          }
          const k = koByKey[`${id}:${m.id}`]
          const winnerName = k?.winnerId === home?.id ? home?.name : k?.winnerId === away?.id ? away?.name : null
          return [id, { text: winnerName ?? null, pts: k?.pts ?? null }]
        })
      ),
    }
  })

  // Dag-bonusvraag van die dag + de vier antwoorden
  const { data: dqRows } = await supabase
    .from('bonus_questions')
    .select('id, question, correct_answer, correct_answer_set')
    .eq('type', 'daily')
    .eq('unlock_date', dayCest)
  const dq = (dqRows ?? [])[0] ?? null
  let dayQuestion: DayQuestion = null
  if (dq) {
    const { data: dqAnswers } = await supabase
      .from('bonus_answers')
      .select('user_id, answer, points_awarded')
      .eq('question_id', dq.id)
      .in('user_id', playerIds)
    const ansByUser: Record<string, { answer: string; points_awarded: number | null }> = {}
    for (const a of dqAnswers ?? []) ansByUser[a.user_id] = { answer: a.answer, points_awarded: a.points_awarded }
    dayQuestion = {
      question: dq.question,
      correctAnswer: dq.correct_answer_set ? dq.correct_answer : null,
      answers: Object.fromEntries(playerIds.map((id) => [id, {
        answer: ansByUser[id]?.answer ?? null,
        pts: ansByUser[id]?.points_awarded ?? null,
      }])),
    }
  }

  // Random hero-afbeelding per bezoek
  const HERO_IMAGES = ['/padel.jpeg', ...Array.from({ length: 9 }, (_, i) => `/padelclub${i + 2}.jpeg`)]
  const heroImage = HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)]

  return (
    <PadelclubClient
      players={players}
      dayLabel={dayCest}
      dayMatches={dayMatches}
      dayQuestion={dayQuestion}
      heroImage={heroImage}
      currentUserId={user.id}
    />
  )
}
