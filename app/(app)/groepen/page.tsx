import Link from 'next/link'
import Image from 'next/image'
import { GROUP_DATA } from '@/lib/group-data'

const ALL_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

export default function GroepenPage() {
  return (
    <div className="space-y-8">

      {/* Groups grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ALL_GROUPS.map((letter) => {
          const data = GROUP_DATA[letter]
          const available = !!data

          if (!available) {
            return (
              <div
                key={letter}
                className="bg-wk-surface border border-white/10 rounded-xl p-5 opacity-50"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono font-bold text-[11px] tracking-[0.2em] uppercase text-wk-muted bg-white/5 px-2.5 py-1 rounded">
                    Groep {letter}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-wk-muted">
                    Binnenkort beschikbaar
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-7 rounded bg-white/5 border border-white/5"
                    />
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div
              key={letter}
              className="bg-wk-surface border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors group"
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono font-bold text-[11px] tracking-[0.2em] uppercase text-wk-gold bg-wk-gold/10 border border-wk-gold/20 px-2.5 py-1 rounded">
                  Groep {letter}
                </span>
              </div>

              {/* Teams */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {data.teams.map((team) => (
                  <div key={team.nameNl} className="flex items-center gap-2">
                    <div className="w-6 h-4 relative rounded overflow-hidden border border-white/10 shrink-0">
                      <Image
                        src={`https://flagcdn.com/w80/${team.flagCode}.png`}
                        alt={`Vlag van ${team.nameNl}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <span className="font-mono text-xs text-wk-soft truncate">{team.nameNl}</span>
                  </div>
                ))}
              </div>

              {/* Link */}
              <Link
                href={`/groep/${letter.toLowerCase()}`}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.12em] uppercase text-wk-muted hover:text-wk-gold transition-colors group-hover:text-wk-soft"
              >
                Bekijk details →
              </Link>
            </div>
          )
        })}
      </div>

      {/* Back */}
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
