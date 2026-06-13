'use client'

import { useState, useEffect, useTransition } from 'react'
import Image from 'next/image'
import { saveBonusAnswer } from '@/app/actions/bonus'
import { formatInAmsterdam } from '@/lib/format'
import { GROUP_STAGE_DEADLINE } from '@/lib/constants'
import { playerCountry } from '@/lib/player-countries'

type Question = {
  id: string
  question: string
  description: string | null
  type: string
  unlock_date: string | null
  correct_answer_set: boolean
  answer_type: string
  answer_options: string[] | null
}
type AnswerEntry = { question_id: string; answer: string; points_awarded: number | null }
type Team = { id: string; name: string; flag_url: string }

type MatchForDay = {
  kickoff_at: string
  home: string
  away: string
  homeFlag: string | null
  awayFlag: string | null
  myPred: string | null
}

type Props = {
  questions: Question[]
  answerMap: Record<string, AnswerEntry>
  teams: Team[]
  anyMatchPlayed?: boolean
  deadlineByDate?: Record<string, string>       // unlock_date → effectieve deadline ISO
  matchesByDay?: Record<string, MatchForDay[]>  // CEST-datum → wedstrijden
}

// Vragen waarbij een landkeuze getoond wordt i.p.v. vrije tekst
function isTeamQuestion(question: string) {
  const q = question.toLowerCase()
  return (
    q.includes('kampioen') ||
    (q.includes('winnaar') && q.includes('land')) ||
    q.includes('kaartenkoning') ||
    q.includes('desastreuze') ||
    q.includes('goalgettergigant')
  )
}

// GOAT-vraag: binaire keuze tussen Ronaldo en Messi
function isGoatQuestion(question: string) {
  return question.toLowerCase().includes('goat') || question.toLowerCase().includes('ronaldo') || question.toLowerCase().includes('messi')
}

// Landenvragen die het hele toernooi doorlopen: 0 pt = loopt nog (geel), niet fout (rood)
function isRunningCountryQuestion(question: string) {
  const q = question.toLowerCase()
  return q.includes('goalgettergigant') || q.includes('desastreuze') || q.includes('kaartenkoning')
}

// Vaste volgorde voor de vóór-toernooi vragen
const PRE_ORDER = ['Topscorer','Beste speler','GOAT','Gedoseerde groepsfase','Goalgettergigant','Desastreuze defensie','Kaartenkoning']
function preSort(a: Question, b: Question) {
  const ai = PRE_ORDER.findIndex(t => a.question.toLowerCase().includes(t.toLowerCase()))
  const bi = PRE_ORDER.findIndex(t => b.question.toLowerCase().includes(t.toLowerCase()))
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
}

export default function BonusvragenClient({ questions, answerMap, teams, anyMatchPlayed = false, deadlineByDate = {}, matchesByDay = {} }: Props) {
  const preTournament = questions
    .filter((q) => q.type === 'pre_tournament')
    .sort(preSort)
  const daily = questions
    .filter((q) => q.type === 'daily')
    .sort((a, b) => (b.unlock_date ?? '').localeCompare(a.unlock_date ?? '')) // nieuwste bovenaan

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Extra punten</p>
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Bonusvragen</h1>
      </div>

      <div className={daily.length > 0 ? "lg:grid lg:grid-cols-2 lg:gap-8 space-y-8 lg:space-y-0" : "space-y-8"}>
        {/* Links: Dagelijkse vragen (eerst) */}
        {daily.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-[10px] text-wk-blue border border-wk-blue/30 rounded-full px-3 py-1 tracking-[0.16em] uppercase">
                Dagelijkse vragen
              </span>
            </div>
            <div className="space-y-3">
              {daily.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  existingAnswer={answerMap[q.id] ?? null}
                  teams={[]}
                  allTeams={teams}
                  effectiveDeadline={q.unlock_date ? (deadlineByDate[q.unlock_date] ?? null) : null}
                  dayMatches={q.unlock_date ? (matchesByDay[q.unlock_date] ?? []) : []}
                />
              ))}
            </div>
          </section>
        )}

        {/* Rechts: Vóór het toernooi */}
        {preTournament.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-[10px] text-wk-blue border border-wk-blue/30 rounded-full px-3 py-1 tracking-[0.16em] uppercase">
                Algemene vragen
              </span>
            </div>
            <div className="space-y-3">
              {preTournament.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  existingAnswer={answerMap[q.id] ?? null}
                  teams={isTeamQuestion(q.question) ? teams : []}
                  allTeams={teams}
                  tournamentStarted={anyMatchPlayed}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {questions.length === 0 && (
        <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center">
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Nog geen bonusvragen beschikbaar.</p>
        </div>
      )}
    </div>
  )
}

