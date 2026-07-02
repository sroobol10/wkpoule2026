'use client'

import { useState, useEffect, Fragment } from 'react'
import Image from 'next/image'
import Link from 'next/link'
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
  top_answers: { answer: string; count: number; pct: number; points: number | null; is_correct: boolean; is_mine: boolean }[]
}

type Props = {
  tournamentStarted: boolean
  leagues: { id: string; name: string }[]
  selectedLeague: string | null
  kampioenStats: KampioenverdeligEntry[]
  totalDeelnemers: number
  bonusQuestionStats: BonusQuestionStat[]
  teamFlags: Record<string, string> // landnaam → vlag-URL
  eliminatedCountries?: string[]    // uitgeschakelde landen → grijs (bonusvragen)
  preSemiEliminatedCountries?: string[] // vóór de halve finale gesneuveld → grijs (kampioen-muur)
}

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
  leagues,
  selectedLeague,
  kampioenStats,
  totalDeelnemers,
  bonusQuestionStats,
  teamFlags,
  eliminatedCountries = [],
  preSemiEliminatedCountries = [],
}: Props) {
  const eliminatedSet = new Set(eliminatedCountries)
  // Kampioen-muur: alleen grijs als het land vóór de halve finale sneuvelde
  // (een halvefinalist die later verliest blijft dus normaal gekleurd).
  const champGraySet = new Set(preSemiEliminatedCountries.length ? preSemiEliminatedCountries : eliminatedCountries)
  const preBonusStats = bonusQuestionStats
    .filter((q) => q.type === 'pre_tournament')
    .sort((a, b) => preBonusIndex(a.question) - preBonusIndex(b.question))
  // Dagelijkse bonusvragen: meest recente bovenaan (omgekeerd op unlock_date)
  const dailyBonusStats = bonusQuestionStats
    .filter((q) => q.type === 'daily')
    .sort((a, b) => (b.unlock_date ?? '').localeCompare(a.unlock_date ?? ''))

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
                  const elim = champGraySet.has(answer)   // vóór de halve finale uit → grijs
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
                          className={`object-cover group-hover:scale-110 transition-transform duration-300 ${elim ? 'grayscale opacity-40' : 'opacity-80'}`}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-wk-bg2" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                      {isTop && <span className="absolute top-1.5 right-2 text-base drop-shadow">👑</span>}
                      {elim && <span className="absolute top-1.5 left-2 font-mono text-[8px] font-bold text-wk-red bg-black/50 rounded px-1 tracking-widest uppercase">uit</span>}
                      <div className="absolute inset-x-0 bottom-0 px-2 pb-1.5 sm:px-2.5 sm:pb-2">
                        <p className={`font-display uppercase leading-none truncate drop-shadow ${elim ? 'line-through opacity-70 ' : ''}${
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
                    : <BonusQuestionCard key={q.id} stat={q} teamFlags={teamFlags} eliminated={eliminatedSet} />
                )}
              </div>
            )}
            {dailyBonusStats.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[9px] text-wk-muted tracking-[0.18em] uppercase">
                  Dagelijkse vragen
                </p>
                {dailyBonusStats.map((q) => (
                  <BonusQuestionCard key={q.id} stat={q} teamFlags={teamFlags} eliminated={eliminatedSet} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
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

// Het land dat bij een antwoord hoort (voor de "uitgeschakeld"-markering).
function answerCountry(question: string, answer: string): string | null {
  const q = question.toLowerCase()
  const playerBased = q.includes('topscorer') || q.includes('beste speler')
  const countryBased = q.includes('goalgettergigant') || q.includes('desastreuze') || q.includes('kaartenkoning')
  if (playerBased) return playerCountry(answer)
  if (countryBased) return answer
  return null
}

// Mobiel: voornaam van spelers weglaten (topscorer/beste speler) en lange
// landnamen inkorten (kaartenkoning/desastreuze defensie) — scheelt ruimte.
const COUNTRY_ABBR_MOBILE: Record<string, string> = {
  'Bosnië-Herzegovina': 'Bosnië',
  'Verenigde Staten': 'VS',
}
const dropFirstName = (name: string) => {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

// Slug voor de aparte detailpagina (/statistiek/[key]) — alleen voor deze stats
function statDetailKey(question: string): string | null {
  const q = question.toLowerCase()
  if (q.includes('topscorer')) return 'topscorer'
  if (q.includes('beste speler')) return 'beste-speler'
  if (q.includes('gedoseer')) return 'gedoseerde-groepsfase'
  if (q.includes('goalgettergigant')) return 'goalgettergigant'
  if (q.includes('desastreuze')) return 'desastreuze-defensie'
  if (q.includes('kaartenkoning')) return 'kaartenkoning'
  return null
}

function BonusQuestionCard({ stat, teamFlags, eliminated }: { stat: BonusQuestionStat; teamFlags: Record<string, string>; eliminated: Set<string> }) {
  const q = stat.question.toLowerCase()
  const playerBased = q.includes('topscorer') || q.includes('beste speler')
  const countryBased = q.includes('goalgettergigant') || q.includes('desastreuze') || q.includes('kaartenkoning')
  const detailKey = statDetailKey(stat.question)
  const mobileLabel = (answer: string) => {
    if (playerBased) return dropFirstName(answer)
    if (countryBased) return COUNTRY_ABBR_MOBILE[answer] ?? answer
    return answer
  }
  const Header = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-wk-text leading-snug">{stat.question}</p>
        {detailKey && <span className="font-mono text-[10px] text-wk-gold tracking-[0.14em] uppercase shrink-0 mt-0.5">Wie koos wat →</span>}
      </div>
      <p className="font-mono text-[10px] text-wk-muted tracking-[0.1em] mt-0.5">
        {stat.total_answers} {stat.total_answers === 1 ? 'antwoord' : 'antwoorden'}
      </p>
    </>
  )
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
      {detailKey ? (
        <Link href={`/statistiek/${detailKey}`} className="block px-5 py-3.5 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
          {Header}
        </Link>
      ) : (
        <div className="px-5 py-3.5 border-b border-white/5">{Header}</div>
      )}

      {stat.top_answers.length > 0 ? (
        /* Grid met gedeelde naamkolom (auto) zodat alle balken op dezelfde x starten */
        <div className="px-5 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 sm:gap-x-3 gap-y-2">
          {stat.top_answers.map(({ answer, count, pct, points, is_correct, is_mine }) => {
            const flag = answerFlag(stat.question, answer, teamFlags)
            const land = answerCountry(stat.question, answer)
            const elim = !is_correct && !!land && eliminated.has(land)
            // Kleurregels:
            // - correct antwoord → groen (met ✓)
            // - eigen keuze, dagelijkse vraag met bekende uitslag & fout → rood
            //   (zelfde markering als de groepsfase-statistieken)
            // - eigen keuze, overig (algemeen of nog open) → geel, net als bij jokers
            let textColor = 'text-wk-soft'
            let barColor = 'bg-wk-muted/40'
            if (is_correct) {
              textColor = 'text-wk-green'; barColor = 'bg-wk-green'
            } else if (is_mine) {
              if (stat.type === 'daily' && stat.correct_answer_set) {
                textColor = 'text-wk-red'; barColor = 'bg-wk-red'
              } else {
                textColor = 'text-wk-gold'; barColor = 'bg-wk-gold'
              }
            }
            return (
              <Fragment key={answer}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {flag && (
                    <Image src={flag} alt="" width={20} height={14} className={`rounded-sm object-cover shrink-0 w-5 h-3.5 ${elim ? 'grayscale opacity-60' : ''}`} />
                  )}
                  <span className={`font-mono text-xs font-semibold whitespace-nowrap ${elim ? 'text-wk-muted/70 line-through decoration-wk-red/50' : textColor}`}>
                    <span className="sm:hidden">{mobileLabel(answer)}</span>
                    <span className="hidden sm:inline">{answer}</span>
                    {is_correct && <span className="ml-1 text-wk-green">✓</span>}
                  </span>
                </div>
                <div className="min-w-[28px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <AnimatedBar pct={pct} color={barColor} />
                </div>
                <span className="font-mono text-[9px] text-wk-muted text-right whitespace-nowrap">
                  {count}×{countryBased ? ` (${points ?? 0} pt)` : playerBased ? '' : ` (${pct}%)`}
                </span>
              </Fragment>
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

