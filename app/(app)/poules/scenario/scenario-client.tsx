'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { AvatarCircle } from '@/components/avatar-circle'
import { KO_POINTS } from '@/lib/constants'

// ── Types (gedeeld met page.tsx) ─────────────────────────────────────────────
export type ScenarioTeam = { id: string; name: string; flag: string }
export type ScenarioMember = {
  id: string; username: string; fullName: string | null; avatarUrl: string | null
  base: number
  picks: Record<number, { team: string | null; pts: number }>
  mvpAnswer: string | null; mvpPts: number
  topAnswer: string | null; topPts: number
}
export type ScenarioLeague = { id: string; name: string; memberIds: string[] }
type SfSlot = { slot: number; home: string; away: string; actualWinner: string | null; actualLoser: string | null } | null
export type ScenarioData = {
  leagues: ScenarioLeague[]
  members: Record<string, ScenarioMember>
  teams: Record<string, ScenarioTeam>
  sf1: SfSlot
  sf2: SfSlot
  actualFinalWinner: string | null
  actualThirdWinner: string | null
  mvp: { id: string; options: string[] } | null
  topscorer: { id: string; options: string[] } | null
}

const MVP_PTS = 15
const TOP_PTS = 25
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export default function ScenarioClient({ data, currentUserId }: { data: ScenarioData; currentUserId: string }) {
  const { leagues, members, teams, sf1, sf2 } = data

  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? '')
  const [sf1w, setSf1w] = useState(sf1?.actualWinner ?? sf1?.home ?? '')
  const [sf2w, setSf2w] = useState(sf2?.actualWinner ?? sf2?.home ?? '')
  const sf1l = sf1 ? (sf1w === sf1.home ? sf1.away : sf1.home) : ''
  const sf2l = sf2 ? (sf2w === sf2.home ? sf2.away : sf2.home) : ''
  // Rauwe keuze; de effectieve winnaar wordt afgeleid (blijft geldig als de HF-winnaars wijzigen).
  const [finalPick, setFinalPick] = useState(data.actualFinalWinner ?? '')
  const [thirdPick, setThirdPick] = useState(data.actualThirdWinner ?? '')
  const [mvp, setMvp] = useState('')
  const [topscorer, setTopscorer] = useState('')

  const finalCands = [sf1w, sf2w].filter(Boolean)
  const thirdCands = [sf1l, sf2l].filter(Boolean)
  const finalw = finalCands.includes(finalPick) ? finalPick : (finalCands[0] ?? '')
  const thirdw = thirdCands.includes(thirdPick) ? thirdPick : (thirdCands[0] ?? '')

  const league = leagues.find((l) => l.id === leagueId) ?? leagues[0]

  const { rows, baseRankById } = useMemo(() => {
    const chosen: Record<number, string> = { 101: sf1w, 102: sf2w, 103: thirdw, 104: finalw }
    const stagePts: Record<number, number> = { 101: KO_POINTS.sf, 102: KO_POINTS.sf, 103: KO_POINTS.third_place, 104: KO_POINTS.final }
    const ids = league?.memberIds ?? []
    const computed = ids.map((id) => {
      const m = members[id]
      let already = 0
      let hypo = 0
      for (const slot of [101, 102, 103, 104]) {
        already += m.picks[slot]?.pts ?? 0
        if (chosen[slot] && m.picks[slot]?.team === chosen[slot]) hypo += stagePts[slot]
      }
      already += m.mvpPts + m.topPts
      if (mvp && norm(m.mvpAnswer) === norm(mvp)) hypo += MVP_PTS
      if (topscorer && norm(m.topAnswer) === norm(topscorer)) hypo += TOP_PTS
      return { m, base: m.base, total: m.base - already + hypo }
    })
    // Huidige (basis-)rangorde voor de stij/daal-pijltjes.
    const baseSorted = [...computed].sort((a, b) => b.base - a.base)
    const rank: Record<string, number> = {}
    baseSorted.forEach((r, i) => { rank[r.m.id] = i })
    const scen = computed.sort((a, b) => b.total - a.total || b.base - a.base)
    return { rows: scen, baseRankById: rank }
  }, [league, members, sf1w, sf2w, thirdw, finalw, mvp, topscorer])

  const teamName = (id: string) => teams[id]?.name ?? '—'

  if (!sf1 || !sf2) {
    return (
      <div className="space-y-4">
        <Header />
        <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-8 text-center">
          <p className="font-mono text-xs text-wk-muted tracking-[0.12em]">
            De halve finales zijn nog niet bekend. Zodra de kwartfinales gespeeld zijn, kun je hier scenario&apos;s doorrekenen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      {/* League-keuze */}
      {leagues.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase">Poule</span>
          {leagues.map((l) => (
            <button key={l.id} onClick={() => setLeagueId(l.id)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${l.id === league?.id ? 'border-wk-gold/60 bg-wk-gold/15 text-wk-gold' : 'border-white/12 bg-wk-bg2 text-wk-soft hover:text-wk-text'}`}>
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-wk-surface border border-white/10 rounded-xl p-5 space-y-4">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase">Stel de uitslagen in</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <MatchPick label="Halve finale 1" a={sf1.home} b={sf1.away} value={sf1w} onPick={setSf1w} teams={teams} />
          <MatchPick label="Halve finale 2" a={sf2.home} b={sf2.away} value={sf2w} onPick={setSf2w} teams={teams} />
          <MatchPick label="Finale 🏆" a={finalCands[0]} b={finalCands[1]} value={finalw} onPick={setFinalPick} teams={teams} />
          <MatchPick label="Troostfinale (3e plaats)" a={thirdCands[0]} b={thirdCands[1]} value={thirdw} onPick={setThirdPick} teams={teams} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 pt-1">
          {data.mvp && <OptionPick label="Beste speler (MVP) · 15 pt" value={mvp} onChange={setMvp} options={data.mvp.options} />}
          {data.topscorer && <OptionPick label="Topscorer · 25 pt" value={topscorer} onChange={setTopscorer} options={data.topscorer.options} />}
        </div>
        <p className="font-mono text-[9px] text-wk-muted/70 tracking-[0.1em] leading-relaxed">
          Winnaars: HF 100 pt · finale 200 pt · 3e plaats 50 pt. MVP/topscorer laat je leeg tot je een keuze maakt.
          De stand hieronder herberekent live — bestaande punten van deze rondes worden vervangen, niet dubbel geteld.
        </p>
      </div>

      {/* Scenario-stand */}
      <div>
        <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Eindstand in dit scenario</p>
        <h2 className="font-display text-2xl text-wk-text uppercase leading-none">{league?.name}</h2>
        <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
          Finale: {teamName(finalw)} wint · 3e: {teamName(thirdw)}
        </p>
      </div>

      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">Geen deelnemers.</div>
        ) : rows.map((r, i) => {
          const isMe = r.m.id === currentUserId
          const move = (baseRankById[r.m.id] ?? i) - i // >0 = gestegen t.o.v. huidige stand
          const medals = ['🥇', '🥈', '🥉']
          const delta = r.total - r.base
          return (
            <div key={r.m.id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-wk-gold/5' : ''}`}>
              <div className="w-7 text-center shrink-0">
                {i < 3 ? <span className="text-base">{medals[i]}</span> : <span className="font-mono text-xs text-wk-muted">{i + 1}</span>}
              </div>
              <div className="w-6 shrink-0 text-center">
                {move > 0 ? <span className="font-mono text-[10px] font-bold text-wk-green">↑{move}</span>
                  : move < 0 ? <span className="font-mono text-[10px] font-bold text-wk-red">↓{-move}</span>
                    : <span className="font-mono text-[10px] text-wk-muted/40">–</span>}
              </div>
              <AvatarCircle username={r.m.username} avatarUrl={r.m.avatarUrl} size={28} />
              <div className="flex-1 min-w-0">
                <Link href={`/deelnemers/${r.m.id}`} className={`text-sm truncate hover:underline underline-offset-2 ${isMe ? 'font-bold text-wk-gold' : 'font-medium text-wk-text hover:text-wk-gold'}`}>
                  {r.m.username}
                </Link>
                {r.m.fullName && <p className="font-mono text-[9px] text-wk-muted truncate leading-tight">{r.m.fullName}</p>}
              </div>
              <div className="text-right shrink-0">
                <span className="font-display text-lg text-wk-gold [text-shadow:0_0_12px_rgba(244,185,46,0.45)]">{r.total}</span>
                <span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span>
                {delta !== 0 && (
                  <p className={`font-mono text-[9px] leading-tight ${delta > 0 ? 'text-wk-green' : 'text-wk-red'}`}>{delta > 0 ? '+' : ''}{delta} vs nu</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">Scenario</p>
      <h1 className="font-display text-3xl text-wk-text uppercase leading-none">Wie wint de poule?</h1>
      <p className="font-mono text-xs text-wk-muted mt-1.5 tracking-[0.12em]">
        Stel de resterende uitslagen in en zie de eindstand van je eigen poule.
      </p>
    </div>
  )
}

function MatchPick({ label, a, b, value, onPick, teams }: {
  label: string; a?: string; b?: string; value: string; onPick: (id: string) => void; teams: Record<string, ScenarioTeam>
}) {
  const opts = [a, b].filter(Boolean) as string[]
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-muted">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {opts.length === 0 && <span className="font-mono text-[10px] text-wk-muted/60">nog onbekend</span>}
        {opts.map((id) => {
          const t = teams[id]
          const sel = value === id
          return (
            <button key={id} onClick={() => onPick(id)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition ${sel ? 'border-wk-gold/60 bg-wk-gold/15' : 'border-white/12 bg-wk-bg2 hover:border-white/30'}`}>
              {t && <Image src={t.flag} alt={t.name} width={22} height={15} className="w-[22px] h-[15px] rounded-sm object-cover shrink-0" />}
              <span className={`font-mono text-[11px] truncate ${sel ? 'text-wk-gold font-bold' : 'text-wk-soft'}`}>{t?.name ?? '—'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OptionPick({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-wk-muted">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/12 bg-wk-bg2 px-3 py-2 font-mono text-[12px] text-wk-soft focus:border-wk-gold/60 focus:outline-none">
        <option value="">— nog niet meegerekend —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
