import Link from 'next/link'
import { AvatarCircle } from '@/components/avatar-circle'

export type BergEntry = {
  id: string
  username: string
  avatarUrl: string | null
  totalPts: number
}

// Het bergpad van start (linksonder) naar de top (rechtsboven), in %-coördinaten.
// X loopt strikt op zodat positie langs het pad = voortgang richting de beker.
const WAYPOINTS: Array<[number, number]> = [
  [4, 92],
  [18, 82],
  [34, 73],
  [48, 60],
  [62, 48],
  [75, 32],
  [86, 13],
]

const SUMMIT = WAYPOINTS[WAYPOINTS.length - 1]

// Interpoleert een punt op `frac` (0–1) van de totale padlengte.
function pointAt(frac: number): { x: number; y: number } {
  const f = Math.max(0, Math.min(1, frac))
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < WAYPOINTS.length; i++) {
    const d = Math.hypot(WAYPOINTS[i][0] - WAYPOINTS[i - 1][0], WAYPOINTS[i][1] - WAYPOINTS[i - 1][1])
    lengths.push(d)
    total += d
  }
  let dist = f * total
  for (let i = 0; i < lengths.length; i++) {
    if (dist <= lengths[i]) {
      const t = lengths[i] === 0 ? 0 : dist / lengths[i]
      return {
        x: WAYPOINTS[i][0] + (WAYPOINTS[i + 1][0] - WAYPOINTS[i][0]) * t,
        y: WAYPOINTS[i][1] + (WAYPOINTS[i + 1][1] - WAYPOINTS[i][1]) * t,
      }
    }
    dist -= lengths[i]
  }
  return { x: SUMMIT[0], y: SUMMIT[1] }
}

export function Bergetappe({
  entries,
  currentUserId,
  progress,
}: {
  entries: BergEntry[] // gesorteerd op punten, hoogste eerst
  currentUserId: string
  progress: number // gespeeld deel van het toernooi, 0–1
}) {
  const maxPts = entries[0]?.totalPts ?? 0

  // De koploper staat op `progress` van het pad; de rest naar rato van punten.
  // Spelers met (vrijwel) gelijke stand worden iets uit elkaar geschoven.
  const stacked: Record<string, number> = {}
  const markers = entries.map((entry, index) => {
    const raw = maxPts > 0 ? (entry.totalPts / maxPts) * progress : 0
    const key = raw.toFixed(2)
    const n = (stacked[key] = (stacked[key] ?? 0) + 1)
    const { x, y } = pointAt(raw - (n - 1) * 0.018)
    return { ...entry, x, y, rank: index }
  })

  const pathPoints = WAYPOINTS.map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <div className="space-y-2">
      <div className="relative h-80 sm:h-[440px] bg-gradient-to-b from-wk-bg2 to-wk-surface border border-white/10 rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center font-mono text-xs text-wk-muted tracking-[0.12em]">
            Nog geen deelnemers.
          </div>
        ) : (
          <>
            {/* Berg + pad */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {/* Verre bergrug voor diepte */}
              <polygon
                points="0,100 8,88 24,78 42,84 58,66 72,72 100,40 100,100"
                fill="rgba(255,255,255,0.03)"
              />
              {/* De berg zelf — de rand volgt het pad */}
              <polygon
                points={`0,100 ${pathPoints} 90,24 95,42 100,56 100,100`}
                fill="rgba(255,255,255,0.05)"
              />
              <polyline
                points={pathPoints}
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="0.4"
                strokeDasharray="1.6 1.6"
              />
            </svg>

            {/* Labels */}
            <span className="absolute top-3 left-4 font-mono text-[9px] text-wk-muted tracking-[0.16em] uppercase">
              Toernooi {Math.round(progress * 100)}% gespeeld
            </span>
            <span
              className="absolute font-mono text-[8px] text-wk-muted/60 tracking-[0.16em] uppercase"
              style={{ left: '4%', top: '94%' }}
            >
              Start
            </span>

            {/* De WK-beker op de top */}
            <div className="absolute" style={{ left: `${SUMMIT[0]}%`, top: `${SUMMIT[1]}%` }}>
              <div className="relative -translate-x-1/2 -translate-y-full flex flex-col items-center pb-1">
                <div
                  className="absolute -inset-4 rounded-full blur-md animate-pulse"
                  style={{
                    background:
                      'radial-gradient(closest-side, color-mix(in srgb, var(--color-wk-gold) 35%, transparent), transparent)',
                  }}
                />
                <span className="relative text-2xl sm:text-4xl drop-shadow-lg">🏆</span>
              </div>
            </div>

            {/* Spelers op het pad — achterhoede verschijnt eerst, koploper als laatste */}
            {markers.map(({ id, username, avatarUrl, totalPts, x, y, rank }) => {
              const isCurrentUser = id === currentUserId
              const isLeader = rank === 0
              const labelAbove = rank % 2 === 0
              return (
                <div
                  key={id}
                  className="absolute"
                  style={{ left: `${x}%`, top: `${y}%`, zIndex: entries.length - rank + 1 }}
                >
                  <div
                    className="animate-podium-pop relative -translate-x-1/2 -translate-y-full flex flex-col items-center"
                    style={{ animationDelay: `${Math.min(0.15 + (entries.length - 1 - rank) * 0.07, 2)}s` }}
                  >
                    <Link
                      href={`/deelnemers/${id}`}
                      className={`block rounded-full shadow-lg ${
                        isCurrentUser
                          ? 'ring-2 ring-wk-gold ring-offset-2 ring-offset-wk-bg'
                          : isLeader
                            ? 'ring-2 ring-wk-gold/50'
                            : 'ring-1 ring-white/20'
                      }`}
                      title={`${username} · ${totalPts}pt`}
                    >
                      <AvatarCircle username={username} avatarUrl={avatarUrl} size={isLeader ? 36 : 26} />
                    </Link>
                    <div
                      className={`absolute ${labelAbove ? 'bottom-full mb-1' : 'top-full mt-1'} flex flex-col items-center w-24 pointer-events-none`}
                    >
                      <span
                        className={`font-mono text-[8px] truncate max-w-full ${
                          isCurrentUser ? 'font-bold text-wk-gold' : 'text-wk-soft'
                        }`}
                      >
                        {username}
                      </span>
                      <span className="font-display text-[10px] text-wk-gold leading-tight">
                        {totalPts}
                        <span className="font-mono text-[7px] text-wk-muted ml-0.5">pt</span>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
      <p className="font-mono text-[9px] text-wk-muted tracking-[0.12em] text-center">
        Afstand = voortgang door het toernooi · Hoogte = punten · De beker wacht op de top
      </p>
    </div>
  )
}
