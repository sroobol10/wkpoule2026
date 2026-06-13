'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AvatarCircle } from '@/components/avatar-circle'
import { preBonusIndex } from '@/lib/bonus-order'
import { playerCountry } from '@/lib/player-countries'

// ─── Types ────────────────────────────────────────────────────────────────────

export type KampioenverdeligEntry = {
  answer: string
  count: number
  flag_url: string | null
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
  played: boolean
  count: number
}

export type JokerWinstEntry = {
  userId: string
  username: string
  avatarUrl: string | null
  extra: number  // extra punten dankzij jokers (verdubbeling)
  played: number // aantal jokers op al gescoorde wedstrijden
  rank: number   // positie in de volledige ranking
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
  currentUserId: string
  leagues: { id: string; name: string }[]
  selectedLeague: string | null
  kampioenStats: KampioenverdeligEntry[]
  totalDeelnemers: number
  bonusQuestionStats: BonusQuestionStat[]
  jokerStats: JokerStat[]
  jokerWinst: JokerWinstEntry[]
  verloop: VerloopData | null
  dayPoints: DayPointsEntry[]
  teamFlags: Record<string, string> // landnaam → vlag-URL
}

const MEDAL = ['🥇', '🥈', '🥉']

// flagcdn-URLs in de database zijn w80 (80px breed) — voor grote tegels te wazig
const hiResFlag = (url: string) => url.replace('/w80/', '/w640/')

// GOAT-vraag: binaire keuze tussen Ronaldo en Messi (zelfde herkenning als op de bonusvragenpagina)
const isGoatQuestion = (q: string) =>
  q.toLowerCase().includes('goat') || q.toLowerCase().includes('ronaldo') || q.toLowerCase().includes('messi')

