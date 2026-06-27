'use client'

import { AvatarCircle } from '@/components/avatar-circle'
import type { LeaderEntry } from '@/lib/padel-leaderboard'

// Herbruikbaar leaderboard voor de padel-mini-games.
export default function GameLeaderboard({
  entries,
  currentUserId,
  title = 'Leaderboard · beste score',
}: {
  entries: LeaderEntry[]
  currentUserId: string
  title?: string
}) {
  return (
    <div className="bg-wk-surface border border-white/10 rounded-2xl overflow-hidden">
      <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase px-5 pt-4 pb-2 text-center">{title}</p>
      <div className="divide-y divide-white/5">
        {entries.map((e, i) => {
          const medal = ['🥇', '🥈', '🥉'][i] ?? null
          const isMe = e.id === currentUserId
          return (
            <div key={e.id} className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? 'bg-wk-gold/[0.05]' : ''}`}>
              <span className="w-6 text-center shrink-0">{medal ?? <span className="font-mono text-xs text-wk-muted">{i + 1}</span>}</span>
              <AvatarCircle username={e.username} avatarUrl={e.avatarUrl} size={28} />
              <span className={`flex-1 min-w-0 truncate text-sm font-semibold ${isMe ? 'text-wk-gold' : 'text-wk-text'}`}>
                {(e.fullName?.split(' ')[0]) || e.username}
              </span>
              <span className="font-fun font-semibold text-lg text-wk-gold shrink-0">{e.best}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
