'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { saveBonusAnswer } from '@/app/actions/bonus'

type Question = {
  id: string
  question: string
  description: string | null
  type: string
  unlock_date: string | null
  correct_answer_set: boolean
}
type AnswerEntry = { question_id: string; answer: string; points_awarded: number | null }
type Team = { id: string; name: string; flag_url: string }

type Props = {
  questions: Question[]
  answerMap: Record<string, AnswerEntry>
  teams: Team[]
  anyMatchPlayed?: boolean
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

export default function BonusvragenClient({ questions, answerMap, teams, anyMatchPlayed = false }: Props) {
  const preTournament = questions.filter((q) => q.type === 'pre_tournament')
  const daily = questions.filter((q) => q.type === 'daily')
  const answeredCount = questions.filter((q) => answerMap[q.id]?.answer).length

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Extra punten</p>
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Bonusvragen</h1>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
          {answeredCount} / {questions.length} beantwoord
        </p>
      </div>

      {preTournament.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[10px] text-wk-red border border-wk-red/30 rounded-full px-3 py-1 tracking-[0.16em] uppercase">
              Vóór het toernooi
            </span>
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
              {preTournament.filter((q) => answerMap[q.id]?.answer).length}/{preTournament.length} · 5 pt per goed antwoord
            </span>
          </div>
          <div className="space-y-3">
            {preTournament.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                existingAnswer={answerMap[q.id] ?? null}
                accentClass="text-wk-red"
                teams={isTeamQuestion(q.question) ? teams : []}
                tournamentStarted={anyMatchPlayed}
              />
            ))}
          </div>
        </section>
      )}

      {daily.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[10px] text-wk-blue border border-wk-blue/30 rounded-full px-3 py-1 tracking-[0.16em] uppercase">
              Dagelijkse vragen
            </span>
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">
              {daily.filter((q) => answerMap[q.id]?.answer).length}/{daily.length} · 2 pt per goed antwoord
            </span>
          </div>
          <div className="space-y-3">
            {daily.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                existingAnswer={answerMap[q.id] ?? null}
                accentClass="text-wk-blue"
                teams={[]}
              />
            ))}
          </div>
        </section>
      )}

      {questions.length === 0 && (
        <div className="bg-wk-surface border border-white/10 rounded-xl p-8 text-center">
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Nog geen bonusvragen beschikbaar.</p>
        </div>
      )}
    </div>
  )
}

function QuestionCard({
  question,
  existingAnswer,
  accentClass,
  teams,
  tournamentStarted = false,
}: {
  question: Question
  existingAnswer: AnswerEntry | null
  accentClass: string
  teams: Team[]
  tournamentStarted?: boolean
}) {
  const [answer, setAnswer] = useState(existingAnswer?.answer ?? '')
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [saved, setSaved] = useState(!!existingAnswer?.answer)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')

  const deadline = question.unlock_date ? new Date(question.unlock_date) : null
  // Pre-tournament vragen gaan op slot zodra het toernooi begint (eerste wedstrijd gespeeld)
  const closed = question.type === 'pre_tournament'
    ? tournamentStarted
    : (deadline ? deadline <= new Date() : false)
  const pts      = existingAnswer?.points_awarded
  const isTeam   = teams.length > 0

  const selectedTeam = isTeam ? teams.find((t) => t.name === answer) : null

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleSave(val?: string) {
    const finalAnswer = val ?? answer
    if (!finalAnswer.trim() || closed) return
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

  const accentBg = accentClass === 'text-wk-red' ? 'bg-wk-red' : 'bg-wk-blue'

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
                <p className="font-mono text-[10px] text-wk-muted tracking-widest mt-0.5 leading-relaxed">{question.description}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {pts !== null && pts !== undefined && (
                <span className={`font-mono text-[10px] font-bold px-2 py-1 rounded-full border tracking-[0.12em] uppercase ${
                  pts > 0
                    ? 'bg-wk-green/10 border-wk-green/30 text-wk-green'
                    : 'bg-white/5 border-white/10 text-wk-muted'
                }`}>
                  {pts} pt
                </span>
              )}
              {closed && pts === null && (
                <span className="font-mono text-[10px] text-wk-gold border border-wk-gold/30 rounded-full px-2 py-0.5 tracking-widest uppercase">
                  🔒 Gesloten
                </span>
              )}
            </div>
          </div>

          {/* Deadline */}
          {deadline && !closed && (
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase mb-3">
              Deadline: {format(deadline, 'EEEE d MMMM · HH:mm', { locale: nl })}
            </p>
          )}

          {/* Answer area */}
          {!closed ? (
            isTeam ? (
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
                  {isTeam && (() => {
                    const t = teams.find((t) => t.name === existingAnswer.answer)
                    return t ? <Image src={t.flag_url} alt={t.name} width={28} height={20} className="rounded-sm object-cover shrink-0 w-7 h-5" /> : null
                  })()}
                  <p className="text-sm text-wk-soft">{existingAnswer.answer}</p>
                </div>
              ) : (
                <p className="font-mono text-xs text-wk-muted tracking-[0.12em] italic">Geen antwoord ingediend</p>
              )}
              {question.correct_answer_set && (
                <p className="font-mono text-[10px] text-wk-green tracking-[0.12em] uppercase mt-1">Correct antwoord bekendgemaakt</p>
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
