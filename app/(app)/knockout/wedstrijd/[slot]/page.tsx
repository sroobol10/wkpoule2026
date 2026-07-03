import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { GROUP_STAGE_DEADLINE, STAGE_LABELS } from '@/lib/constants'
import { getActivePlayerIds } from '@/lib/active-players'
import { AvatarCircle } from '@/components/avatar-circle'
import { BRACKET } from '@/lib/bracket'
import { koWinnerId } from '@/lib/ko-winner'

export const metadata = { title: 'Wie koos wat · WK Poule 2026' }

type Profile = { id: string; username: string; avatar_url: string | null }
type Team = { id: string; name: string; flag_url: string | null }

export default async function KoSlotPickersPage({ params }: Readonly<{ params: Promise<{ slot: string }> }>) {
  const { slot: slotParam } = await params
  const slot = Number(slotParam)
  const bracketDef = BRACKET.find((b) => b.slot === slot)
  if (!Number.isFinite(slot) || !bracketDef) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Beperk tot de actieve leden van je eigen league(s) — zelfde filtering als klassement/stats.
  const activeIds = await getActivePlayerIds(supabase)
  const { data: myMemberships } = await supabase
    .from('poule_members')
    .select('poules(id, is_general)')
    .eq('user_id', user.id)
  type PouleRef = { id: string; is_general: boolean }
  const privePouleIds = (myMemberships ?? [])
    .map((m) => m.poules as PouleRef | null)
    .filter((p): p is PouleRef => !!p && !p.is_general)
    .map((p) => p.id)
  let memberIds = activeIds
  if (privePouleIds.length > 0) {
    const { data: leagueMembers } = await supabase.from('poule_members').select('user_id').in('poule_id', privePouleIds)
    const leagueSet = new Set((leagueMembers ?? []).map((m) => m.user_id))
    memberIds = new Set([...activeIds].filter((uid) => leagueSet.has(uid)))
  }

  // Werkelijke wedstrijd op deze slot (match_number = slot) → deelnemers, uitslag, winnaar.
  const { data: koMatch } = await supabase
    .from('matches')
    .select(`
      match_number, stage, home_team_id, away_team_id, home_score, away_score, result_entered, shootout_winner_id,
      home_team:teams!matches_home_team_id_fkey(id, name, flag_url),
      away_team:teams!matches_away_team_id_fkey(id, name, flag_url)
    `)
    .eq('match_number', slot)
    .maybeSingle()
  const actualWinnerId = koMatch && koMatch.result_entered
    ? koWinnerId({
        home_team_id: koMatch.home_team_id,
        away_team_id: koMatch.away_team_id,
        home_score: koMatch.home_score,
        away_score: koMatch.away_score,
        shootout_winner_id: koMatch.shootout_winner_id,
      })
    : null

  const now = new Date()
  const revealed = now >= GROUP_STAGE_DEADLINE

  // Alle winnaar-picks voor dit slot (bracket_predictions) + namen/vlaggen erbij.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pickRows } = await (supabase as any)
    .from('bracket_predictions')
    .select('user_id, predicted_team_id')
    .eq('slot', slot)
  const picks = ((pickRows ?? []) as { user_id: string; predicted_team_id: string }[])
    .filter((p) => memberIds.has(p.user_id))

  const { data: teamsData } = await supabase.from('teams').select('id, name, flag_url')
  const teamMap = new Map((teamsData ?? []).map((t) => [t.id, t as Team]))

  const userIds = [...new Set(picks.map((p) => p.user_id))]
  const profileMap = new Map<string, Profile>()
  if (revealed && userIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
    for (const p of (profs ?? []) as Profile[]) profileMap.set(p.id, p)
  }

  // Groepeer per gekozen winnaar-land.
  type Group = { team: Team | null; teamId: string; supporters: Profile[]; count: number }
  const byTeam = new Map<string, Group>()
  for (const p of picks) {
    let g = byTeam.get(p.predicted_team_id)
    if (!g) { g = { team: teamMap.get(p.predicted_team_id) ?? null, teamId: p.predicted_team_id, supporters: [], count: 0 }; byTeam.set(p.predicted_team_id, g) }
    g.count += 1
    const prof = profileMap.get(p.user_id)
    if (prof) g.supporters.push(prof)
  }
  const groups = [...byTeam.values()].sort(
    (a, b) => b.count - a.count || (a.team?.name ?? '').localeCompare(b.team?.name ?? ''),
  )
  for (const g of groups) g.supporters.sort((a, b) => a.username.localeCompare(b.username))

  const homeTeam = koMatch?.home_team as Team | null
  const awayTeam = koMatch?.away_team as Team | null

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none">Wedstrijd {slot}</h1>
          <p className="font-mono text-[11px] text-wk-gold/80 tracking-[0.18em] uppercase mt-1">
            {STAGE_LABELS[bracketDef.stage] ?? bracketDef.stage} · wie koos wie als winnaar
          </p>
        </div>
        <Link href="/knockout" className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-wk-muted border border-white/15 rounded-full px-3 py-1.5 hover:border-white/30 hover:text-wk-soft">
          ← Bracket
        </Link>
      </div>

      {/* Werkelijke wedstrijd (indien bekend) */}
      {(homeTeam || awayTeam) && (
        <div className="flex items-center justify-center gap-4 bg-wk-surface border border-white/10 rounded-xl px-4 py-3">
          <SlotTeam team={homeTeam} winner={actualWinnerId === homeTeam?.id} />
          <span className="font-mono text-[10px] text-wk-muted tracking-widest">
            {koMatch?.result_entered ? `${koMatch.home_score}–${koMatch.away_score}` : 'VS'}
          </span>
          <SlotTeam team={awayTeam} winner={actualWinnerId === awayTeam?.id} />
        </div>
      )}

      {!revealed ? (
        <p className="text-center font-mono text-xs text-wk-muted tracking-[0.14em] uppercase py-8">
          Keuzes worden zichtbaar zodra het toernooi begint.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-center font-mono text-xs text-wk-muted tracking-[0.14em] uppercase py-8">
          Nog niemand koos een winnaar voor dit slot.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isWinner = actualWinnerId != null && g.teamId === actualWinnerId
            const isLoser = actualWinnerId != null && g.teamId !== actualWinnerId
            return (
              <div key={g.teamId} className={`bg-wk-surface border rounded-xl overflow-hidden ${isWinner ? 'border-wk-green/40' : isLoser ? 'border-wk-red/25' : 'border-white/10'}`}>
                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/5">
                  {g.team?.flag_url && <Image src={g.team.flag_url} alt={g.team.name} width={26} height={17} className={`w-[26px] h-[17px] object-cover rounded-sm ${isLoser ? 'grayscale opacity-70' : ''}`} />}
                  <span className={`font-semibold text-sm ${isWinner ? 'text-wk-green' : 'text-wk-text'}`}>{g.team?.name ?? 'Onbekend'}</span>
                  {isWinner && <span className="font-mono text-[9px] tracking-widest uppercase text-wk-green">✓ winnaar</span>}
                  <span className="ml-auto font-mono text-[11px] text-wk-muted tabular-nums">{g.count}×</span>
                </div>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {g.supporters.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 bg-wk-bg2 border border-white/10 rounded-full pl-1 pr-2.5 py-1">
                      <AvatarCircle username={s.username} avatarUrl={s.avatar_url} size={20} />
                      <span className="font-mono text-[11px] text-wk-soft">{s.username}</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SlotTeam({ team, winner }: { team: Team | null; winner: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {team?.flag_url && <Image src={team.flag_url} alt={team.name} width={28} height={18} className="w-7 h-[18px] object-cover rounded-sm" />}
      <span className={`font-mono text-[11px] uppercase tracking-wide ${winner ? 'text-wk-green' : 'text-wk-soft'}`}>{team?.name ?? 'TBD'}</span>
    </div>
  )
}
