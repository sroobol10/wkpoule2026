import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { AvatarCircle } from '@/components/avatar-circle'
import { getActivePlayerIds } from '@/lib/active-players'
import { Podium } from './[id]/podium'
import { Bergetappe } from './[id]/bergetappe'
import { LeaderboardTabs } from './[id]/leaderboard-tabs'

// Deze poule krijgt het Ennovate-logo als titel i.p.v. de poulenaam
const ENNOVATE_POULE_ID = '14ccff59-b97a-41d9-9856-5c6413cd2c05'

// Prijzengeld per positie — alleen voor Schmitt's scorebordstrijd
const PRIJZEN = [300, 150, 75, 50, 25, 12.5, 12.5, 12.5]
const prijsLabel = (bedrag: number) =>
  `€ ${bedrag.toLocaleString('nl-NL', { minimumFractionDigits: bedrag % 1 ? 2 : 0 })}`

// Volledig klassement van één poule: titel, podium/bergetappe, tabel en legenda.
// Wordt gebruikt op /poules (direct de eigen league) en /poules/[id].
export async function PouleStand({
  pouleId,
  currentUserId,
  showTitle = true,
}: {
  pouleId: string
  currentUserId: string
  showTitle?: boolean
}) {
  const supabase = await createClient()

  const { data: poule } = await supabase
    .from('poules')
    .select('id, name, is_general')
    .eq('id', pouleId)
    .single()
  if (!poule) return null

  const { data: scores } = await supabase
    .from('poule_scores')
    .select(`
      user_id, total_pts, exact_hits, correct_results, rank_change,
      group_match_pts, group_standings_pts, knockout_pts,
      bonus_pre_pts, bonus_daily_pts, jokers_played
    `)
    .eq('poule_id', pouleId)
    .order('total_pts', { ascending: false })

  const { data: members } = await supabase
    .from('poule_members')
    .select('user_id, profiles(id, username, full_name, avatar_url)')
    .eq('poule_id', pouleId)

  type Profile = { id: string; username: string; full_name: string | null; avatar_url: string | null }
  const profileMap: Record<string, Profile> = {}
  for (const m of members ?? []) {
    const p = m.profiles as Profile | null
    if (p) profileMap[p.id] = p
  }

  type ScoreRow = {
    user_id: string
    total_pts: number
    exact_hits: number
    correct_results: number
    rank_change: number | null
    group_match_pts: number
    group_standings_pts: number
    knockout_pts: number
    bonus_pre_pts: number
    bonus_daily_pts: number
    jokers_played: number
  }
  const scoreMap: Record<string, ScoreRow> = {}
  for (const s of scores ?? []) scoreMap[s.user_id] = s as ScoreRow

  // Alleen deelnemers die alle groepswedstrijden hebben voorspeld doen mee
  const activeIds = await getActivePlayerIds(supabase)

  const ranked = Object.keys(profileMap)
    .filter((uid) => activeIds.has(uid))
    .map((uid) => ({
      profile: profileMap[uid],
      score: scoreMap[uid] ?? {
        user_id: uid, total_pts: 0, exact_hits: 0, correct_results: 0,
        rank_change: null, group_match_pts: 0, group_standings_pts: 0,
        knockout_pts: 0, bonus_pre_pts: 0, bonus_daily_pts: 0, jokers_played: 0,
      } as ScoreRow,
    }))
    .sort((a, b) => b.score.total_pts - a.score.total_pts)

  // Prijzengeld hoort bij Schmitt's scorebordstrijd, o.b.v. positie in die league
  const isSchmitt = poule.name.toLowerCase().includes('schmitt')
  const prijsVoor = (index: number): string | null =>
    isSchmitt && index < PRIJZEN.length ? prijsLabel(PRIJZEN[index]) : null

  // De bergetappe-weergave is voorlopig alleen beschikbaar in de Ennovate-poule
  const showBergetappe = poule.name.toLowerCase().includes('ennovate')
  let tournamentProgress = 0
  if (showBergetappe) {
    const { count: totalMatches } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
    const { count: playedMatches } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('result_entered', true)
    tournamentProgress = totalMatches ? (playedMatches ?? 0) / totalMatches : 0
  }

  // Sticky-offsets: met prijzenkolom schuift de naamkolom op
  const naamLeft = isSchmitt ? 'left-28' : 'left-14'

  return (
    <div className="space-y-6">
      {showTitle && (
        <div>
          {poule.id === ENNOVATE_POULE_ID ? (
            <h2 className="leading-none">
              <Image src="/ennovate.png" alt={poule.name} width={500} height={80} className="h-7 sm:h-8 w-auto" />
            </h2>
          ) : (
            <h2 className="font-display text-2xl text-wk-text uppercase leading-none">{poule.name}</h2>
          )}
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {ranked.length} {ranked.length === 1 ? 'deelnemer' : 'deelnemers'}
          </p>
        </div>
      )}

      {/* Twee weergaven: klassiek klassement of de bergetappe */}
      <LeaderboardTabs
        bergetappe={
          showBergetappe ? (
            <Bergetappe
              currentUserId={currentUserId}
              progress={tournamentProgress}
              entries={ranked.map(({ profile, score }) => ({
                id: profile.id,
                username: profile.username,
                avatarUrl: profile.avatar_url,
                totalPts: score.total_pts,
              }))}
            />
          ) : undefined
        }
      >

      {/* Podium voor de top 3 */}
      {ranked.length > 0 && (
        <Podium
          currentUserId={currentUserId}
          entries={ranked.slice(0, 3).map(({ profile, score }) => ({
            id: profile.id,
            username: profile.username,
            avatarUrl: profile.avatar_url,
            totalPts: score.total_pts,
          }))}
        />
      )}

      {/* Leaderboard tabel */}
      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        {ranked.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-xs text-wk-muted tracking-[0.12em]">
            Nog geen deelnemers.
          </div>
        ) : (
          <>
          {/* Mobile: twee regels per deelnemer */}
          <div className="sm:hidden divide-y divide-white/5">
            {ranked.map(({ profile, score }, index) => {
              const isCurrentUser = profile.id === currentUserId
              const medals = ['🥇', '🥈', '🥉']
              const medal = index < 3 ? medals[index] : null
              const prijs = prijsVoor(index)
              return (
                <div key={profile.id} className={`px-4 py-3 space-y-1.5 ${isCurrentUser ? 'bg-wk-gold/5' : ''}`}>
                  {/* Rij 1: positie + naam + totaal */}
                  <div className="flex items-center gap-3">
                    <div className="w-6 text-center shrink-0">
                      {medal ? <span className="text-sm">{medal}</span> : <span className="font-mono text-xs text-wk-muted">{index + 1}</span>}
                    </div>
                    <RankBadge change={score.rank_change} />
                    <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={24} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/deelnemers/${profile.id}`} className={`block text-sm font-medium truncate hover:underline underline-offset-2 ${isCurrentUser ? 'text-wk-gold font-bold' : 'text-wk-text hover:text-wk-gold'}`}>{profile.username}</Link>
                      {profile.full_name && (
                        <p className="font-mono text-[9px] text-wk-muted truncate leading-tight">{profile.full_name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-display text-base text-wk-gold">{score.total_pts}<span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span></span>
                      {prijs && (
                        <p className="font-mono text-[9px] font-bold text-wk-green leading-tight">{prijs}</p>
                      )}
                    </div>
                  </div>
                  {/* Rij 2 + 3: categorieën bovenop, waarden eronder */}
                  {(() => {
                    const cats = [
                      { label: 'WED',    val: score.group_match_pts },
                      { label: 'STAND',  val: score.group_standings_pts },
                      { label: 'KO',     val: score.knockout_pts },
                      { label: 'BONUS',  val: score.bonus_pre_pts },
                      { label: 'DAG',    val: score.bonus_daily_pts },
                      { label: 'JOKERS', val: score.jokers_played },
                    ]
                    return (
                      <div className="pl-9 space-y-0.5">
                        {/* Categorielabels */}
                        <div className="flex gap-0">
                          {cats.map(({ label }) => (
                            <span key={label} className="flex-1 font-mono text-[8px] text-wk-muted/60 tracking-widest text-center uppercase">
                              {label}
                            </span>
                          ))}
                        </div>
                        {/* Waarden */}
                        <div className="flex gap-0">
                          {cats.map(({ label, val }) => (
                            <span key={label} className={`flex-1 font-mono text-[11px] font-bold text-center ${val > 0 ? 'text-wk-soft' : 'text-wk-muted/40'}`}>
                              {val}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
          {/* Desktop: volledige tabel */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[680px] text-left border-collapse">
              {/* Header */}
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-10 bg-wk-surface px-3 py-2.5 w-8 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center">#</th>
                  <th className="sticky left-8 z-10 bg-wk-surface px-0 py-2.5 w-6 font-mono text-[9px] text-wk-muted tracking-widest uppercase text-center">±</th>
                  {isSchmitt && (
                    <th className="sticky left-14 z-10 bg-wk-surface px-2 py-2.5 w-14 font-mono text-[9px] text-wk-green tracking-widest uppercase text-right">Prijs</th>
                  )}
                  <th className={`sticky ${naamLeft} z-10 bg-wk-surface pl-2 pr-4 py-2.5 font-mono text-[9px] text-wk-muted tracking-widest uppercase`}>Deelnemer</th>
                  <th className="px-3 py-2.5 w-20 min-w-20 font-mono text-[9px] text-wk-gold tracking-widest uppercase text-right">Totaal</th>
                  <ColHeader label="JOKERS" sublabel="/ 12" />
                  <ColHeader label="WED" sublabel="Groepsfase" />
                  <ColHeader label="STAND" sublabel="Eindstand" />
                  <ColHeader label="KO" sublabel="KO-fase" />
                  <ColHeader label="BONUS" sublabel="Bonus vooraf" />
                  <ColHeader label="DAG" sublabel="Bonus dagelijks" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ranked.map(({ profile, score }, index) => {
                  const isCurrentUser = profile.id === currentUserId
                  const medals = ['🥇', '🥈', '🥉']
                  const medal = index < 3 ? medals[index] : null
                  const prijs = prijsVoor(index)

                  return (
                    <tr
                      key={profile.id}
                      className={`${isCurrentUser ? 'bg-wk-gold/5' : 'hover:bg-white/2'}`}
                    >
                      {/* Positie */}
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-3 w-8 text-center">
                        {medal
                          ? <span className="text-sm">{medal}</span>
                          : <span className="font-mono text-xs text-wk-muted">{index + 1}</span>
                        }
                      </td>

                      {/* Rang-wijziging */}
                      <td className="sticky left-8 z-10 bg-inherit px-0 py-3 w-6 text-center">
                        <RankBadge change={score.rank_change} />
                      </td>

                      {/* Prijzengeld (alleen Schmitt-league) */}
                      {isSchmitt && (
                        <td className="sticky left-14 z-10 bg-inherit px-2 py-3 w-14 text-right">
                          {prijs && (
                            <span className="font-mono text-[10px] font-bold text-wk-green whitespace-nowrap">{prijs}</span>
                          )}
                        </td>
                      )}

                      {/* Naam */}
                      <td className={`sticky ${naamLeft} z-10 bg-inherit pl-2 pr-4 py-3`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} size={28} />
                          <div className="min-w-0">
                            <Link href={`/deelnemers/${profile.id}`} className={`block text-sm whitespace-nowrap hover:underline underline-offset-2 ${isCurrentUser ? 'font-bold text-wk-gold' : 'font-medium text-wk-text hover:text-wk-gold'}`}>
                              {profile.username}
                            </Link>
                            {profile.full_name && (
                              <p className="font-mono text-[9px] text-wk-muted whitespace-nowrap leading-tight">{profile.full_name}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Totaal */}
                      <td className="px-3 py-3 w-20 text-right">
                        <span className="font-display text-base text-wk-gold">{score.total_pts}</span>
                        <span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span>
                      </td>

                      {/* Jokers */}
                      <DataCell value={score.jokers_played} suffix={`/12`} />

                      {/* Groepsfase wedstrijden */}
                      <DataCell value={score.group_match_pts} suffix="pt" />

                      {/* Groepsfase eindstand */}
                      <DataCell value={score.group_standings_pts} suffix="pt" />

                      {/* KO-fase */}
                      <DataCell value={score.knockout_pts} suffix="pt" />

                      {/* Bonus vooraf */}
                      <DataCell value={score.bonus_pre_pts} suffix="pt" />

                      {/* Bonus dagelijks */}
                      <DataCell value={score.bonus_daily_pts} suffix="pt" />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Legenda */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          ['WED', 'Groepsfase wedstrijden'],
          ['STAND', 'Groepsfase eindstanden'],
          ['KO', 'Knockout-fase'],
          ['BONUS', 'Bonusvragen vooraf'],
          ['DAG', 'Bonusvragen dagelijks'],
          ['JOKERS', 'Ingezette jokers (max. 1 per groep)'],
        ].map(([abbr, label]) => (
          <div key={abbr} className="flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold text-wk-gold bg-wk-gold/10 border border-wk-gold/20 rounded px-1.5 py-0.5 tracking-widest shrink-0">
              {abbr}
            </span>
            <span className="font-mono text-[9px] text-wk-muted tracking-widest">{label}</span>
          </div>
        ))}
      </div>

      </LeaderboardTabs>
    </div>
  )
}

// ─── Tabel-subcomponenten ─────────────────────────────────────────────────────

function ColHeader({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <th className="px-3 py-2.5 text-right w-20 min-w-20">
      <span className="block font-mono text-[9px] font-bold text-wk-muted tracking-widest uppercase">{label}</span>
      <span className="block font-mono text-[8px] text-wk-muted/50 tracking-widest normal-case">{sublabel}</span>
    </th>
  )
}

function DataCell({ value, suffix }: { value: number; suffix: string }) {
  const isEmpty = value === 0
  return (
    <td className="px-3 py-3 w-20 text-right">
      <span className={`font-mono text-xs ${isEmpty ? 'text-wk-muted/40' : 'text-wk-soft'}`}>
        {value}
      </span>
      <span className="font-mono text-[9px] text-wk-muted/40 ml-0.5">{suffix}</span>
    </td>
  )
}

function RankBadge({ change }: { change: number | null }) {
  if (change === null || change === 0) {
    return <span className="font-mono text-[10px] text-wk-muted/40">–</span>
  }
  if (change > 0) {
    return (
      <span className="font-mono text-[10px] font-bold text-wk-green tracking-tighter">
        ↑{change}
      </span>
    )
  }
  return (
    <span className="font-mono text-[10px] font-bold text-wk-red tracking-tighter">
      ↓{Math.abs(change)}
    </span>
  )
}