// Te behalen punten per vraag (rechtsboven in de kaart)
function ptsToWin(question: Question): string {
  if (question.type === 'daily') return '1 pt'
  const q = question.question.toLowerCase()
  if (q.includes('topscorer')) return '25 pt'
  if (q.includes('beste speler')) return '15 pt'
  if (q.includes('gedoseerd')) return 'max 10 pt'
  if (isGoatQuestion(question.question)) return '5 pt'
  return 'var. pt' // landenvragen: punten o.b.v. prestaties van het gekozen land
}

function QuestionCard({
  question,
  existingAnswer,
  teams,
  allTeams = [],
  tournamentStarted = false,
  effectiveDeadline = null,
  dayMatches = [],
}: {
  question: Question
  existingAnswer: AnswerEntry | null
  teams: Team[]
  allTeams?: Team[]
  tournamentStarted?: boolean
  effectiveDeadline?: string | null
  dayMatches?: MatchForDay[]
}) {
  const [answer, setAnswer] = useState(existingAnswer?.answer ?? '')
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [saved, setSaved] = useState(!!existingAnswer?.answer)
  const [showPicker, setShowPicker] = useState(false)
  const [showMatches, setShowMatches] = useState(false)
  const [search, setSearch] = useState('')

  const deadline = effectiveDeadline
    ? new Date(effectiveDeadline)
    : (question.unlock_date ? new Date(question.unlock_date + 'T00:00:00Z') : null)

  // Tikkende klok zodat een openstaande tab vanzelf op slot gaat na de deadline
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const closedAt = (at: Date) => question.type === 'pre_tournament'
    ? tournamentStarted || at >= GROUP_STAGE_DEADLINE
    : (deadline ? deadline <= at : false)
  const closed = closedAt(now)
  const pts = existingAnswer?.points_awarded

  // Input mode: answer_type field has priority over legacy keyword detection
  type InputMode = 'options' | 'yesno' | 'goat' | 'team' | 'free'
  let inputMode: InputMode = 'free'
  if (question.answer_type === 'options' && question.answer_options?.length) {
    inputMode = 'options'
  } else if (question.answer_type === 'yesno') {
    inputMode = 'yesno'
  } else if (isGoatQuestion(question.question)) {
    inputMode = 'goat'
  } else if (teams.length > 0) {
    inputMode = 'team'
  }

  const selectedTeam = inputMode === 'team' ? teams.find((t) => t.name === answer) : null
  const filteredTeams = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  function handleSave(val?: string) {
    const finalAnswer = val ?? answer
    if (!finalAnswer.trim() || closed) return
    // Verse check op het moment van opslaan — een stilstaande tab mag niet
    // alsnog na de deadline opslaan (de server weigert het sowieso ook)
    if (closedAt(new Date())) {
      setNow(new Date())
      setToast({ msg: 'De deadline voor deze vraag is verstreken.', ok: false })
      setTimeout(() => setToast(null), 3000)
      return
    }
    const lower = finalAnswer.toLowerCase()
    if (lower.includes('ronaldo')) new Audio('/ronaldo-siuuuu.mp3').play().catch(() => {})
    else if (lower.includes('messi')) new Audio('/ankara-messi-best-sound.mp3').play().catch(() => {})
    startTransition(async () => {
      const result = await saveBonusAnswer(question.id, finalAnswer)
      if (result.ok) { setSaved(true); setShowPicker(false) }
      setToast({ msg: result.ok ? 'Opgeslagen!' : result.error, ok: result.ok })
      setTimeout(() => setToast(null), 3000)
    })
  }

  function selectTeam(team: Team) {
    setAnswer(team.name)
    setSaved(false)
    handleSave(team.name)
  }

  // Vlag-lookup voor spelers (land via PLAYER_COUNTRIES) en landenantwoorden
  const flagFor = (country: string | null) =>
    country ? (allTeams.find((t) => t.name === country)?.flag_url ?? null) : null

  // Kleurcodering accent: groen (punten) · rood (0 pt, fout) · geel (onbeantwoord,
  // of een nog lopende landenvraag met 0 pt) · blauw (beantwoord, uitslag onbekend).
  const answered = saved || !!existingAnswer?.answer
  const runningCountry = isRunningCountryQuestion(question.question)
  const scored = pts !== null && pts !== undefined
  let accentBg: string
  if (scored) {
    accentBg = pts! > 0 ? 'bg-wk-green' : runningCountry ? 'bg-wk-gold' : 'bg-wk-red'
  } else {
    accentBg = answered ? 'bg-wk-blue' : 'bg-wk-gold'
  }

  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
      <div className="flex">
        <div className={`w-1 shrink-0 ${accentBg}`} />
        <div className="flex-1 px-5 py-4">

          {/* Question + pts badge */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-wk-text leading-snug">{question.question}</p>
              {question.description && (
                <p className="font-mono text-[10px] text-wk-muted tracking-widest mt-0.5 leading-relaxed">
                  {question.description.startsWith('Indien jouw gewenste selectie')
                    ? 'Conform FIFA-reglementen.'
                    : question.description}
                </p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {scored ? (
                <span className={`font-mono text-[10px] font-bold px-2 py-1 rounded-full border tracking-[0.12em] uppercase ${
                  pts! > 0
                    ? 'bg-wk-green/10 border-wk-green/30 text-wk-green'
                    : runningCountry
                      ? 'bg-wk-gold/10 border-wk-gold/30 text-wk-gold'
                      : 'bg-wk-red/10 border-wk-red/30 text-wk-red'
                }`}>
                  {pts} pt
                </span>
              ) : (
                /* Nog niet gescoord: te behalen punten zonder achtergrondkleur.
                   Openstaande dagvraag toont 0 PT. */
                <span className="font-mono text-[10px] font-bold text-wk-gold tracking-[0.12em] uppercase">
                  {question.type === 'daily' ? '0 pt' : ptsToWin(question)}
                </span>
              )}
            </div>
          </div>

          {/* Deadline + wedstrijden van die dag */}
          {question.type === 'daily' && (
            <div className="mb-3 space-y-1.5">
              {deadline && !closed && (
                <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">
                  Sluit bij aftrap: {formatInAmsterdam(deadline.toISOString(), 'EEEE d MMMM · HH:mm')}
                </p>
              )}
              {dayMatches.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowMatches(v => !v)}
                    className="font-mono text-[9px] text-wk-muted hover:text-wk-soft tracking-widest uppercase transition-colors flex items-center gap-1"
                  >
                    <svg className={`w-3 h-3 transition-transform ${showMatches ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {dayMatches.length} wedstrijd{dayMatches.length !== 1 ? 'en' : ''} op deze dag
                  </button>
                  {showMatches && (
                    <div className="mt-1.5 rounded-lg bg-wk-bg2 border border-white/10 overflow-hidden">
                      {dayMatches.map((m) => (
                        <div key={m.kickoff_at + m.home} className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 last:border-0">
                          <span className="font-mono text-[9px] text-wk-muted shrink-0 w-10">
                            {formatInAmsterdam(m.kickoff_at, 'HH:mm')}
                          </span>
                          {m.homeFlag && (
                            <Image src={m.homeFlag} alt={m.home} width={20} height={14} className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
                          )}
                          <span className="font-mono text-[10px] text-wk-soft truncate">
                            {m.home} – {m.away}
                          </span>
                          {m.awayFlag && (
                            <Image src={m.awayFlag} alt={m.away} width={20} height={14} className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
                          )}
                          {m.myPred && (
                            <span className="ml-auto font-mono text-[10px] font-bold text-wk-gold shrink-0" title="Jouw voorspelling">
                              🔮 {m.myPred}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Answer area */}
          {!closed ? (
            inputMode === 'options' ? (
              (question.answer_options?.length ?? 0) > 8 ? (
                /* ── Doorzoekbare dropdown voor grote lijsten (spelers) ── */
                <div className="space-y-2">
                  <button
                    onClick={() => setShowPicker((v) => !v)}
                    className={`w-full flex items-center justify-between gap-3 rounded border px-3 py-2.5 text-left transition-colors ${
                      showPicker ? 'border-wk-gold/50 bg-wk-gold/5' : 'border-white/10 bg-wk-bg2 hover:border-white/20'
                    }`}
                  >
                    <span className={`flex-1 text-sm font-semibold ${answer ? 'text-wk-gold' : 'text-wk-muted'}`}>
                      {answer || 'Kies een speler…'}
                      {answer && playerCountry(answer) && (
                        <span className="ml-2 font-mono text-[10px] font-normal text-wk-muted">{playerCountry(answer)}</span>
                      )}
                    </span>
                    {answer && flagFor(playerCountry(answer)) && (
                      <Image src={flagFor(playerCountry(answer))!} alt={playerCountry(answer) ?? ''} width={20} height={14} className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
                    )}
                    {answer && <span className="font-mono text-[10px] text-wk-gold">✓</span>}
                    <svg className={`w-4 h-4 text-wk-muted shrink-0 transition-transform ${showPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showPicker && (
                    <div className="rounded-xl border border-white/10 bg-wk-bg2 overflow-hidden">
                      <div className="px-3 py-2 border-b border-white/10">
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Zoek speler…"
                          autoFocus
                          className="w-full bg-transparent text-sm text-wk-text placeholder:text-wk-muted outline-none"
                        />
                      </div>
                      <div className="max-h-52 overflow-y-auto divide-y divide-white/5">
                        {(question.answer_options ?? [])
                          .filter((opt) => opt.toLowerCase().includes(search.toLowerCase()))
                          .map((opt) => (
                            <button
                              key={opt}
                              onClick={() => { setAnswer(opt); setSaved(false); setShowPicker(false); setSearch(''); handleSave(opt) }}
                              disabled={isPending}
                              className={`w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors ${
                                answer === opt ? 'text-wk-gold bg-wk-gold/5' : 'text-wk-soft hover:bg-white/5'
                              }`}
                            >
                              <span className="flex-1 truncate">{opt}</span>
                              {playerCountry(opt) && (
                                <span className="font-mono text-[9px] text-wk-muted shrink-0">{playerCountry(opt)}</span>
                              )}
                              {flagFor(playerCountry(opt)) && (
                                <Image src={flagFor(playerCountry(opt))!} alt={playerCountry(opt) ?? ''} width={20} height={14} className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : question.type === 'daily' ? (
                /* ── Dropdown voor dagelijkse vragen met opties ── */
                <select
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); setSaved(false); handleSave(e.target.value) }}
                  disabled={isPending}
                  className="w-full rounded bg-wk-bg2 border border-white/10 px-3 py-2.5 text-sm text-wk-text focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition appearance-none"
                >
                  <option value="" disabled>Kies een optie…</option>
                  {(question.answer_options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                /* ── Knoppen voor kleine lijsten (pre-tournament) ── */
                <div className="flex flex-wrap gap-2">
                  {(question.answer_options ?? []).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setAnswer(opt); setSaved(false); handleSave(opt) }}
                      disabled={isPending}
                      className={`rounded border px-4 py-2.5 text-sm font-semibold transition-colors ${
                        answer === opt
                          ? 'border-wk-gold/60 bg-wk-gold/15 text-wk-gold'
                          : 'border-white/10 bg-wk-bg2 text-wk-soft hover:border-white/20'
                      }`}
                    >
                      {opt}
                      {answer === opt && <span className="ml-1.5 font-mono text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              )
            ) : inputMode === 'yesno' ? (
              /* ── Ja / Nee ── */
              <div className="flex gap-2">
                {['Ja', 'Nee'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setAnswer(opt); setSaved(false); handleSave(opt) }}
                    disabled={isPending}
                    className={`flex-1 rounded border px-4 py-3 text-sm font-semibold transition-colors ${
                      answer === opt
                        ? 'border-wk-gold/60 bg-wk-gold/15 text-wk-gold'
                        : 'border-white/10 bg-wk-bg2 text-wk-soft hover:border-white/20'
                    }`}
                  >
                    {opt}
                    {answer === opt && <span className="ml-1.5 font-mono text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            ) : inputMode === 'goat' ? (
              /* ── GOAT: Ronaldo of Messi ── */
              <div className="flex gap-2">
                {['Ronaldo', 'Messi'].map((name) => (
                  <button
                    key={name}
                    onClick={() => { setAnswer(name); setSaved(false); handleSave(name) }}
                    disabled={isPending}
                    className={`flex-1 rounded border px-4 py-3 text-sm font-semibold transition-colors ${
                      answer === name
                        ? 'border-wk-gold/60 bg-wk-gold/15 text-wk-gold'
                        : 'border-white/10 bg-wk-bg2 text-wk-soft hover:border-white/20'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {flagFor(playerCountry(name)) && (
                        <Image src={flagFor(playerCountry(name))!} alt={playerCountry(name) ?? ''} width={20} height={14} className="rounded-sm object-cover w-5 h-3.5" />
                      )}
                      {name}
                      <span className="font-mono text-[9px] font-normal text-wk-muted">{playerCountry(name)}</span>
                      {answer === name && <span className="font-mono text-[10px]">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            ) : inputMode === 'team' ? (
              /* ── Team picker ── */
              <div className="space-y-2">
                {/* Current selection */}
                <button
                  onClick={() => setShowPicker((v) => !v)}
                  className={`w-full flex items-center gap-3 rounded border px-3 py-2.5 text-left transition-colors ${
                    showPicker
                      ? 'border-wk-gold/50 bg-wk-gold/5'
                      : 'border-white/10 bg-wk-bg2 hover:border-white/20'
                  }`}
                >
                  {selectedTeam ? (
                    <>
                      <Image src={selectedTeam.flag_url} alt={selectedTeam.name} width={28} height={20} className="rounded-sm object-cover shrink-0 w-7 h-5" />
                      <span className="flex-1 text-sm font-semibold text-wk-gold">{selectedTeam.name}</span>
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-wk-muted">Kies een land…</span>
                  )}
                  <svg className={`w-4 h-4 text-wk-muted transition-transform ${showPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                {showPicker && (
                  <div className="rounded-xl border border-white/10 bg-wk-bg2 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10">
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Zoek land…"
                        autoFocus
                        className="w-full bg-transparent text-sm text-wk-text placeholder:text-wk-muted focus:outline-none"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                      {filteredTeams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => selectTeam(team)}
                          disabled={isPending}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
                            answer === team.name ? 'bg-wk-gold/10' : ''
                          }`}
                        >
                          <Image src={team.flag_url} alt={team.name} width={28} height={20} className="rounded-sm object-cover shrink-0 w-7 h-5" />
                          <span className={`text-sm font-medium ${answer === team.name ? 'text-wk-gold' : 'text-wk-text'}`}>
                            {team.name}
                          </span>
                          {answer === team.name && (
                            <span className="ml-auto font-mono text-[10px] text-wk-gold">✓</span>
                          )}
                        </button>
                      ))}
                      {filteredTeams.length === 0 && (
                        <p className="px-3 py-4 font-mono text-xs text-wk-muted text-center tracking-[0.12em]">Geen resultaten.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Save if selection changed but not auto-saved */}
                {answer && !saved && !isPending && (
                  <button
                    onClick={() => handleSave()}
                    className="w-full rounded bg-wk-green py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Opslaan
                  </button>
                )}
              </div>
            ) : (
              /* ── Free text ── */
              <div className="flex gap-2">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); setSaved(false) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Jouw antwoord…"
                  className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm text-wk-text placeholder:text-wk-muted focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                />
                <button
                  onClick={() => handleSave()}
                  disabled={isPending || !answer.trim()}
                  className={`rounded px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50 ${
                    saved
                      ? 'bg-wk-green/10 border border-wk-green/30 text-wk-green'
                      : 'bg-wk-green text-white hover:opacity-90'
                  }`}
                >
                  {isPending ? '…' : saved ? '✓' : 'Opslaan'}
                </button>
              </div>
            )
          ) : (
            /* ── Closed state ── */
            <div className="rounded bg-wk-bg2 border border-white/10 px-3 py-2">
              {existingAnswer?.answer ? (
                <div className="flex items-center gap-3">
                  {inputMode === 'team' && (() => {
                    const t = teams.find((t) => t.name === existingAnswer.answer)
                    return t ? <Image src={t.flag_url} alt={t.name} width={28} height={20} className="rounded-sm object-cover shrink-0 w-7 h-5" /> : null
                  })()}
                  {inputMode !== 'team' && flagFor(playerCountry(existingAnswer.answer)) && (
                    <Image src={flagFor(playerCountry(existingAnswer.answer))!} alt={playerCountry(existingAnswer.answer) ?? ''} width={28} height={20} className="rounded-sm object-cover shrink-0 w-7 h-5" />
                  )}
                  <p className="text-sm text-wk-soft">
                    {existingAnswer.answer}
                    {inputMode !== 'team' && playerCountry(existingAnswer.answer) && (
                      <span className="ml-2 font-mono text-[10px] text-wk-muted">{playerCountry(existingAnswer.answer)}</span>
                    )}
                  </p>
                </div>
              ) : (
                <p className="font-mono text-xs text-wk-muted tracking-[0.12em] italic">Geen antwoord ingediend</p>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className={`px-5 py-2 font-mono text-[10px] font-semibold text-white tracking-[0.12em] uppercase ${toast.ok ? 'bg-wk-green' : 'bg-wk-red'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
