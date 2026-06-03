import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { GROUP_DATA, FLAG_CODES } from '@/lib/group-data'


export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ group: string }>
}) {
  const { group } = await params
  const letter = group.toUpperCase()

  // Groups H-L: data not yet available
  const allGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  if (!allGroups.includes(letter)) notFound()
  if (!GROUP_DATA[letter]) notFound()

  const data = GROUP_DATA[letter]

  const stageLabel: Record<string, string> = {
    GS: 'Groepsfase',
    R32: 'Ronde van 32',
    R16: 'Ronde van 16',
    QF: 'Kwartfinale',
    SF: 'Halve finale',
    F: 'Finale',
    W: 'Kampioen',
    '—': '—',
  }

  return (
    <div className="space-y-8 pb-8">

      {/* Team cards */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-wk-muted mb-3">
          Deelnemende landen
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.teams.map((team) => (
            <div
              key={team.nameNl}
              className="bg-wk-surface border border-white/10 rounded-xl p-4 flex gap-4 items-start"
            >
              {/* Flag */}
              <div className="shrink-0 rounded overflow-hidden w-14 h-10 relative border border-white/10">
                <Image
                  src={`https://flagcdn.com/w80/${team.flagCode}.png`}
                  alt={`Vlag van ${team.nameNl}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-display text-wk-text text-base uppercase tracking-tight leading-none">
                  {team.nameNl}
                </p>
                <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase mt-0.5 mb-2">
                  {team.qualificationRegion} · {team.qualification}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <p className="font-mono text-[9px] text-wk-muted uppercase tracking-[0.1em]">Ranking</p>
                    <p className="font-mono text-wk-gold text-sm font-bold">#{team.ranking}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] text-wk-muted uppercase tracking-[0.1em]">WK-deelnames</p>
                    <p className="font-mono text-wk-text text-sm">{team.appearances}×{team.appearanceYears ? ` (${team.appearanceYears})` : ''}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] text-wk-muted uppercase tracking-[0.1em]">Beste resultaat</p>
                    <p className="font-mono text-wk-soft text-xs leading-tight">{team.bestFinish}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] text-wk-muted uppercase tracking-[0.1em]">Laatste WK</p>
                    <p className="font-mono text-wk-soft text-xs">
                      {team.lastAppearance !== '—' ? `${team.lastAppearance} · ${stageLabel[team.lastStage] ?? team.lastStage}` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Head-to-head */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-wk-muted mb-3">
          Onderlinge duels
        </h2>
        <div className="bg-wk-surface border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
          {data.headToHead.map((match, i) => {
            const [h, a] = match.score.split('-').map(Number)
            const homeWin = h > a
            const awayWin = a > h
            const homeFlagCode = FLAG_CODES[match.home] ?? 'xx'
            const awayFlagCode = FLAG_CODES[match.away] ?? 'xx'
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                {/* Home */}
                <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                  <p
                    className={`font-mono text-sm text-right truncate ${
                      homeWin ? 'text-wk-green font-bold' : 'text-wk-soft'
                    }`}
                  >
                    {match.home}
                  </p>
                  <div className="shrink-0 w-6 h-4 relative rounded overflow-hidden border border-white/10">
                    <Image
                      src={`https://flagcdn.com/w80/${homeFlagCode}.png`}
                      alt={match.home}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                </div>

                {/* Score */}
                <div className="flex flex-col items-center shrink-0">
                  <span className="font-mono text-wk-text font-bold text-base tabular-nums">
                    {match.score}
                  </span>
                  <span className="font-mono text-[9px] text-wk-muted tracking-[0.08em] uppercase">
                    {match.year}
                  </span>
                </div>

                {/* Away */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="shrink-0 w-6 h-4 relative rounded overflow-hidden border border-white/10">
                    <Image
                      src={`https://flagcdn.com/w80/${awayFlagCode}.png`}
                      alt={match.away}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <p
                    className={`font-mono text-sm truncate ${
                      awayWin ? 'text-wk-green font-bold' : 'text-wk-soft'
                    }`}
                  >
                    {match.away}
                  </p>
                </div>

                {/* Match type */}
                <p className="hidden md:block font-mono text-[9px] text-wk-muted tracking-[0.08em] uppercase shrink-0 w-40 text-right">
                  {match.type}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Group statistics */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-wk-muted mb-3">
          Groep statistieken
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {data.stats.map(({ value, label }) => (
            <div key={label} className="bg-wk-surface border border-white/10 rounded-xl p-4">
              <p className="font-display text-3xl text-wk-gold">{value}</p>
              <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase mt-1 leading-snug">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>


      {/* Players to watch */}
      <section>
        <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase text-wk-muted mb-3">
          Spelers om te volgen
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.teams.map((team) => (
            <div
              key={team.nameNl}
              className="bg-wk-surface border border-white/10 rounded-xl p-4 flex gap-3"
            >
              {/* Flag thumbnail */}
              <div className="shrink-0 w-8 h-6 relative rounded overflow-hidden border border-white/10 mt-0.5">
                <Image
                  src={`https://flagcdn.com/w80/${team.flagCode}.png`}
                  alt={`Vlag van ${team.nameNl}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] text-wk-muted tracking-[0.12em] uppercase">
                  {team.nameNl}
                </p>
                <p className="font-display text-wk-text text-base uppercase tracking-tight leading-tight">
                  {team.player.name}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {team.player.traits.map((trait) => (
                    <span
                      key={trait}
                      className="font-mono text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-white/5 text-wk-muted border border-white/5"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Back link bottom */}
      <div className="pt-2">
        <Link
          href="/voorspellingen"
          className="inline-flex items-center gap-2 text-wk-muted hover:text-wk-soft transition-colors font-mono text-xs tracking-[0.14em] uppercase"
        >
          ← Terug naar voorspellingen
        </Link>
      </div>
    </div>
  )
}