// Teaser-kaart die in het bonusvragen-rijtje de GOAT-vraag vervangt
function GoatTeaser() {
  return (
    <Link
      href="/goat"
      className="block bg-wk-surface border border-white/10 rounded-xl hover:border-wk-gold/40 transition-colors group overflow-hidden"
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
  )
}

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
  currentUserId,
  leagues,
  selectedLeague,
  kampioenStats,
  totalDeelnemers,
  bonusQuestionStats,
  jokerStats,
  jokerWinst,
  verloop,
  dayPoints,
  teamFlags,
}: Props) {
  const preBonusStats = bonusQuestionStats
    .filter((q) => q.type === 'pre_tournament')
    .sort((a, b) => preBonusIndex(a.question) - preBonusIndex(b.question))
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

      {/* League-filter — alleen voor leden van meerdere leagues */}
      {leagues.length > 1 && (
        <div className="animate-fade-up flex flex-wrap gap-1.5" style={{ animationDelay: '15ms' }}>
          {leagues.map((l) => (
            <Link
              key={l.id}
              href={`/statistieken?league=${l.id}`}
              className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
                selectedLeague === l.id
                  ? 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
                  : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
              }`}
            >
              {l.name}
            </Link>
          ))}
          <Link
            href="/statistieken"
            className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors ${
              selectedLeague === null
                ? 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
                : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
            }`}
          >
            Beiden
          </Link>
        </div>
      )}

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
                      {stat.played && (
                        <span className="ml-1.5 font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-1.5 py-0.5 tracking-widest align-middle" title="Wedstrijd is gespeeld">
                          🏁
                        </span>
                      )}
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

      {/* Joker-winst per deelnemer */}
      {jokerWinst.length > 0 && tournamentStarted && (
        <section className="animate-fade-up" style={{ animationDelay: '275ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Joker-winst ★ — extra punten dankzij jokers
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {jokerWinst.map((entry) => {
              const maxExtra = Math.max(jokerWinst[0]?.extra ?? 0, 1)
              const pct = Math.round((entry.extra / maxExtra) * 100)
              const isMe = entry.userId === currentUserId
              return (
                <div key={entry.userId} className={`px-5 py-3 ${isMe ? 'bg-wk-gold/5' : ''}`}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="font-mono text-xs text-wk-muted w-5 text-center shrink-0">
                      {entry.rank <= 3 && entry.extra > 0 ? MEDAL[entry.rank - 1] : entry.rank}
                    </span>
                    <AvatarCircle username={entry.username} avatarUrl={entry.avatarUrl} size={24} />
                    <span className={`flex-1 text-sm truncate ${isMe ? 'font-bold text-wk-gold' : 'font-semibold text-wk-text'}`}>
                      {entry.username}
                    </span>
                    <span className="font-mono text-[10px] text-wk-muted shrink-0">
                      {entry.played} {entry.played === 1 ? 'joker' : 'jokers'} gespeeld
                    </span>
                    <span className={`font-mono text-xs font-bold shrink-0 w-10 text-right ${isMe ? 'text-wk-gold' : 'text-wk-soft'}`}>
                      +{entry.extra}
                    </span>
                  </div>
                  <div className="ml-8 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <AnimatedBar pct={pct} color={isMe ? 'bg-wk-gold' : 'bg-wk-muted/40'} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.12em] mt-1.5">
            Een joker verdubbelt de punten; de winst is het verschil met spelen zonder joker
          </p>
        </section>
      )}

      {/* Algemene bonusvragen — antwoordverdeling */}
      {bonusQuestionStats.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: '300ms' }}>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Algemene bonusvragen
          </p>
          <div className="space-y-4">
            {preBonusStats.length > 0 && (
              <div className="space-y-3">
                {preBonusStats.map((q) =>
                  isGoatQuestion(q.question)
                    ? <GoatTeaser key={q.id} />
                    : <BonusQuestionCard key={q.id} stat={q} teamFlags={teamFlags} />
                )}
              </div>
            )}
            {dailyBonusStats.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[9px] text-wk-muted tracking-[0.18em] uppercase">
                  Dagelijkse vragen
                </p>
                {dailyBonusStats.map((q) => (
                  <BonusQuestionCard key={q.id} stat={q} teamFlags={teamFlags} />
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

// ─── Bonus question card ──────────────────────────────────────────────────────

// Vragen waarbij een vlag bij het antwoord hoort. Topscorer/beste speler →
// land via de speler; goalgettergigant/desastreuze/kaartenkoning → antwoord is land.
function answerFlag(question: string, answer: string, teamFlags: Record<string, string>): string | null {
  const q = question.toLowerCase()
  const playerBased = q.includes('topscorer') || q.includes('beste speler')
  const countryBased = q.includes('goalgettergigant') || q.includes('desastreuze') || q.includes('kaartenkoning')
  if (playerBased) {
    const land = playerCountry(answer)
    return land ? (teamFlags[land] ?? null) : null
  }
  if (countryBased) return teamFlags[answer] ?? null
  return null
}

function BonusQuestionCard({ stat, teamFlags }: { stat: BonusQuestionStat; teamFlags: Record<string, string> }) {
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
          {stat.top_answers.map(({ answer, count, pct, is_correct }) => {
            const flag = answerFlag(stat.question, answer, teamFlags)
            return (
              <div key={answer} className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 shrink-0">
                  {flag && (
                    <Image src={flag} alt="" width={20} height={14} className="rounded-sm object-cover shrink-0 w-5 h-3.5" />
                  )}
                  <span className={`font-mono text-xs font-semibold whitespace-nowrap ${is_correct ? 'text-wk-green' : 'text-wk-soft'}`}>
                    {answer}
                    {is_correct && <span className="ml-1 text-wk-green">✓</span>}
                  </span>
                </div>
                <div className="flex-1 min-w-[28px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <AnimatedBar pct={pct} color={is_correct ? 'bg-wk-green' : 'bg-wk-muted/40'} />
                </div>
                <span className="font-mono text-[9px] text-wk-muted shrink-0 w-11 text-right">
                  {count}× ({pct}%)
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-5 py-3">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] italic">Geen antwoorden.</p>
        </div>
      )}
    </div>
  )
}

