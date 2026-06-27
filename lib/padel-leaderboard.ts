import { createClient } from '@/lib/supabase/server'
import { PADEL_USERNAMES } from '@/lib/padel'

export type LeaderEntry = {
  id: string
  username: string
  fullName: string | null
  avatarUrl: string | null
  best: number
}

// Beschikbare mini-games (voor de spel-hub).
export const PADEL_GAMES: { slug: string; title: string; emoji: string; tagline: string; available: boolean }[] = [
  { slug: 'whack', title: 'Whack-a-flyer', emoji: '🎯', tagline: 'Tik de figuren · ontwijk Rick · 30s', available: true },
  { slug: 'flappy', title: 'Flappy Padel', emoji: '🎾', tagline: 'Tik om te fladderen · ontwijk de netten', available: true },
  { slug: 'penalty', title: 'Strafschoppen', emoji: '⚽', tagline: 'Mik op de hoeken · klop de keeper · hoeveel op rij?', available: true },
]

// Beste score per padelclub-lid voor één game, gesorteerd hoog→laag.
export async function getPadelLeaderboard(game: string): Promise<LeaderEntry[]> {
  const supabase = await createClient()

  const orFilter = PADEL_USERNAMES.map((u) => `username.ilike.${u}`).join(',')
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .or(orFilter)
  const ordered = PADEL_USERNAMES
    .map((u) => (profs ?? []).find((p) => p.username.toLowerCase() === u))
    .filter((p): p is NonNullable<typeof p> => !!p)
  const ids = ordered.map((p) => p.id)
  if (!ids.length) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scores } = await (supabase as any)
    .from('padel_game_scores')
    .select('user_id, score')
    .eq('game', game)
    .in('user_id', ids)
  const best: Record<string, number> = {}
  for (const s of (scores ?? []) as { user_id: string; score: number }[]) {
    best[s.user_id] = Math.max(best[s.user_id] ?? 0, s.score)
  }

  return ordered
    .map((p) => ({ id: p.id, username: p.username, fullName: p.full_name, avatarUrl: p.avatar_url, best: best[p.id] ?? 0 }))
    .sort((a, b) => b.best - a.best)
}
