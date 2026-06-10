import Link from 'next/link'
import { AvatarCircle } from '@/components/avatar-circle'

export type PodiumEntry = {
  id: string
  username: string
  avatarUrl: string | null
  totalPts: number
}

// Visuele volgorde: 2e links, 1e in het midden (hoogst), 3e rechts.
// De zuilen rijzen op van laag naar hoog (3 → 2 → 1), daarna springt de speler erboven in beeld.
const SPOTS = [
  {
    rank: 2,
    medal: '🥈',
    avatarSize: 64,
    pillarHeight: 'h-14 sm:h-20',
    riseDelay: 0.3,
    pillar: 'from-wk-soft/30 via-wk-soft/12 to-wk-soft/5 border-wk-soft/30',
    ring: 'ring-2 ring-wk-soft/60',
  },
  {
    rank: 1,
    medal: '🥇',
    avatarSize: 96,
    pillarHeight: 'h-20 sm:h-28',
    riseDelay: 0.55,
    pillar: 'from-wk-gold/35 via-wk-gold/15 to-wk-gold/5 border-wk-gold/40',
    ring: 'ring-4 ring-wk-gold',
  },
  {
    rank: 3,
    medal: '🥉',
    avatarSize: 64,
    pillarHeight: 'h-10 sm:h-14',
    riseDelay: 0.1,
    pillar: 'from-[#CD7F32]/35 via-[#CD7F32]/15 to-[#CD7F32]/5 border-[#CD7F32]/40',
    ring: 'ring-2 ring-[#CD7F32]/80',
  },
]

export function Podium({ entries, currentUserId }: { entries: PodiumEntry[]; currentUserId: string }) {
  return (
    <div className="flex items-end gap-3 sm:gap-6 max-w-lg sm:max-w-xl mx-auto px-2 pt-8">
      {SPOTS.map(({ rank, medal, avatarSize, pillarHeight, riseDelay, pillar, ring }) => {
        const entry = entries[rank - 1]
        if (!entry) return <div key={rank} className="flex-1" />
        const isCurrentUser = entry.id === currentUserId
        const isWinner = rank === 1
        return (
          <div key={rank} className="flex-1 min-w-0 flex flex-col items-center justify-end">
            {/* Speler boven de zuil */}
            <div
              className="animate-podium-pop relative z-10 w-full flex flex-col items-center min-w-0 mb-2"
              style={{ animationDelay: `${riseDelay + 0.35}s` }}
            >
              <div className={`relative ${isWinner ? 'animate-podium-float' : ''}`}>
                {/* Gouden gloed achter de winnaar */}
                {isWinner && (
                  <div
                    className="absolute -inset-5 rounded-full blur-md animate-pulse"
                    style={{
                      background:
                        'radial-gradient(closest-side, color-mix(in srgb, var(--color-wk-gold) 35%, transparent), transparent)',
                    }}
                  />
                )}
                {/* Kroon voor de winnaar */}
                {isWinner && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-3xl drop-shadow-lg">👑</span>
                )}
                <div className={`relative rounded-full shadow-xl ${ring} ring-offset-2 ring-offset-wk-bg`}>
                  <AvatarCircle username={entry.username} avatarUrl={entry.avatarUrl} size={avatarSize} />
                </div>
                {/* Medaille als badge op de avatar */}
                <span className={`absolute -bottom-2 -right-2 drop-shadow-lg ${isWinner ? 'text-3xl' : 'text-2xl'}`}>
                  {medal}
                </span>
              </div>
              <Link
                href={`/deelnemers/${entry.id}`}
                className={`max-w-full truncate mt-3 hover:underline underline-offset-2 ${
                  isWinner ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                } ${isCurrentUser ? 'font-bold text-wk-gold' : 'font-semibold text-wk-text hover:text-wk-gold'}`}
              >
                {entry.username}
              </Link>
            </div>
            {/* Zuil met punten */}
            <div
              className={`${isWinner ? 'animate-podium-rise-winner' : 'animate-podium-rise'} w-full ${pillarHeight} rounded-t-lg border border-b-0 bg-gradient-to-b ${pillar} flex items-center justify-center`}
              style={{ animationDelay: `${riseDelay}s` }}
            >
              <span className={`font-display ${isWinner ? 'text-2xl sm:text-4xl' : 'text-lg sm:text-2xl'} text-wk-gold leading-none`}>
                {entry.totalPts}
                <span className="font-mono text-[10px] sm:text-xs text-wk-muted ml-0.5">pt</span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
