import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { formatInAmsterdam } from '@/lib/format'
import { playerCountry } from '@/lib/player-countries'

// Compact dagoverzicht bovenaan het klassement (per ingelogde deelnemer).
// "Dag" = CEST-kalenderdag (UTC+2), conform de rest van de app.
// Lege categorieën worden niet getoond; is er voor vandaag niets, dan
// verdwijnt het hele blok.

type TeamRef = { id: string; name: string; code: string; flag_url: string } | null
type Match = {
  id: string
  kickoff_at: string
  stage: string
  match_number: number | null
  home_score: number | null
  away_score: number | null
  result_entered: boolean
  shootout_winner_id: string | null
  home_team: TeamRef
  away_team: TeamRef
}
type Pred = { match_id: string; predicted_home: number; predicted_away: number; points_awarded: number | null }
type Question = {
  id: string
  question: string
  type: string
  unlock_date: string | null
  answer_type: string
  answer_options: string[] | null
}
type AnswerEntry = { question_id: string; answer: string; points_awarded: number | null }

// Pre-tournament landenvragen (antwoord = een land); de rest zijn spelervragen
function isCountryQuestion(question: string) {
  const q = question.toLowerCase()
  return (
    q.includes('kampioen') ||
    (q.includes('winnaar') && q.includes('land')) ||
    q.includes('kaartenkoning') ||
    q.includes('desastreuze') ||
    q.includes('goalgettergigant')
  )
}

