'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AvatarCircle } from '@/components/avatar-circle'

export type Deelnemer = {
  id: string
  username: string
  avatarUrl: string | null
}

export type SpelerData = Deelnemer & {
  rank: number | null
  totalPts: number
  groupMatchPts: number
  groupStandingsPts: number
  knockoutPts: number
  bonusPrePts: number
  bonusDailyPts: number
  jokersPlayed: number
  exactHits: number
  correctResults: number
}

export type MatchVergelijk = {
  id: string
  kickoffAt: string
  homeTeam: string
  awayTeam: string
  homeFlag: string | null
  awayFlag: string | null
  actual: string | null // '2–1' of null zolang er geen uitslag is
  a: { pred: string; pts: number | null; joker: boolean } | null
  b: { pred: string; pts: number | null; joker: boolean } | null
}

export type BonusVergelijk = {
  question: string
  a: string | null
  b: string | null
}

const COLOR_A = '#2D6BE5' // wk-blue
const COLOR_B = '#E63946' // wk-red

function useCountUp(target: number, delay = 500, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) { setValue(0); return }
    let raf: number
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delay, duration])
  return value
}

// Spiegelbalk: groeit vanuit het midden naar buiten, winnaar in eigen kleur
function MirrorRow({ label, a, b, max, delay }: { label: string; a: number; b: number; max: number; delay: number }) {
  const [grow, setGrow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrow(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  const pctA = max > 0 ? (a / max) * 100 : 0
  const pctB = max > 0 ? (b / max) * 100 : 0
  const aWins = a > b
  const bWins = b > a
  return (
    <div className="grid grid-cols-[2.5rem_1fr_auto_1fr_2.5rem] items-center gap-2 sm:gap-3">
      <span className={`font-mono text-xs font-bold text-right ${aWins ? 'text-wk-gold' : 'text-wk-soft'}`}>{a}</span>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden flex justify-end">
        <div
          className="h-full rounded-full"
          style={{
            width: grow ? `${pctA}%` : '0%',
            background: COLOR_A,
            opacity: aWins ? 1 : 0.45,
            transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <span className="font-mono text-[9px] text-wk-muted tracking-[0.14em] uppercase w-16 sm:w-24 text-center shrink-0">
        {label}
      </span>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: grow ? `${pctB}%` : '0%',
            background: COLOR_B,
            opacity: bWins ? 1 : 0.45,
            transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <span className={`font-mono text-xs font-bold ${bWins ? 'text-wk-gold' : 'text-wk-soft'}`}>{b}</span>
    </div>
  )
}

function SpelerKop({ speler, color, isLeading, delay }: { speler: SpelerData; color: string; isLeading: boolean; delay: number }) {
  return (
    <div className="animate-podium-pop flex flex-col items-center min-w-0 flex-1" style={{ animationDelay: `${delay}s` }}>
      <div className="relative">
        {isLeading && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl drop-shadow-lg z-10">👑</span>
        )}
        <div
          className="absolute -inset-3 rounded-full blur-xl opacity-25 animate-pulse"
          style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }}
        />
        <div className="relative rounded-full shadow-xl ring-2 ring-offset-2 ring-offset-wk-bg" style={{ ['--tw-ring-color' as string]: color }}>
          <AvatarCircle username={speler.username} avatarUrl={speler.avatarUrl} size={72} />
        </div>
      </div>
      <Link
        href={`/deelnemers/${speler.id}`}
        className="max-w-full truncate mt-3 text-base font-bold text-wk-text hover:text-wk-gold hover:underline underline-offset-2"
      >
        {speler.username}
      </Link>
      {speler.rank !== null && (
        <span className="font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase mt-1">
          #{speler.rank} algemeen
        </span>
      )}
    </div>
  )
}

export default function VergelijkClient({
  deelnemers,
  poules,
  pouleId,
  idA,
  idB,
  spelerA,
  spelerB,
  matches,
  bonus,
}: {
  deelnemers: Deelnemer[]
  poules: { id: string; name: string }[]
  pouleId: string | null
  idA: string | null
  idB: string | null
  spelerA: SpelerData | null
  spelerB: SpelerData | null
  matches: MatchVergelijk[]
  bonus: BonusVergelijk[]
}) {
  const router = useRouter()
  const navigate = (a: string | null, b: string | null, poule: string | null = pouleId) => {
    const params = new URLSearchParams()
    if (poule) params.set('poule', poule)
    if (a) params.set('a', a)
    if (b) params.set('b', b)
    router.replace(`/vergelijk?${params.toString()}`)
  }

  const totalA = spelerA?.totalPts ?? 0
  const totalB = spelerB?.totalPts ?? 0
  const countA = useCountUp(totalA)
  const countB = useCountUp(totalB)
  const sum = totalA + totalB
  const pctA = sum > 0 ? (totalA / sum) * 100 : 50

  // Onderlinge stand: wie pakte per gespeelde wedstrijd de meeste punten?
  const scored = matches.filter((m) => m.a?.pts != null && m.b?.pts != null)
  const winsA = scored.filter((m) => (m.a!.pts ?? 0) > (m.b!.pts ?? 0)).length
  const winsB = scored.filter((m) => (m.b!.pts ?? 0) > (m.a!.pts ?? 0)).length
  const draws = scored.length - winsA - winsB

  const categories = spelerA && spelerB ? [
    { label: 'Wedstrijden', a: spelerA.groupMatchPts, b: spelerB.groupMatchPts },
    { label: 'Eindstand', a: spelerA.groupStandingsPts, b: spelerB.groupStandingsPts },
    { label: 'Knockout', a: spelerA.knockoutPts, b: spelerB.knockoutPts },
    { label: 'Bonus vooraf', a: spelerA.bonusPrePts, b: spelerB.bonusPrePts },
    { label: 'Bonus dag', a: spelerA.bonusDailyPts, b: spelerB.bonusDailyPts },
    { label: 'Exact goed', a: spelerA.exactHits, b: spelerB.exactHits },
    { label: 'Toto goed', a: spelerA.correctResults, b: spelerB.correctResults },
    { label: 'Jokers', a: spelerA.jokersPlayed, b: spelerB.jokersPlayed },
  ] : []

  const selectClass = 'w-full rounded-lg bg-wk-surface border px-3 py-2 text-sm text-wk-text focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition appearance-none'

  return (
    <div className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      {/* Spotlights */}
      <div
        className="pointer-events-none absolute -left-48 top-16 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 animate-pulse"
        style={{ background: `radial-gradient(closest-side, ${COLOR_A}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute -right-48 top-16 w-[480px] h-[480px] rounded-full blur-3xl opacity-15 animate-pulse"
        style={{ background: `radial-gradient(closest-side, ${COLOR_B}, transparent)`, animationDelay: '1s' }}
      />

      {/* Sluiten */}
      <Link
        href="/statistieken"
        aria-label="Sluiten"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      <div className="relative max-w-3xl mx-auto px-4 py-10 sm:py-14 space-y-8">
        {/* Kop */}
        <div className="text-center animate-fade-up">
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-2">Vergelijk · Deelnemers</p>
          <h1 className="font-display text-3xl sm:text-5xl uppercase leading-none">Head-to-head</h1>
        </div>

        {/* Poule-filter */}
        {poules.length > 0 && (
          <div className="animate-fade-up flex flex-wrap justify-center gap-1.5" style={{ animationDelay: '0.05s' }}>
            <button
              type="button"
              onClick={() => navigate(idA, idB, null)}
              className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors cursor-pointer ${
                pouleId === null
                  ? 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
                  : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
              }`}
            >
              Iedereen
            </button>
            {poules.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(idA, idB, p.id)}
                className={`rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase border transition-colors cursor-pointer ${
                  pouleId === p.id
                    ? 'bg-wk-gold/10 border-wk-gold/40 text-wk-gold'
                    : 'border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Kiezers */}
        <div className="animate-fade-up flex items-center gap-2 sm:gap-3 max-w-xl mx-auto" style={{ animationDelay: '0.1s' }}>
          <select
            value={idA ?? ''}
            onChange={(e) => navigate(e.target.value, idB)}
            className={selectClass}
            style={{ borderColor: `${COLOR_A}66` }}
          >
            {deelnemers.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === idB}>{d.username}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => navigate(idB, idA)}
            title="Wissel van kant"
            className="shrink-0 w-9 h-9 rounded-full bg-wk-surface border border-white/10 text-wk-muted hover:text-wk-gold hover:border-wk-gold/40 transition-colors font-mono text-sm cursor-pointer"
          >
            ⇄
          </button>
          <select
            value={idB ?? ''}
            onChange={(e) => navigate(idA, e.target.value)}
            className={selectClass}
            style={{ borderColor: `${COLOR_B}66` }}
          >
            {deelnemers.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === idA}>{d.username}</option>
            ))}
          </select>
        </div>

        {spelerA && spelerB && (
          <>
            {/* Het duel */}
            <div className="flex items-start justify-center gap-3 sm:gap-8 pt-4">
              <SpelerKop speler={spelerA} color={COLOR_A} isLeading={totalA > totalB} delay={0.2} />
              <div className="animate-podium-pop text-center pt-4 shrink-0" style={{ animationDelay: '0.45s' }}>
                <div className="flex items-baseline gap-2 sm:gap-4 justify-center">
                  <span className={`font-display text-4xl sm:text-6xl leading-none ${totalA > totalB ? 'text-wk-gold' : ''}`} style={totalA > totalB ? undefined : { color: COLOR_A }}>
                    {countA}
                  </span>
                  <span className="font-display text-lg sm:text-2xl text-wk-muted/50">–</span>
                  <span className={`font-display text-4xl sm:text-6xl leading-none ${totalB > totalA ? 'text-wk-gold' : ''}`} style={totalB > totalA ? undefined : { color: COLOR_B }}>
                    {countB}
                  </span>
                </div>
                <p className="font-mono text-[9px] sm:text-[10px] text-wk-muted tracking-[0.16em] uppercase mt-2">Totaal punten</p>
                {/* Krachtmeting */}
                <div className="mt-3 h-1.5 rounded-full overflow-hidden flex bg-white/5 w-36 sm:w-48 mx-auto">
                  <div className="transition-all duration-1000" style={{ width: `${pctA}%`, background: COLOR_A }} />
                  <div className="transition-all duration-1000" style={{ width: `${100 - pctA}%`, background: COLOR_B }} />
                </div>
                {scored.length > 0 && (
                  <p className="font-mono text-[9px] text-wk-muted tracking-[0.12em] mt-3">
                    Onderling: <span style={{ color: COLOR_A }} className="font-bold">{winsA}</span>
                    {' · '}<span className="text-wk-soft">{draws}×&nbsp;gelijk</span>{' · '}
                    <span style={{ color: COLOR_B }} className="font-bold">{winsB}</span>
                  </p>
                )}
              </div>
              <SpelerKop speler={spelerB} color={COLOR_B} isLeading={totalB > totalA} delay={0.3} />
            </div>

            {/* Categorieën — spiegelbalken */}
            <div className="animate-fade-up bg-wk-surface border border-white/10 rounded-xl px-4 sm:px-6 py-5 space-y-3" style={{ animationDelay: '0.5s' }}>
              <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-4 text-center">
                Punten per categorie
              </p>
              {categories.map(({ label, a, b }, i) => (
                <MirrorRow
                  key={label}
                  label={label}
                  a={a}
                  b={b}
                  max={Math.max(...categories.map((c) => Math.max(c.a, c.b)), 1)}
                  delay={700 + i * 120}
                />
              ))}
            </div>

            {/* Bonuskeuzes naast elkaar */}
            {bonus.length > 0 && (
              <div className="animate-fade-up bg-wk-surface border border-white/10 rounded-xl overflow-hidden" style={{ animationDelay: '0.6s' }}>
                <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase px-5 pt-4 pb-2 text-center">
                  Bonusvoorspellingen
                </p>
                <div className="divide-y divide-white/5">
                  {bonus.map(({ question, a, b }) => {
                    const same = a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase()
                    return (
                      <div key={question} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-5 py-2.5 ${same ? 'bg-wk-gold/[0.04]' : ''}`}>
                        <span className="text-sm font-semibold truncate text-right" style={{ color: COLOR_A }} title={a ?? undefined}>
                          {a ?? <span className="text-wk-muted/40 font-normal">—</span>}
                        </span>
                        <span className="font-mono text-[9px] text-wk-muted tracking-[0.1em] uppercase text-center max-w-40 sm:max-w-56 leading-tight" title={question}>
                          {same && <span className="mr-1">🤝</span>}{question.length > 60 ? question.slice(0, 57) + '…' : question}
                        </span>
                        <span className="text-sm font-semibold truncate" style={{ color: COLOR_B }} title={b ?? undefined}>
                          {b ?? <span className="text-wk-muted/40 font-normal">—</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Wedstrijd voor wedstrijd */}
            {matches.length > 0 && (
              <div className="animate-fade-up bg-wk-surface border border-white/10 rounded-xl overflow-hidden" style={{ animationDelay: '0.7s' }}>
                <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase px-5 pt-4 pb-2 text-center">
                  Wedstrijd voor wedstrijd
                </p>
                <div className="divide-y divide-white/5">
                  {matches.map((m, i) => {
                    const aWins = m.a?.pts != null && m.b?.pts != null && m.a.pts > m.b.pts
                    const bWins = m.a?.pts != null && m.b?.pts != null && m.b.pts > m.a.pts
                    return (
                      <div
                        key={m.id}
                        className="animate-fade-up grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-5 py-3"
                        style={{ animationDelay: `${Math.min(0.8 + i * 0.06, 2)}s` }}
                      >
                        {/* Voorspelling A */}
                        <div className="flex items-center justify-end gap-2">
                          {m.a ? (
                            <>
                              {m.a.joker && <span className="text-xs" title="Joker ingezet">★</span>}
                              <span className="font-mono text-sm font-bold" style={{ color: COLOR_A }}>{m.a.pred}</span>
                              <span className={`font-mono text-[10px] w-9 text-right ${aWins ? 'text-wk-gold font-bold' : 'text-wk-muted'}`}>
                                {m.a.pts != null ? `${m.a.pts}pt` : '·'}
                              </span>
                            </>
                          ) : <span className="font-mono text-[10px] text-wk-muted/40">—</span>}
                        </div>
                        {/* Wedstrijd */}
                        <div className="flex flex-col items-center min-w-24 sm:min-w-40">
                          <div className="flex items-center gap-1.5">
                            {m.homeFlag && <Image src={m.homeFlag} alt={m.homeTeam} width={20} height={14} className="rounded-sm object-cover w-5 h-3.5" />}
                            <span className="font-display text-sm text-wk-text">{m.actual ?? 'bezig'}</span>
                            {m.awayFlag && <Image src={m.awayFlag} alt={m.awayTeam} width={20} height={14} className="rounded-sm object-cover w-5 h-3.5" />}
                          </div>
                          <span className="font-mono text-[8px] text-wk-muted tracking-[0.08em] uppercase mt-0.5 text-center leading-tight">
                            {m.homeTeam} – {m.awayTeam}
                          </span>
                        </div>
                        {/* Voorspelling B */}
                        <div className="flex items-center gap-2">
                          {m.b ? (
                            <>
                              <span className={`font-mono text-[10px] w-9 ${bWins ? 'text-wk-gold font-bold' : 'text-wk-muted'}`}>
                                {m.b.pts != null ? `${m.b.pts}pt` : '·'}
                              </span>
                              <span className="font-mono text-sm font-bold" style={{ color: COLOR_B }}>{m.b.pred}</span>
                              {m.b.joker && <span className="text-xs" title="Joker ingezet">★</span>}
                            </>
                          ) : <span className="font-mono text-[10px] text-wk-muted/40">—</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
