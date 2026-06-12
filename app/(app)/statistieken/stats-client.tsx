'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AvatarCircle } from '@/components/avatar-circle'

// ─── Types ────────────────────────────────────────────────────────────────────

export type KampioenverdeligEntry = {
  answer: string
  count: number
  flag_url: string | null
}

export type ScoreDist = {
  predicted_home: number
  predicted_away: number
  count: number
}

export type MatchStat = {
  id: string
  match_number: number
  kickoff_at: string
  home_team: string
  away_team: string
  home_flag: string | null
  away_flag: string | null
  total_predictions: number
  distribution: ScoreDist[]
}

export type AccuracyStats = {
  playedMatches: number
  totalPredictions: number
  exactCount: number
  correctResultCount: number
}

export type BonusQuestionStat = {
  id: string
  question: string
  type: string
  unlock_date: string | null
  correct_answer_set: boolean
  total_answers: number
  participation_pct: number
  top_answers: { answer: string; count: number; pct: number; is_correct: boolean }[]
}

export type JokerStat = {
  matchId: string
  homeTeam: string
  awayTeam: string
  group: string
  count: number
}

export type JokerBestEntry = {
  userId: string
  username: string
  avatarUrl: string | null
  match: string
  group: string
  pts: number
}

export type JokerRendement = {
  total: number
  cashed: number
  cashedPct: number
  avgExtra: number
  totalExtra: number
  best: JokerBestEntry[]
}

export type VerloopData = {
  days: string[]
  series: {
    userId: string
    username: string
    isCurrentUser: boolean
    values: number[]
  }[]
}

export type DayPointsEntry = { day: string; pts: number }

