import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import { AvatarCircle } from '@/components/avatar-circle'
import DeelnemerClient from './deelnemer-client'
import DeelnemerBackground from './deelnemer-background'

export default async function DeelnemerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const canSeeData = new Date() >= GROUP_STAGE_DEADLINE

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', userId)
    .single()

  if (!targetProfile) notFound()

  // Stats — altijd zichtbaar
  const [
    { count: predCount },
    { count: jokerCount },
    { count: bonusCount },
    { count: bracketCount },
    { data: generalScore },
  ] = await Promise.all([
    supabase.from('predictions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('jokers').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('bonus_answers').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('bracket_predictions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('poule_scores')
      .select('total_pts, exact_hits, group_match_pts, group_standings_pts, knockout_pts, bonus_pre_pts, bonus_daily_pts')
      .eq('user_id', userId)
      .order('total_pts', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Detaildata — alleen laden na WK-start
  let matches = null, predRows = null, jokerRows = null, advancementRows = null
  type BonusQ = { id: string; question: string; type: string; unlock_date: string | null; correct_answer: string | null; correct_answer_set: boolean }
  let bracketRows = null, allTeams = null, visibleBonusQuestions: BonusQ[] = []
  let bonusAnswerRows = null

  if (canSeeData) {
    const [mRes, pRes, jRes, aRes, bqRes, baRes, tRes, brRes] = await Promise.all([
      supabase
        .from('matches')
        .select(`id, kickoff_at, match_number, home_score, away_score, result_entered,
          home_team:teams!matches_home_team_id_fkey(id, name, flag_url, group_name),
          away_team:teams!matches_away_team_id_fkey(id, name, flag_url, group_name)`)
        .eq('stage', 'group')
        .order('kickoff_at'),
      supabase.from('predictions').select('match_id, predicted_home, predicted_away, points_awarded').eq('user_id', userId),
      supabase.from('jokers').select('match_id').eq('user_id', userId),
      supabase.from('group_advancement').select('team_id, predicted_position').eq('user_id', userId),
      supabase.from('bonus_questions').select('id, question, type, unlock_date, correct_answer, correct_answer_set').order('type').order('created_at'),
      supabase.from('bonus_answers').select('question_id, answer, points_awarded').eq('user_id', userId),
      supabase.from('teams').select('id, name, flag_url, group_name'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('bracket_predictions').select('slot, predicted_team_id, points_awarded').eq('user_id', userId).order('slot'),
    ])
    matches = mRes.data; predRows = pRes.data; jokerRows = jRes.data
    advancementRows = aRes.data; bonusAnswerRows = baRes.data
    allTeams = tRes.data; bracketRows = brRes.data

    // Dagelijkse vragen: alleen tonen als van gisteren of eerder én beantwoord
    const today = new Date().toISOString().split('T')[0]
    const answeredIds = new Set((bonusAnswerRows ?? []).map((a: { question_id: string }) => a.question_id))
    visibleBonusQuestions = ((bqRes.data ?? []) as BonusQ[]).filter((q) => {
      if (q.type === 'pre_tournament') return true
      if (!q.unlock_date || q.unlock_date >= today) return false
      return answeredIds.has(q.id)
    })
    visibleBonusQuestions.sort((a, b) => {
      if (a.type === b.type) return (a.unlock_date ?? '').localeCompare(b.unlock_date ?? '')
      return a.type === 'pre_tournament' ? -1 : 1
    })
  }

  return (
    <>
      <DeelnemerBackground avatarUrl={targetProfile.avatar_url} />
    <div className="relative z-10 space-y-8">
      <ProfileHeader
        profile={targetProfile}
        totalPts={generalScore?.total_pts ?? 0}
        predCount={predCount ?? 0}
        jokerCount={jokerCount ?? 0}
        bracketCount={bracketCount ?? 0}
        bonusCount={bonusCount ?? 0}
        score={generalScore}
      />

      <DeelnemerClient
        matches={matches ?? []}
        predRows={predRows ?? []}
        jokerRows={jokerRows ?? []}
        advancementRows={advancementRows ?? []}
        bracketRows={bracketRows ?? []}
        allTeams={allTeams ?? []}
        bonusQuestions={visibleBonusQuestions}
        bonusAnswerRows={bonusAnswerRows ?? []}
        canSeeData={canSeeData}
      />
    </div>
    </>
  )
}

// ─── Profile header ───────────────────────────────────────────────────────────

function ProfileHeader({
  profile,
  totalPts,
  predCount,
  jokerCount,
  bracketCount,
  bonusCount,
  score,
}: {
  profile: { id: string; username: string; avatar_url: string | null }
  totalPts: number
  predCount: number
  jokerCount: number
  bracketCount: number
  bonusCount: number
  score?: {
    group_match_pts: number
    group_standings_pts: number
    knockout_pts: number
    bonus_pre_pts: number
    bonus_daily_pts: number
    exact_hits: number
  } | null
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-wk-surface border border-white/10">
      {/* Blurry background */}
      {profile.avatar_url ? (
        <div className="absolute inset-0 overflow-hidden">
          <img src={profile.avatar_url} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-30 saturate-150" />
          <div className="absolute inset-0 bg-gradient-to-b from-wk-bg/40 via-wk-bg/60 to-wk-bg/90" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-wk-gold/5 via-transparent to-wk-blue/5" />
      )}

      {/* Content */}
      <div className="relative flex flex-col items-center text-center gap-4 px-6 pt-8 pb-6 animate-fade-up">
        {/* Ring glow around avatar */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-wk-gold/20 blur-xl scale-125" />
          <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={96} />
        </div>

        <div style={{ animationDelay: '60ms' }} className="animate-fade-up">
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none drop-shadow">
            {profile.username}
          </h1>
          {totalPts > 0 && (
            <p className="font-display text-4xl text-wk-gold mt-1 drop-shadow-lg">
              {totalPts}
              <span className="font-mono text-sm text-wk-muted ml-1">pt</span>
            </p>
          )}
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap justify-center gap-2" style={{ animationDelay: '120ms' }}>
          {[
            { label: 'Wedstrijden', value: `${predCount}/72` },
            { label: 'Jokers',      value: `${jokerCount}/12` },
            { label: 'Bracket',     value: `${bracketCount}/32` },
            { label: 'Bonus',       value: String(bonusCount) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-wk-bg/60 border border-white/10 rounded-full px-3 py-1.5 flex items-center gap-1.5">
              <span className="font-mono text-[9px] text-wk-muted tracking-widest uppercase">{label}</span>
              <span className="font-mono text-xs font-bold text-wk-gold [text-shadow:0_0_10px_rgba(var(--color-wk-gold-raw),0.6)]">{value}</span>
            </div>
          ))}
        </div>

        {/* Score breakdown */}
        {score && totalPts > 0 && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1" style={{ animationDelay: '180ms' }}>
            {[
              { label: 'Wedstr.',  val: score.group_match_pts },
              { label: 'Stand',    val: score.group_standings_pts },
              { label: 'KO',       val: score.knockout_pts },
              { label: 'Bonus',    val: score.bonus_pre_pts + score.bonus_daily_pts },
              { label: 'Exact',    val: score.exact_hits, suffix: '×' },
            ].filter(({ val }) => val > 0).map(({ label, val, suffix }) => (
              <span key={label} className="font-mono text-[10px] text-wk-muted tracking-wide">
                <span className="text-wk-soft">{val}{suffix ?? 'pt'}</span> {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
