'use client'

import { useState } from 'react'
import Image from 'next/image'

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

type Props = {
  tournamentStarted: boolean
  kampioenStats: KampioenverdeligEntry[]
  groupedMatches: Record<string, MatchStat[]>
  totalDeelnemers: number
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

export default function StatsClient({
  tournamentStarted,
  kampioenStats,
  groupedMatches,
  totalDeelnemers,
}: Props) {
  const [activeGroup, setActiveGroup] = useState('A')
  const [openMatch, setOpenMatch] = useState<string | null>(null)

  const availableGroups = GROUPS.filter((g) => groupedMatches[g]?.length)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Overzicht</p>
        <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Statistieken</h1>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
          {totalDeelnemers} {totalDeelnemers === 1 ? 'deelnemer' : 'deelnemers'}
        </p>
      </div>

      {/* WK-kampioen verdeling */}
      {tournamentStarted ? (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Voorspeld wereldkampioen
          </p>
          {kampioenStats.length === 0 ? (
            <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-6 text-center">
              <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">Nog geen antwoorden ingediend.</p>
            </div>
          ) : (
            <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
              {kampioenStats.map(({ answer, count, flag_url }, i) => {
                const pct = totalDeelnemers > 0 ? Math.round((count / totalDeelnemers) * 100) : 0
                const isTop = i === 0
                return (
                  <div key={answer} className="px-5 py-3 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      {/* Positie */}
                      <span className="font-mono text-xs text-wk-muted w-5 text-center shrink-0">{i + 1}</span>

                      {/* Vlag + naam */}
                      {flag_url && (
                        <Image src={flag_url} alt={answer} width={28} height={20}
                          className="rounded-sm object-cover shrink-0 w-7 h-5" />
                      )}
                      <span className={`flex-1 text-sm font-semibold ${isTop ? 'text-wk-gold' : 'text-wk-text'}`}>
                        {answer}
                      </span>

                      {/* Count + pct */}
                      <span className="font-mono text-xs text-wk-muted shrink-0">{count}×</span>
                      <span className={`font-mono text-xs font-bold shrink-0 w-10 text-right ${isTop ? 'text-wk-gold' : 'text-wk-soft'}`}>
                        {pct}%
                      </span>
                    </div>

                    {/* Bar */}
                    <div className="mt-2 ml-8 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isTop ? 'bg-wk-gold' : 'bg-wk-muted/40'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <section>
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
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-3">
            Uitslagverdeling — gespeelde wedstrijden
          </p>

          {/* Group tabs */}
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
                totalDeelnemers={totalDeelnemers}
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
        <section>
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
    </div>
  )
}

// ─── Match distribution row ───────────────────────────────────────────────────

function MatchDistRow({
  match,
  isOpen,
  onToggle,
  totalDeelnemers,
}: {
  match: MatchStat
  isOpen: boolean
  onToggle: () => void
  totalDeelnemers: number
}) {
  const top3 = match.distribution.slice(0, 3)

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/5 transition-colors"
      >
        {/* Match # */}
        <span className="font-mono text-[10px] text-wk-muted w-5 shrink-0">#{match.match_number}</span>

        {/* Teams */}
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

        {/* Top prediction preview */}
        {top3[0] && !isOpen && (
          <span className="font-mono text-[10px] text-wk-gold shrink-0">
            {top3[0].predicted_home}–{top3[0].predicted_away}
          </span>
        )}

        {/* Count badge */}
        <span className="font-mono text-[10px] text-wk-muted shrink-0">{match.total_predictions}×</span>

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-wk-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
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
                  <div
                    className={`h-full rounded-full ${i === 0 ? 'bg-wk-gold' : 'bg-wk-muted/40'}`}
                    style={{ width: `${pct}%` }}
                  />
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
        </div>
      )}
    </div>
  )
}
