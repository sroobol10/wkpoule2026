import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePlayerIds } from '@/lib/active-players'
import { playerCountry } from '@/lib/player-countries'
import StatDetailClient, { type StatOption } from './stat-detail-client'

const STAT_DEFS: Record<string, { keyword: string; title: string; kind: 'player' | 'country' | 'generic' }> = {
  'topscorer':             { keyword: 'topscorer',       title: 'Topscorer',            kind: 'player' },
  'beste-speler':          { keyword: 'beste speler',    title: 'Beste speler',         kind: 'player' },
  'gedoseerde-groepsfase': { keyword: 'gedoseer',        title: 'Gedoseerde groepsfase', kind: 'generic' },
  'goalgettergigant':      { keyword: 'goalgettergigant', title: 'Goalgettergigant',     kind: 'country' },
  'desastreuze-defensie':  { keyword: 'desastreuze',     title: 'Desastreuze defensie', kind: 'country' },
  'kaartenkoning':         { keyword: 'kaartenkoning',   title: 'Kaartenkoning',        kind: 'country' },
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const def = STAT_DEFS[key]
  return { title: def ? `${def.title} · WK Poule 2026` : 'Statistiek · WK Poule 2026' }
}

export default async function StatDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const def = STAT_DEFS[key]
  if (!def) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Bijbehorende bonusvraag (zelfde herkenning op tekst als elders)
  const { data: questions } = await supabase
    .from('bonus_questions')
    .select('id, question, correct_answer, correct_answer_set')
    .eq('type', 'pre_tournament')
  const question = (questions ?? []).find((q) => q.question.toLowerCase().includes(def.keyword))
  if (!question) notFound()

  // Eigen league (zelfde filtering als statistieken/wedstrijd-duel)
  const activeIds = await getActivePlayerIds(supabase)
  const { data: myMemberships } = await supabase
    .from('poule_members')
    .select('poules(id, is_general)')
    .eq('user_id', user.id)
  type PouleRef = { id: string; is_general: boolean }
  const privePouleIds = (myMemberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter((p): p is PouleRef => !!p && !p.is_general)
    .map((p) => p.id)
  let memberIds = activeIds
  if (privePouleIds.length > 0) {
    const { data: lm } = await supabase.from('poule_members').select('user_id').in('poule_id', privePouleIds)
    const set = new Set((lm ?? []).map((m) => m.user_id))
    memberIds = new Set([...activeIds].filter((id) => set.has(id)))
  }

  // Antwoorden + profielen
  const { data: answers } = await supabase
    .from('bonus_answers')
    .select('user_id, answer, profiles(id, username, avatar_url, full_name)')
    .eq('question_id', question.id)
  type Profile = { id: string; username: string; avatar_url: string | null; full_name: string | null }
  type AnswerRow = { user_id: string; answer: string; profiles: Profile | null }

  // Vlaggen + (voor landenvragen) live punten per land
  const { data: teamRows } = await supabase.from('teams').select('id, name, flag_url')
  const flagByName: Record<string, string> = {}
  for (const t of teamRows ?? []) if (t.flag_url) flagByName[t.name] = t.flag_url

  let pointsByName: Record<string, number> | null = null
  if (def.kind === 'country') {
    const nameById: Record<string, string> = {}
    for (const t of teamRows ?? []) nameById[t.id] = t.name
    const [{ data: scoreMatches }, { data: cardRows }] = await Promise.all([
      supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score').eq('result_entered', true),
      supabase.from('match_cards').select('team_id, yellow_cards, red_cards'),
    ])
    const goalsFor: Record<string, number> = {}, goalsAgainst: Record<string, number> = {}, cards: Record<string, number> = {}
    for (const m of scoreMatches ?? []) {
      if (m.home_team_id && m.home_score != null) { const n = nameById[m.home_team_id]; if (n) { goalsFor[n] = (goalsFor[n] ?? 0) + m.home_score; goalsAgainst[n] = (goalsAgainst[n] ?? 0) + (m.away_score ?? 0) } }
      if (m.away_team_id && m.away_score != null) { const n = nameById[m.away_team_id]; if (n) { goalsFor[n] = (goalsFor[n] ?? 0) + m.away_score; goalsAgainst[n] = (goalsAgainst[n] ?? 0) + (m.home_score ?? 0) } }
    }
    for (const c of (cardRows ?? []) as { team_id: string; yellow_cards: number; red_cards: number }[]) {
      const n = nameById[c.team_id]; if (n) cards[n] = (cards[n] ?? 0) + (c.yellow_cards ?? 0) + (c.red_cards ?? 0) * 2
    }
    pointsByName = def.keyword === 'goalgettergigant' ? goalsFor : def.keyword === 'desastreuze' ? goalsAgainst : cards
  }

  const flagFor = (answer: string): string | null => {
    if (def.kind === 'country') return flagByName[answer] ?? null
    if (def.kind === 'player') { const c = playerCountry(answer); return c ? (flagByName[c] ?? null) : null }
    return null
  }

  // Groepeer supporters per antwoord
  const correctLower = question.correct_answer_set ? question.correct_answer?.toLowerCase() ?? null : null
  const byAnswer = new Map<string, StatOption>()
  for (const a of (answers ?? []) as AnswerRow[]) {
    if (!a.answer || !memberIds.has(a.user_id)) continue
    const p = a.profiles
    let opt = byAnswer.get(a.answer)
    if (!opt) {
      opt = {
        answer: a.answer,
        flag: flagFor(a.answer),
        points: pointsByName ? (pointsByName[a.answer] ?? 0) : null,
        isCorrect: correctLower != null && a.answer.toLowerCase() === correctLower,
        supporters: [],
      }
      byAnswer.set(a.answer, opt)
    }
    if (p) opt.supporters.push({ id: p.id, username: p.username, avatarUrl: p.avatar_url, isMe: p.id === user.id })
  }
  const options = [...byAnswer.values()].sort((a, b) => b.supporters.length - a.supporters.length || a.answer.localeCompare(b.answer, 'nl'))
  for (const o of options) o.supporters.sort((x, y) => Number(y.isMe) - Number(x.isMe) || x.username.localeCompare(y.username))

  return (
    <StatDetailClient
      title={def.title}
      question={question.question}
      options={options}
      totalAnswers={options.reduce((s, o) => s + o.supporters.length, 0)}
    />
  )
}