export async function DagOverzicht({ userId }: { userId: string }) {
  const supabase = await createClient()

  // ── CEST-dag bepalen ─────────────────────────────────────────────────────
  const now = new Date()
  const cestMs = now.getTime() + 2 * 60 * 60 * 1000
  const todayCest = new Date(cestMs).toISOString().slice(0, 10)
  const tomorrowCest = new Date(cestMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  // UTC-grenzen van de CEST-kalenderdag: CEST-middernacht = UTC 22:00 vorige dag
  const dayStartUtc = new Date(new Date(todayCest + 'T00:00:00Z').getTime() - 2 * 60 * 60 * 1000)
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000)

  // ── Wedstrijden van vandaag ──────────────────────────────────────────────
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(`
      id, kickoff_at, stage, match_number, home_score, away_score, result_entered, shootout_winner_id,
      home_team:teams!matches_home_team_id_fkey(id, name, code, flag_url),
      away_team:teams!matches_away_team_id_fkey(id, name, code, flag_url)
    `)
    .gte('kickoff_at', dayStartUtc.toISOString())
    .lt('kickoff_at', dayEndUtc.toISOString())
    .order('kickoff_at')
  const matches = (matchesRaw ?? []) as unknown as Match[]
  const matchIds = matches.map((m) => m.id)

  // ── Groepsvoorspellingen en jokers voor die wedstrijden ───────────────────
  const [{ data: preds }, { data: jokers }] = await Promise.all([
    matchIds.length
      ? supabase.from('predictions')
          .select('match_id, predicted_home, predicted_away, points_awarded')
          .eq('user_id', userId).in('match_id', matchIds)
      : Promise.resolve({ data: [] as Pred[] }),
    matchIds.length
      ? supabase.from('jokers').select('match_id').eq('user_id', userId).in('match_id', matchIds)
      : Promise.resolve({ data: [] as { match_id: string }[] }),
  ])
  const predMap = Object.fromEntries(((preds ?? []) as Pred[]).map((p) => [p.match_id, p]))
  const jokerIds = new Set(((jokers ?? []) as { match_id: string }[]).map((j) => j.match_id))

  // KO-winnaars komen uit de bracket (bracket_predictions): per slot het land dat je
  // liet winnen. winSet = alle landen die je ergens als winnaar koos; bracketBySlot
  // levert de punten per KO-wedstrijd (slot = match_number).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bracketRows } = await (supabase as any)
    .from('bracket_predictions')
    .select('slot, predicted_team_id, points_awarded')
    .eq('user_id', userId)
  const bracket = (bracketRows ?? []) as { slot: number; predicted_team_id: string; points_awarded: number | null }[]
  const winSet = new Set(bracket.map((b) => b.predicted_team_id))
  const koPtsBySlot = Object.fromEntries(bracket.map((b) => [b.slot, b.points_awarded])) as Record<number, number | null>

  // KO-wedstrijden alleen tonen als je minstens één van de twee landen als winnaar
  // voorspelde. Groepsfase-wedstrijden tonen we zoals altijd.
  const visible = matches.filter(
    (m) => m.stage === 'group' || winSet.has(m.home_team?.id ?? '') || winSet.has(m.away_team?.id ?? ''),
  )
  const played = visible.filter((m) => m.result_entered)
  const upcoming = visible.filter((m) => !m.result_entered)

  // ── Bonusvragen ───────────────────────────────────────────────────────────
  const [{ data: dailyQs }, { data: preQs }] = await Promise.all([
    supabase.from('bonus_questions')
      .select('id, question, type, unlock_date, answer_type, answer_options')
      .eq('type', 'daily').in('unlock_date', [todayCest, tomorrowCest]),
    supabase.from('bonus_questions')
      .select('id, question, type, unlock_date, answer_type, answer_options')
      .eq('type', 'pre_tournament'),
  ])
  const allQ = [...((dailyQs ?? []) as Question[]), ...((preQs ?? []) as Question[])]
  const { data: answersRaw } = allQ.length
    ? await supabase.from('bonus_answers')
        .select('question_id, answer, points_awarded')
        .eq('user_id', userId).in('question_id', allQ.map((q) => q.id))
    : { data: [] as AnswerEntry[] }
  const answerMap = Object.fromEntries(((answersRaw ?? []) as AnswerEntry[]).map((a) => [a.question_id, a]))

  // Dagelijkse bonus: vraag van vandaag (gisteren beantwoord) + vraag van morgen
  // (alleen tonen zolang nog niet beantwoord).
  const todayQ = ((dailyQs ?? []) as Question[]).find((q) => q.unlock_date === todayCest) ?? null
  const tomorrowQ = ((dailyQs ?? []) as Question[]).find((q) => q.unlock_date === tomorrowCest) ?? null
  const showTomorrowQ = tomorrowQ && !answerMap[tomorrowQ.id]?.answer ? tomorrowQ : null

  // Algemene bonusvragen: alleen tonen wanneer het gekozen land/​speler vandaag
  // speelt. De "gedoseerde groepsfase"-vraag wordt nooit getoond.
  const teamsToday = new Set<string>()
  for (const m of matches) {
    if (m.home_team) teamsToday.add(m.home_team.name)
    if (m.away_team) teamsToday.add(m.away_team.name)
  }
  const flagFor = (country: string | null) =>
    country ? (matches.flatMap((m) => [m.home_team, m.away_team]).find((t) => t?.name === country)?.flag_url ?? null) : null

  const generalItems = ((preQs ?? []) as Question[])
    .filter((q) => !q.question.toLowerCase().includes('gedoseer'))
    .map((q) => {
      const ans = answerMap[q.id]
      if (!ans?.answer) return null
      const country = isCountryQuestion(q.question) ? ans.answer : (playerCountry(ans.answer) ?? null)
      if (!country || !teamsToday.has(country)) return null
      return { q, answer: ans.answer, country, points: ans.points_awarded, flag: flagFor(country) }
    })
    .filter(Boolean) as { q: Question; answer: string; country: string; points: number | null; flag: string | null }[]

  const hasLeft = played.length > 0 || upcoming.length > 0
  const hasRight = !!todayQ || !!showTomorrowQ || generalItems.length > 0
  if (!hasLeft && !hasRight) return null

  return (
    <section className="space-y-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-2xl text-wk-text uppercase leading-none">Dagoverzicht</h2>
        <p className="font-mono text-[11px] text-wk-red tracking-[0.2em] uppercase">
          {formatInAmsterdam(now.toISOString(), 'EEEE d MMMM')}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">
        {/* Kolom links: wedstrijden */}
        {hasLeft && (
          <div className="space-y-6">
            {played.length > 0 && (
              <SubSection title="Behaalde punten">
                <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5">
                  {played.map((m) => (
                    <PlayedRow key={m.id} m={m} pred={predMap[m.id]} koPts={koPtsBySlot[m.match_number ?? -1] ?? null} joker={jokerIds.has(m.id)} winSet={winSet} />
                  ))}
                </div>
              </SubSection>
            )}
            {upcoming.length > 0 && (
              <SubSection title="Nog te behalen punten">
                <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5">
                  {upcoming.map((m) => (
                    <UpcomingRow key={m.id} m={m} pred={predMap[m.id]} joker={jokerIds.has(m.id)} winSet={winSet} />
                  ))}
                </div>
              </SubSection>
            )}
          </div>
        )}

        {/* Kolom rechts: bonusvragen */}
        {hasRight && (
          <div className="space-y-6">
            {(todayQ || showTomorrowQ) && (
              <SubSection title="Dagelijkse bonusvraag">
                <div className="space-y-2">
                  {showTomorrowQ && <TomorrowBonus q={showTomorrowQ} />}
                  {todayQ && <DailyBonus q={todayQ} answer={answerMap[todayQ.id] ?? null} />}
                </div>
              </SubSection>
            )}
            {generalItems.length > 0 && (
              <SubSection title="Algemene bonusvragen">
                <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5">
                  {generalItems.map((item) => (
                    <GeneralRow key={item.q.id} {...item} />
                  ))}
                </div>
              </SubSection>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Subcomponenten ─────────────────────────────────────────────────────────

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <span className="font-mono text-[11px] text-wk-muted border border-white/15 rounded-full px-3 py-1 tracking-[0.16em] uppercase">
          {title}
        </span>
      </div>
      {children}
    </section>
  )
}

function Team({ team }: { team: TeamRef }) {
  if (!team) return <span className="text-sm text-wk-soft">?</span>
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {team.flag_url && (
        <Image src={team.flag_url} alt={team.name} width={26} height={18} className="rounded-sm object-cover w-6 h-4 shrink-0" />
      )}
      <span className="text-sm sm:text-[15px] font-semibold text-wk-soft truncate">{team.name}</span>
    </span>
  )
}

function PtsBadge({ pts, joker }: { pts: number | null; joker: boolean }) {
  if (pts === null || pts === undefined) return null
  const base = joker ? pts / 2 : pts
  const cls = pts === 0
    ? 'bg-wk-red/10 border-wk-red/30 text-wk-red'
    : base >= 10
      ? 'bg-wk-green/10 border-wk-green/30 text-wk-green'
      : 'bg-wk-gold/10 border-wk-gold/30 text-wk-gold'
  return (
    <span className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded-full border tracking-[0.1em] uppercase shrink-0 ${cls}`}>
      {pts} pt
    </span>
  )
}

function JokerTag() {
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-bold text-wk-gold tracking-[0.1em] uppercase">
      <span className="text-[11px]">★</span> Joker
    </span>
  )
}

// Groepsfase-voorspelling als tekst (KO heeft een eigen weergave hieronder).
function groupPredText(pred?: Pred): string | null {
  return pred ? `${pred.predicted_home}–${pred.predicted_away}` : null
}

// De landen (van de twee echte deelnemers) die je als KO-winnaar voorspelde.
function myChoiceTeams(m: Match, winSet: Set<string>): NonNullable<TeamRef>[] {
  const out: NonNullable<TeamRef>[] = []
  if (m.home_team && winSet.has(m.home_team.id)) out.push(m.home_team)
  if (m.away_team && winSet.has(m.away_team.id)) out.push(m.away_team)
  return out
}
function koWinner(m: Match): TeamRef {
  if (!m.result_entered || m.home_score == null || m.away_score == null) return null
  if (m.home_score > m.away_score) return m.home_team
  if (m.away_score > m.home_score) return m.away_team
  // gelijkspel → strafschoppen-winnaar
  if (m.shootout_winner_id && m.shootout_winner_id === m.home_team?.id) return m.home_team
  if (m.shootout_winner_id && m.shootout_winner_id === m.away_team?.id) return m.away_team
  return null
}

function FlagImg({ team }: { team: NonNullable<TeamRef> }) {
  if (!team.flag_url) return null
  return <Image src={team.flag_url} alt={team.name} width={22} height={15} className="rounded-sm object-cover w-[22px] h-[15px] shrink-0" />
}

// "Mijn keuze": één land = vlag + naam; twee landen = beide vlaggen (🇨🇦 & 🇫🇷).
function MyChoice({ teams }: { teams: NonNullable<TeamRef>[] }) {
  if (teams.length === 0) return <b className="ml-1 text-wk-muted/50">—</b>
  if (teams.length === 1) {
    return <b className="ml-1 inline-flex items-center gap-1.5 text-wk-soft align-middle"><FlagImg team={teams[0]} />{teams[0].name}</b>
  }
  return (
    <b className="ml-1 inline-flex items-center gap-1.5 text-wk-soft align-middle">
      <FlagImg team={teams[0]} /><span className="text-wk-muted font-normal">&</span><FlagImg team={teams[1]} />
    </b>
  )
}

function PlayedRow({ m, pred, koPts, joker, winSet }: { m: Match; pred?: Pred; koPts?: number | null; joker: boolean; winSet: Set<string> }) {
  const isKo = m.stage !== 'group'
  const pts = isKo ? (koPts ?? null) : (pred?.points_awarded ?? null)
  const winner = koWinner(m)
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs text-wk-muted w-10 shrink-0">{formatInAmsterdam(m.kickoff_at, 'HH:mm')}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Team team={m.home_team} />
          <span className="font-mono text-xs text-wk-muted shrink-0">–</span>
          <Team team={m.away_team} />
        </div>
        <PtsBadge pts={pts} joker={joker} />
      </div>
      <div className="pl-12 mt-1.5 flex items-center gap-x-3 gap-y-1 text-xs sm:text-[13px] text-wk-muted flex-wrap">
        {isKo ? (
          <>
            <span className="inline-flex items-center">Mijn keuze <MyChoice teams={myChoiceTeams(m, winSet)} /></span>
            <Link href={`/wedstrijd/${m.id}`} className="group/uitslag inline-flex items-center" title="Bekijk wie wat koos">
              Uitslag{' '}
              {winner
                ? <b className="ml-1 inline-flex items-center gap-1.5 text-wk-text align-middle"><FlagImg team={winner} /><span className="underline decoration-wk-muted/50 underline-offset-2 group-hover/uitslag:decoration-wk-gold transition-colors">{winner.name}</span></b>
                : <b className="ml-1 text-wk-text">—</b>}
            </Link>
          </>
        ) : (
          <>
            <span>Voorspeld <b className="ml-1 text-wk-soft">{groupPredText(pred) ?? '—'}</b></span>
            <Link href={`/wedstrijd/${m.id}`} className="group/uitslag" title="Bekijk wie wat koos">
              Uitslag{' '}
              <b className="ml-1 text-wk-text underline decoration-wk-muted/50 underline-offset-2 group-hover/uitslag:decoration-wk-gold transition-colors">
                {m.home_score}–{m.away_score}
              </b>
            </Link>
          </>
        )}
        {joker && <JokerTag />}
      </div>
    </div>
  )
}

function UpcomingRow({ m, pred, joker, winSet }: { m: Match; pred?: Pred; joker: boolean; winSet: Set<string> }) {
  const isKo = m.stage !== 'group'
  const voorspeld = groupPredText(pred)
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs text-wk-muted w-10 shrink-0">{formatInAmsterdam(m.kickoff_at, 'HH:mm')}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Team team={m.home_team} />
          <span className="font-mono text-xs text-wk-muted shrink-0">–</span>
          <Team team={m.away_team} />
        </div>
      </div>
      <div className="pl-12 mt-1.5 flex items-center gap-x-3 gap-y-1 text-xs sm:text-[13px] text-wk-muted flex-wrap">
        {isKo
          ? <span className="inline-flex items-center">Mijn keuze <MyChoice teams={myChoiceTeams(m, winSet)} /></span>
          : <span>Voorspeld <b className={`ml-1 ${voorspeld ? 'text-wk-soft' : 'text-wk-muted/50'}`}>{voorspeld ?? '—'}</b></span>}
        {joker && <JokerTag />}
      </div>
    </div>
  )
}

function DailyBonus({ q, answer }: { q: Question; answer: AnswerEntry | null }) {
  const scored = answer?.points_awarded !== null && answer?.points_awarded !== undefined
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm sm:text-[15px] font-semibold text-wk-text leading-snug flex-1">{q.question}</p>
        {scored
          ? <PtsBadge pts={answer!.points_awarded} joker={false} />
          : <span className="font-mono text-[10px] text-wk-muted tracking-[0.1em] uppercase shrink-0">In afwachting</span>}
      </div>
      <p className="mt-2 font-mono text-[11px] text-wk-muted tracking-[0.12em]">
        Jouw antwoord:{' '}
        {answer?.answer
          ? <b className="text-wk-soft">{answer.answer}</b>
          : <span className="italic text-wk-muted/60">geen antwoord</span>}
      </p>
    </div>
  )
}

function TomorrowBonus({ q }: { q: Question }) {
  return (
    <Link
      href="/bonusvragen"
      className="block bg-wk-surface border border-wk-gold/30 rounded-xl px-4 py-3.5 hover:border-wk-gold/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm sm:text-[15px] font-semibold text-wk-text leading-snug flex-1">{q.question}</p>
        <span className="font-mono text-[10px] font-bold text-wk-gold tracking-[0.1em] uppercase shrink-0">Te doen</span>
      </div>
      <p className="mt-2 font-mono text-[11px] text-wk-gold tracking-[0.12em] uppercase">
        Beantwoord vóór morgen →
      </p>
    </Link>
  )
}

function GeneralRow({ q, answer, country, points, flag }: { q: Question; answer: string; country: string; points: number | null; flag: string | null }) {
  const scored = points !== null && points !== undefined
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-[15px] font-medium text-wk-text leading-snug truncate">{q.question}</p>
        <p className="font-mono text-[11px] text-wk-muted tracking-[0.12em] mt-0.5 truncate">{answer}</p>
      </div>
      {flag && (
        <Image src={flag} alt={country} width={26} height={18} className="rounded-sm object-cover w-6 h-4 shrink-0" />
      )}
      {scored
        ? <PtsBadge pts={points} joker={false} />
        : <span className="font-mono text-[10px] text-wk-muted tracking-[0.1em] uppercase shrink-0">Loopt</span>}
    </div>
  )
}