type Props = {
  tournamentStarted: boolean
  kampioenStats: KampioenverdeligEntry[]
  groupedMatches: Record<string, MatchStat[]>
  totalDeelnemers: number
  accuracyStats: AccuracyStats | null
  bonusQuestionStats: BonusQuestionStat[]
  jokerStats: JokerStat[]
  jokerRendement: JokerRendement | null
  verloop: VerloopData | null
  dayPoints: DayPointsEntry[]
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']
const MEDAL = ['🥇', '🥈', '🥉']

// flagcdn-URLs in de database zijn w80 (80px breed) — voor grote tegels te wazig
const hiResFlag = (url: string) => url.replace('/w80/', '/w640/')

// ─── Animated bar ─────────────────────────────────────────────────────────────

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 150)
    return () => clearTimeout(t)
  }, [pct])
  return (
    <div
      className={`h-full rounded-full ${color}`}
      style={{ width: `${width}%`, transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)' }}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StatsClient({
  tournamentStarted,
  kampioenStats,
  groupedMatches,
  totalDeelnemers,
  accuracyStats,
  bonusQuestionStats,
  jokerStats,
  jokerRendement,
  verloop,
  dayPoints,
}: Props) {
  const [activeGroup, setActiveGroup] = useState('A')
  const [openMatch, setOpenMatch] = useState<string | null>(null)

  const availableGroups = GROUPS.filter((g) => groupedMatches[g]?.length)

  const preBonusStats = bonusQuestionStats.filter((q) => q.type === 'pre_tournament')
  const dailyBonusStats = bonusQuestionStats.filter((q) => q.type === 'daily')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-up" style={{ animationDelay: '0ms' }}>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Overzicht</p>
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Statistieken</h1>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
          {totalDeelnemers} {totalDeelnemers === 1 ? 'deelnemer' : 'deelnemers'}
        </p>
      </div>

      {/* GOAT-duel teaser */}
      <Link
        href="/goat"
        className="block animate-fade-up bg-wk-surface border border-white/10 rounded-xl hover:border-wk-gold/40 transition-colors group overflow-hidden"
        style={{ animationDelay: '25ms' }}
      >
        <div className="flex items-stretch gap-3 sm:gap-5 px-4 sm:px-5">
          <Image
            src="/messi.png"
            alt="Lionel Messi"
            width={96}
            height={128}
            className="h-20 sm:h-28 w-auto object-contain object-bottom self-end shrink-0 drop-shadow-lg group-hover:scale-105 transition-transform"
          />
          <div className="min-w-0 flex-1 py-4 self-center text-center">
            <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Bonusvraag · Het duel</p>
            <p className="font-display text-lg text-wk-text uppercase leading-none">🐐 Messi vs Ronaldo</p>
            <p className="font-mono text-[10px] text-wk-muted mt-1.5 tracking-[0.12em]">
              Bekijk de tussenstand van het GOAT-duel en wie er voor wie koos
            </p>
          </div>
          <Image
            src="/ronaldo.png"
            alt="Cristiano Ronaldo"
            width={96}
            height={128}
            className="h-20 sm:h-28 w-auto object-contain object-bottom self-end shrink-0 drop-shadow-lg group-hover:scale-105 transition-transform"
          />
        </div>
      </Link>

      {/* Head-to-head teaser */}
      <Link
        href="/vergelijk"
        className="block animate-fade-up bg-wk-surface border border-white/10 rounded-xl px-5 py-4 hover:border-wk-gold/40 transition-colors group"
        style={{ animationDelay: '35ms' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Vergelijk · Deelnemers</p>
            <p className="font-display text-lg text-wk-text uppercase leading-none">⚔️ Head-to-head</p>
            <p className="font-mono text-[10px] text-wk-muted mt-1.5 tracking-[0.12em]">
              Zet twee deelnemers tegenover elkaar — punten, voorspellingen en bonuskeuzes
            </p>
          </div>
          <span className="font-display text-xl text-wk-gold group-hover:translate-x-1 transition-transform shrink-0">→</span>
        </div>
      </Link>

      {/* Nauwkeurigheid */}
      {accuracyStats && (
        <section className="animate-fade-up" style={{ animationDelay: '50ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Nauwkeurigheid · {accuracyStats.playedMatches} wedstrijden gespeeld
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            <AccuracyRow
              label="Exacte uitslag"
              count={accuracyStats.exactCount}
              total={accuracyStats.totalPredictions}
              accent
            />
            <AccuracyRow
              label="Correct resultaat"
              count={accuracyStats.correctResultCount}
              total={accuracyStats.totalPredictions}
            />
          </div>
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.12em] mt-1.5">
            {accuracyStats.totalPredictions.toLocaleString('nl')} voorspellingen in totaal
          </p>
        </section>
      )}

      {/* Klassementverloop */}
      {verloop && tournamentStarted && (
        <section className="animate-fade-up" style={{ animationDelay: '75ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Klassementverloop 📈 — top 5 per speeldag
          </p>
          <VerloopChart data={verloop} />
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.12em] mt-1.5">
            Cumulatieve wedstrijdpunten uit de groepsfase
          </p>
        </section>
      )}

      {/* Punten per speeldag */}
      {dayPoints.length > 1 && tournamentStarted && (
        <section className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Punten-regen 🌧️ — gescoorde punten per speeldag
          </p>
          <DayPointsChart data={dayPoints} />
        </section>
      )}

      {/* WK-kampioen verdeling */}
      {tournamentStarted ? (
        <section className="animate-fade-up" style={{ animationDelay: '150ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Voorspeld wereldkampioen
          </p>

          {kampioenStats.length === 0 ? (
            <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-6 text-center">
              <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Nog geen antwoorden ingediend.</p>
            </div>
          ) : (
            <>
              {/* Vlaggenmuur — tegelgrootte schaalt met aantal stemmen */}
              <div className="grid grid-cols-4 sm:grid-cols-6 auto-rows-[68px] sm:auto-rows-[76px] gap-1.5">
                {kampioenStats.map(({ answer, count, flag_url }, i) => {
                  const pct = totalDeelnemers > 0 ? Math.round((count / totalDeelnemers) * 100) : 0
                  const isTop = i === 0
                  const span = isTop
                    ? 'col-span-2 row-span-2'
                    : i <= 2
                      ? 'col-span-2'
                      : 'col-span-1'
                  return (
                    <div
                      key={answer}
                      style={{ animationDelay: `${Math.min(i * 60, 700)}ms` }}
                      className={`${span} animate-scale-in group relative rounded-xl overflow-hidden border transition-colors duration-200 ${
                        isTop
                          ? 'border-wk-gold/50 shadow-[0_0_24px_-6px_rgba(var(--color-wk-gold-raw),0.5)]'
                          : 'border-white/10 hover:border-white/25'
                      }`}
                    >
                      {flag_url ? (
                        <Image
                          src={hiResFlag(flag_url)}
                          alt={answer}
                          fill
                          sizes="(max-width: 640px) 50vw, 33vw"
                          className="object-cover opacity-80 group-hover:scale-110 transition-transform duration-300"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-wk-bg2" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                      {isTop && <span className="absolute top-1.5 right-2 text-base drop-shadow">👑</span>}
                      <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 sm:px-2.5 sm:pb-2">
                        <p className={`font-display uppercase leading-none truncate drop-shadow ${
                          isTop
                            ? 'text-wk-gold text-base sm:text-xl'
                            : i <= 2
                              ? 'text-wk-text text-xs sm:text-sm'
                              : 'text-wk-text text-[10px]'
                        }`}>
                          {answer}
                        </p>
                        <p className={`font-mono text-wk-soft mt-0.5 ${isTop ? 'text-[10px] sm:text-xs' : 'text-[9px]'}`}>
                          {count}× · {pct}%
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.12em] mt-1.5">
                Favoriet van de poule — hoe groter de tegel, hoe vaker getipt als wereldkampioen
              </p>
            </>
          )}
        </section>
      ) : (
        <section className="animate-fade-up" style={{ animationDelay: '150ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Voorspeld wereldkampioen
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-6 text-center space-y-2">
            <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">
              🔒 Zichtbaar na start van het toernooi
            </p>
          </div>
        </section>
      )}

      {/* Uitslagverdeling per wedstrijd */}
      {availableGroups.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Uitslagverdeling — gespeelde wedstrijden
          </p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {availableGroups.map((g) => (
              <button
                key={g}
                onClick={() => { setActiveGroup(g); setOpenMatch(null) }}
                className={`rounded px-3 py-1.5 text-xs font-mono font-bold tracking-[0.14em] uppercase transition-colors ${
                  activeGroup === g
                    ? 'bg-wk-surface border border-wk-gold/50 text-wk-gold'
                    : 'bg-wk-bg2 border border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {(groupedMatches[activeGroup] ?? []).map((match) => (
              <MatchDistRow
                key={match.id}
                match={match}
                isOpen={openMatch === match.id}
                onToggle={() => setOpenMatch(openMatch === match.id ? null : match.id)}
              />
            ))}
            {(groupedMatches[activeGroup] ?? []).length === 0 && (
              <div className="px-5 py-6 text-center">
                <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Nog geen gespeelde wedstrijden in groep {activeGroup}.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {availableGroups.length === 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Uitslagverdeling
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-6 text-center space-y-2">
            <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">
              Beschikbaar zodra de eerste wedstrijd is begonnen.
            </p>
          </div>
        </section>
      )}

      {/* Joker hotspots */}
      {jokerStats.length > 0 && tournamentStarted && (
        <section className="animate-fade-up" style={{ animationDelay: '250ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Joker hotspots — meest gekozen wedstrijden
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {jokerStats.map((stat, i) => {
              const maxCount = jokerStats[0]?.count ?? 1
              const pct = Math.round((stat.count / maxCount) * 100)
              const isTop = i === 0
              return (
                <div key={stat.matchId} className="px-5 py-3">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="font-mono text-[10px] text-wk-muted w-5 text-center shrink-0">
                      {stat.group}
                    </span>
                    <span className={`flex-1 text-sm font-semibold truncate ${isTop ? 'text-wk-gold' : 'text-wk-text'}`}>
                      {stat.homeTeam} – {stat.awayTeam}
                    </span>
                    <span className={`font-mono text-xs font-bold shrink-0 ${isTop ? 'text-wk-gold' : 'text-wk-soft'}`}>
                      {stat.count}×
                    </span>
                  </div>
                  <div className="ml-8 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <AnimatedBar pct={pct} color={isTop ? 'bg-wk-gold' : 'bg-wk-muted/40'} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Joker-rendement */}
      {jokerRendement && tournamentStarted && (
        <section className="animate-fade-up" style={{ animationDelay: '275ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Joker-rendement ★ — wat leverden ze op?
          </p>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <JokerStatCard
              value={`${jokerRendement.cashedPct}%`}
              label="Verzilverd"
              sub={`${jokerRendement.cashed}/${jokerRendement.total} jokers`}
            />
            <JokerStatCard
              value={`+${jokerRendement.avgExtra}`}
              label="Gem. winst"
              sub="extra pt per joker"
            />
            <JokerStatCard
              value={`+${jokerRendement.totalExtra}`}
              label="Totale winst"
              sub="extra pt in de poule"
            />
          </div>

          {jokerRendement.best.length > 0 && (
            <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-2.5 border-b border-white/5">
                <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase">Beste joker-inzetten</p>
              </div>
              <div className="divide-y divide-white/5">
                {jokerRendement.best.map((b, i) => (
                  <div key={`${b.userId}-${b.match}`} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="font-mono text-xs text-wk-muted w-5 text-center shrink-0">
                      {i < 3 ? MEDAL[i] : i + 1}
                    </span>
                    <AvatarCircle username={b.username} avatarUrl={b.avatarUrl} size={24} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${i === 0 ? 'text-wk-gold' : 'text-wk-text'}`}>
                        {b.username}
                      </p>
                      <p className="font-mono text-[10px] text-wk-muted truncate">
                        {b.group} · {b.match}
                      </p>
                    </div>
                    <span className={`font-mono text-xs font-bold shrink-0 ${i === 0 ? 'text-wk-gold' : 'text-wk-soft'}`}>
                      {b.pts}pt <span className="text-wk-muted font-normal">(+{b.pts / 2})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.12em] mt-1.5">
            Een joker verdubbelt de punten; de winst is het verschil met spelen zonder joker
          </p>
        </section>
      )}

      {/* Bonus-vraag statistieken */}
      {bonusQuestionStats.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '300ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Bonusvragen — antwoordverdeling
          </p>
          <div className="space-y-4">
            {preBonusStats.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[9px] text-wk-red/70 tracking-[0.18em] uppercase">
                  Vóór het toernooi
                </p>
                {preBonusStats.map((q) => (
                  <BonusQuestionCard key={q.id} stat={q} />
                ))}
              </div>
            )}
            {dailyBonusStats.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[9px] text-wk-blue/70 tracking-[0.18em] uppercase">
                  Dagelijkse vragen
                </p>
                {dailyBonusStats.map((q) => (
                  <BonusQuestionCard key={q.id} stat={q} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Klassementverloop lijngrafiek ────────────────────────────────────────────

// Kleuren voor de niet-eigen series; de ingelogde gebruiker is altijd goud
const SERIES_COLORS = ['#2D6BE5', '#E63946', '#2EA84B', '#A78BFA', '#C8CCD6']

function VerloopChart({ data }: { data: VerloopData }) {
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 200)
    return () => clearTimeout(t)
  }, [])

  const W = 600, H = 240, PL = 36, PR = 14, PT = 12, PB = 26
  const maxVal = Math.max(...data.series.flatMap((s) => s.values), 1)
  const x = (i: number) => PL + (i / Math.max(data.days.length - 1, 1)) * (W - PL - PR)
  const y = (v: number) => PT + (1 - v / maxVal) * (H - PT - PB)
  const colorOf = (s: VerloopData['series'][number], si: number) =>
    s.isCurrentUser ? '#F4B92E' : SERIES_COLORS[si % SERIES_COLORS.length]
  // Maximaal ~8 x-labels, anders wordt het een brij
  const labelEvery = Math.max(1, Math.ceil(data.days.length / 8))

  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Puntenverloop per speeldag">
        {/* Horizontale gridlijnen + y-as labels */}
        {Array.from({ length: 5 }, (_, i) => {
          const v = Math.round((maxVal / 4) * i)
          return (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
              <text x={PL - 7} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#7C8398" fontFamily="ui-monospace, monospace">
                {v}
              </text>
            </g>
          )
        })}
        {/* X-as labels */}
        {data.days.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={`${d}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#7C8398" fontFamily="ui-monospace, monospace">
              {d}
            </text>
          ) : null
        )}
        {/* Lijnen — tekenen zich in via stroke-dashoffset */}
        {data.series.map((s, si) => {
          const color = colorOf(s, si)
          const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
          const last = s.values[s.values.length - 1]
          return (
            <g key={s.userId}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={s.isCurrentUser ? 2.5 : 1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.9}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={drawn ? 0 : 1}
                style={{ transition: `stroke-dashoffset 1.3s ease-out ${si * 0.12}s` }}
              />
              <circle
                cx={x(s.values.length - 1)}
                cy={y(last)}
                r={3}
                fill={color}
                opacity={drawn ? 1 : 0}
                style={{ transition: 'opacity 0.3s', transitionDelay: `${1.1 + si * 0.12}s` }}
              />
            </g>
          )
        })}
      </svg>

      {/* Legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {data.series.map((s, si) => (
          <span key={s.userId} className="flex items-center gap-1.5 font-mono text-[10px] text-wk-soft">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(s, si) }} />
            <span className={`truncate max-w-28 ${s.isCurrentUser ? 'text-wk-gold font-bold' : ''}`}>
              {s.username}{s.isCurrentUser ? ' (jij)' : ''}
            </span>
            <span className="text-wk-muted">{s.values[s.values.length - 1]}pt</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Punten per speeldag ──────────────────────────────────────────────────────

function DayPointsChart({ data }: { data: DayPointsEntry[] }) {
  const max = Math.max(...data.map((d) => d.pts), 1)
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-4 pt-4 pb-3">
      <div className="flex items-end gap-1 sm:gap-1.5 h-36">
        {data.map((d, i) => {
          const isMax = d.pts === max && d.pts > 0
          return (
            <div key={`${d.day}-${i}`} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
              <span className={`font-mono text-[8px] mb-1 ${isMax ? 'text-wk-gold font-bold' : 'text-wk-muted'}`}>
                {d.pts}
              </span>
              <div
                className={`w-full rounded-t animate-podium-rise ${
                  isMax ? 'bg-gradient-to-t from-wk-gold/50 to-wk-gold' : 'bg-white/15'
                }`}
                style={{ height: `${Math.max((d.pts / max) * 100, 2)}%`, animationDelay: `${i * 70}ms` }}
              />
              <span className="font-mono text-[8px] text-wk-muted mt-1 truncate max-w-full">{d.day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Joker stat card ──────────────────────────────────────────────────────────

function JokerStatCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-3 py-3 text-center">
      <p className="font-display text-xl text-wk-gold leading-none">{value}</p>
      <p className="font-mono text-[9px] text-wk-soft tracking-widest uppercase mt-1">{label}</p>
      <p className="font-mono text-[9px] text-wk-muted tracking-widest mt-0.5">{sub}</p>
    </div>
  )
}

// ─── Accuracy row ─────────────────────────────────────────────────────────────

function AccuracyRow({ label, count, total, accent = false }: {
  label: string
  count: number
  total: number
  accent?: boolean
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex-1 text-sm font-semibold text-wk-text">{label}</span>
        <span className="font-mono text-xs text-wk-muted shrink-0">{count.toLocaleString('nl')}×</span>
        <span className={`font-mono text-sm font-bold shrink-0 w-12 text-right ${accent ? 'text-wk-gold' : 'text-wk-soft'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
        <AnimatedBar pct={pct} color={accent ? 'bg-wk-gold' : 'bg-wk-muted/40'} />
      </div>
    </div>
  )
}

// ─── Bonus question card ──────────────────────────────────────────────────────

function BonusQuestionCard({ stat }: { stat: BonusQuestionStat }) {
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-wk-text leading-snug flex-1">{stat.question}</p>
          <span className={`font-mono text-[10px] border rounded-full px-2.5 py-0.5 tracking-[0.12em] shrink-0 ${
            stat.participation_pct >= 80
              ? 'text-wk-green border-wk-green/30'
              : stat.participation_pct >= 50
                ? 'text-wk-gold border-wk-gold/30'
                : 'text-wk-muted border-white/15'
          }`}>
            {stat.participation_pct}% deelname
          </span>
        </div>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.1em] mt-0.5">
          {stat.total_answers} {stat.total_answers === 1 ? 'antwoord' : 'antwoorden'}
        </p>
      </div>

      {stat.top_answers.length > 0 ? (
        <div className="px-5 py-3 space-y-2">
          {stat.top_answers.map(({ answer, count, pct, is_correct }) => (
            <div key={answer} className="flex items-center gap-3">
              <span className={`font-mono text-xs font-semibold shrink-0 w-28 truncate ${
                is_correct ? 'text-wk-green' : 'text-wk-soft'
              }`}>
                {answer}
                {is_correct && <span className="ml-1 text-wk-green">✓</span>}
              </span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <AnimatedBar pct={pct} color={is_correct ? 'bg-wk-green' : 'bg-wk-muted/40'} />
              </div>
              <span className="font-mono text-[10px] text-wk-muted shrink-0 w-16 text-right">
                {count}× ({pct}%)
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-3">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] italic">Geen antwoorden.</p>
        </div>
      )}
    </div>
  )
}

// ─── Match distribution row ───────────────────────────────────────────────────

function MatchDistRow({
  match,
  isOpen,
  onToggle,
}: {
  match: MatchStat
  isOpen: boolean
  onToggle: () => void
}) {
  const top3 = match.distribution.slice(0, 3)

  // 1/X/2-verdeling afgeleid uit de scoreverdeling
  let homeWin = 0, draw = 0, awayWin = 0
  for (const d of match.distribution) {
    if (d.predicted_home > d.predicted_away) homeWin += d.count
    else if (d.predicted_home < d.predicted_away) awayWin += d.count
    else draw += d.count
  }
  const tugTotal = homeWin + draw + awayWin
  const tugPct = (n: number) => (tugTotal > 0 ? Math.round((n / tugTotal) * 100) : 0)

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-5 py-3.5 text-left hover:bg-white/5 transition-colors"
      >
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] text-wk-muted w-5 shrink-0">#{match.match_number}</span>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {match.home_flag && (
            <Image src={match.home_flag} alt={match.home_team} width={20} height={14}
              className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
          )}
          <span className="text-xs font-semibold text-wk-text truncate">{match.home_team}</span>
          <span className="font-mono text-[10px] text-wk-muted shrink-0">–</span>
          <span className="text-xs font-semibold text-wk-text truncate">{match.away_team}</span>
          {match.away_flag && (
            <Image src={match.away_flag} alt={match.away_team} width={20} height={14}
              className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
          )}
        </div>

        {top3[0] && !isOpen && (
          <span className="font-mono text-[10px] text-wk-gold shrink-0">
            {top3[0].predicted_home}–{top3[0].predicted_away}
          </span>
        )}

        <span className="font-mono text-[10px] text-wk-muted shrink-0">{match.total_predictions}×</span>

        <svg
          className={`w-3.5 h-3.5 text-wk-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Tug-of-war: waar leunt de poule? (1 / X / 2) */}
      {tugTotal > 0 && (
        <div className="mt-2.5 ml-8">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10 gap-px">
            <AnimatedBar pct={tugPct(homeWin)} color="bg-wk-blue/80" />
            <AnimatedBar pct={tugPct(draw)} color="bg-wk-soft/40" />
            <AnimatedBar pct={tugPct(awayWin)} color="bg-wk-red/80" />
          </div>
          <div className="flex justify-between mt-1 font-mono text-[8px] text-wk-muted tracking-widest">
            <span className="text-wk-blue">1 · {tugPct(homeWin)}%</span>
            <span>X · {tugPct(draw)}%</span>
            <span className="text-wk-red">2 · {tugPct(awayWin)}%</span>
          </div>
        </div>
      )}
      </button>

      {isOpen && (
        <div className="px-5 pb-4 space-y-1.5 border-t border-white/5 pt-3">
          {match.distribution.slice(0, 8).map(({ predicted_home, predicted_away, count }, i) => {
            const pct = match.total_predictions > 0
              ? Math.round((count / match.total_predictions) * 100)
              : 0
            return (
              <div key={`${predicted_home}-${predicted_away}`} className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-wk-gold w-8 text-right shrink-0">
                  {predicted_home}–{predicted_away}
                </span>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <AnimatedBar pct={pct} color={i === 0 ? 'bg-wk-gold' : 'bg-wk-muted/40'} />
                </div>
                <span className="font-mono text-[10px] text-wk-muted w-12 text-right shrink-0">
                  {count}× ({pct}%)
                </span>
              </div>
            )
          })}
          {match.distribution.length > 8 && (
            <p className="font-mono text-[9px] text-wk-muted/60 tracking-widest pt-1">
              +{match.distribution.length - 8} andere uitslagen
            </p>
          )}
          {match.total_predictions === 0 && (
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em]">Geen voorspellingen.</p>
          )}
          <div className="pt-2">
            <Link
              href={`/wedstrijd/${match.id}`}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-wk-gold tracking-[0.14em] uppercase hover:underline underline-offset-2"
            >
              Bekijk het duel — wie koos wat
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
