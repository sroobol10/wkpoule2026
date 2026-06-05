/**
 * WK Poule 2026 — KO-matches aanmaken
 *
 * Leest de huidige groepsstanden uit de DB en maakt alle KO-wedstrijden aan:
 *   - R32 (sloten 73-88): teams ingevuld op basis van groepsresultaten
 *   - R16 t/m Finale (slots 89-104): placeholder (teams = null, worden gevuld
 *     via Admin → Knockout → "Vul volgende ronde in" na elke ronde)
 *
 * Gebruik:
 *   npm run ko:create           — maakt matches aan (skip als al bestaan)
 *   npm run ko:create -- --reset — verwijdert bestaande KO-matches en herstart
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const k = trimmed.slice(0, eq).trim()
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
} catch { /* .env.local niet gevonden */ }

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { Database } from '../lib/types'
import { BRACKET, KO_KICKOFFS, assignThirdPlaceSlots } from '../lib/bracket'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient<Database>(url, key, {
  realtime: { transport: ws as unknown as typeof WebSocket },
})

const RESET = process.argv.includes('--reset')
const KO_SLOTS = BRACKET.map((b) => b.slot)

// ─── Bereken groepsstanden vanuit werkelijke uitslagen ────────────────────────

type Stats = { pts: number; gd: number; gf: number }

async function computeGroupStandings(): Promise<{
  sortedGroups: Record<string, string[]>
  thirds: { group: string; teamId: string; pts: number; gd: number; gf: number }[]
}> {
  const { data: matches } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, result_entered, home_team:teams!matches_home_team_id_fkey(group_name)')
    .eq('stage', 'group')

  const standings: Record<string, Record<string, Stats>> = {}

  for (const m of matches ?? []) {
    if (!m.result_entered || m.home_score == null || m.away_score == null) continue
    const group = (m.home_team as { group_name: string } | null)?.group_name
    if (!group || !m.home_team_id || !m.away_team_id) continue
    if (!standings[group]) standings[group] = {}
    if (!standings[group][m.home_team_id]) standings[group][m.home_team_id] = { pts: 0, gd: 0, gf: 0 }
    if (!standings[group][m.away_team_id]) standings[group][m.away_team_id] = { pts: 0, gd: 0, gf: 0 }
    const h = m.home_score, a = m.away_score
    standings[group][m.home_team_id].gf += h; standings[group][m.home_team_id].gd += h - a
    standings[group][m.away_team_id].gf += a; standings[group][m.away_team_id].gd += a - h
    if (h > a) standings[group][m.home_team_id].pts += 3
    else if (h < a) standings[group][m.away_team_id].pts += 3
    else { standings[group][m.home_team_id].pts += 1; standings[group][m.away_team_id].pts += 1 }
  }

  const sortedGroups: Record<string, string[]> = {}
  const thirds: { group: string; teamId: string; pts: number; gd: number; gf: number }[] = []

  for (const [g, teams] of Object.entries(standings)) {
    const sorted = Object.entries(teams)
      .sort(([, x], [, y]) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf)
      .map(([id]) => id)
    sortedGroups[g] = sorted
    if (sorted[2]) {
      const st = teams[sorted[2]]
      thirds.push({ group: g, teamId: sorted[2], ...st })
    }
  }

  return { sortedGroups, thirds }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('⚽ KO-matches aanmaken voor WK 2026...\n')

  // Reset indien gewenst
  if (RESET) {
    console.log('🗑️  Bestaande KO-matches verwijderen...')
    await supabase.from('knockout_predictions').delete().not('id', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('bracket_predictions').delete().not('id', 'is', null)
    await supabase.from('matches').delete().in('match_number', KO_SLOTS)
    console.log('  ✓ Verwijderd\n')
  }

  // Check of KO-matches al bestaan
  const { data: existing } = await supabase
    .from('matches')
    .select('match_number')
    .in('match_number', KO_SLOTS)

  if (existing && existing.length > 0 && !RESET) {
    console.log(`⏭  KO-matches bestaan al (${existing.length} gevonden). Gebruik --reset om te herstart.`)
    process.exit(0)
  }

  // Groepsstanden berekenen
  console.log('📊 Groepsstanden berekenen...')
  const { sortedGroups, thirds } = await computeGroupStandings()

  const groupsDone = Object.keys(sortedGroups).length
  console.log(`  ${groupsDone}/12 groepen met resultaten`)

  // Beste 8 nummers 3 bepalen
  const best8 = [...thirds]
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    .slice(0, 8)
  const best8Groups = best8.map((t) => t.group).sort()
  const thirdAssignment = assignThirdPlaceSlots(best8Groups)
  const thirdTeamBySlot: Record<number, string> = {}
  for (const [slot, group] of Object.entries(thirdAssignment)) {
    const teamId = sortedGroups[group]?.[2]
    if (teamId) thirdTeamBySlot[Number(slot)] = teamId
  }

  if (groupsDone < 12) {
    console.log('\n⚠️  Niet alle groepen hebben resultaten.')
    console.log('   R32-teams worden deels als null aangemaakt (vul later handmatig in via Admin).\n')
  }

  // Seed resolver: '1A', '2B', '3_74', 'W73' → teamId of null
  function resolveTeam(seed: string): string | null {
    if (seed.startsWith('3_')) {
      return thirdTeamBySlot[parseInt(seed.slice(2))] ?? null
    }
    const pos = parseInt(seed[0]) - 1
    const group = seed[1]
    return sortedGroups[group]?.[pos] ?? null
  }

  // Bouw match-rijen
  const rows = BRACKET.map((bm) => {
    const isR32 = bm.stage === 'r32'
    const homeId = isR32 ? resolveTeam(bm.homeSeed) : null
    const awayId = isR32 ? resolveTeam(bm.awaySeed) : null
    return {
      match_number: bm.slot,
      stage:        bm.stage,
      kickoff_at:   KO_KICKOFFS[bm.slot],
      home_team_id: homeId,
      away_team_id: awayId,
    }
  })

  // Invoegen in batches
  console.log('\n🏆 KO-wedstrijden aanmaken...')
  const CHUNK = 10
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('matches').insert(rows.slice(i, i + CHUNK))
    if (error) { console.error('Fout bij invoegen:', error.message); process.exit(1) }
  }

  console.log(`  ✓ ${rows.length} wedstrijden aangemaakt`)

  // Overzicht
  const r32Done = rows.filter((r) => r.stage === 'r32' && r.home_team_id && r.away_team_id).length
  console.log(`\n📋 Overzicht:`)
  console.log(`  R32: ${r32Done}/16 met teams ingevuld`)
  console.log(`  R16-Finale: placeholder (null teams, vul in via Admin → "Vul volgende ronde in")`)
  console.log('\n✅ Klaar!')
}

run().catch((e) => { console.error(e); process.exit(1) })
