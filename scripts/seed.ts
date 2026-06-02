/**
 * WK Poule 2026 — Seed Script
 *
 * Vereiste env vars in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Gebruik:
 *   npm run seed              (skip als data al bestaat)
 *   npm run seed -- --reset   (verwijdert bestaande teams/wedstrijden en herseeded)
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { Database } from '../lib/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Node 20 heeft geen native WebSocket — geef 'ws' mee
const supabase = createClient<Database>(url, key, {
  realtime: { transport: ws as unknown as typeof WebSocket },
})
const RESET = process.argv.includes('--reset')

// ─── Flag helper ──────────────────────────────────────────────────────────────
function flag(code: string) {
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`
}

// ─── 48 teams (12 groepen × 4 teams) — WK 2026 officiële loting ─────────────
const TEAMS: { nameNl: string; nameEn: string; code: string; group: string }[] = [
  // Groep A
  { nameNl: 'Mexico',             nameEn: 'Mexico',               code: 'mx',     group: 'A' },
  { nameNl: 'Zuid-Afrika',        nameEn: 'South Africa',         code: 'za',     group: 'A' },
  { nameNl: 'Zuid-Korea',         nameEn: 'South Korea',          code: 'kr',     group: 'A' },
  { nameNl: 'Tsjechië',           nameEn: 'Czech Republic',       code: 'cz',     group: 'A' },
  // Groep B
  { nameNl: 'Canada',             nameEn: 'Canada',               code: 'ca',     group: 'B' },
  { nameNl: 'Bosnië-Herzegovina', nameEn: 'Bosnia',               code: 'ba',     group: 'B' },
  { nameNl: 'Qatar',              nameEn: 'Qatar',                code: 'qa',     group: 'B' },
  { nameNl: 'Zwitserland',        nameEn: 'Switzerland',          code: 'ch',     group: 'B' },
  // Groep C
  { nameNl: 'Brazilië',           nameEn: 'Brazil',               code: 'br',     group: 'C' },
  { nameNl: 'Marokko',            nameEn: 'Morocco',              code: 'ma',     group: 'C' },
  { nameNl: 'Haïti',              nameEn: 'Haiti',                code: 'ht',     group: 'C' },
  { nameNl: 'Schotland',          nameEn: 'Scotland',             code: 'gb-sct', group: 'C' },
  // Groep D
  { nameNl: 'Verenigde Staten',   nameEn: 'United States',        code: 'us',     group: 'D' },
  { nameNl: 'Paraguay',           nameEn: 'Paraguay',             code: 'py',     group: 'D' },
  { nameNl: 'Australië',          nameEn: 'Australia',            code: 'au',     group: 'D' },
  { nameNl: 'Turkije',            nameEn: 'Turkey',               code: 'tr',     group: 'D' },
  // Groep E
  { nameNl: 'Duitsland',          nameEn: 'Germany',              code: 'de',     group: 'E' },
  { nameNl: 'Curaçao',            nameEn: 'Curacao',              code: 'cw',     group: 'E' },
  { nameNl: 'Ivoorkust',          nameEn: 'Ivory Coast',          code: 'ci',     group: 'E' },
  { nameNl: 'Ecuador',            nameEn: 'Ecuador',              code: 'ec',     group: 'E' },
  // Groep F
  { nameNl: 'Nederland',          nameEn: 'Netherlands',          code: 'nl',     group: 'F' },
  { nameNl: 'Japan',              nameEn: 'Japan',                code: 'jp',     group: 'F' },
  { nameNl: 'Zweden',             nameEn: 'Sweden',               code: 'se',     group: 'F' },
  { nameNl: 'Tunesië',            nameEn: 'Tunisia',              code: 'tn',     group: 'F' },
  // Groep G
  { nameNl: 'België',             nameEn: 'Belgium',              code: 'be',     group: 'G' },
  { nameNl: 'Egypte',             nameEn: 'Egypt',                code: 'eg',     group: 'G' },
  { nameNl: 'Iran',               nameEn: 'Iran',                 code: 'ir',     group: 'G' },
  { nameNl: 'Nieuw-Zeeland',      nameEn: 'New Zealand',          code: 'nz',     group: 'G' },
  // Groep H
  { nameNl: 'Spanje',             nameEn: 'Spain',                code: 'es',     group: 'H' },
  { nameNl: 'Kaapverdië',         nameEn: 'Cape Verde',           code: 'cv',     group: 'H' },
  { nameNl: 'Saudi-Arabië',       nameEn: 'Saudi Arabia',         code: 'sa',     group: 'H' },
  { nameNl: 'Uruguay',            nameEn: 'Uruguay',              code: 'uy',     group: 'H' },
  // Groep I
  { nameNl: 'Frankrijk',          nameEn: 'France',               code: 'fr',     group: 'I' },
  { nameNl: 'Senegal',            nameEn: 'Senegal',              code: 'sn',     group: 'I' },
  { nameNl: 'Irak',               nameEn: 'Iraq',                 code: 'iq',     group: 'I' },
  { nameNl: 'Noorwegen',          nameEn: 'Norway',               code: 'no',     group: 'I' },
  // Groep J
  { nameNl: 'Argentinië',         nameEn: 'Argentina',            code: 'ar',     group: 'J' },
  { nameNl: 'Algerije',           nameEn: 'Algeria',              code: 'dz',     group: 'J' },
  { nameNl: 'Oostenrijk',         nameEn: 'Austria',              code: 'at',     group: 'J' },
  { nameNl: 'Jordanië',           nameEn: 'Jordan',               code: 'jo',     group: 'J' },
  // Groep K
  { nameNl: 'Portugal',           nameEn: 'Portugal',             code: 'pt',     group: 'K' },
  { nameNl: 'DR Congo',           nameEn: 'DR Congo',             code: 'cd',     group: 'K' },
  { nameNl: 'Oezbekistan',        nameEn: 'Uzbekistan',           code: 'uz',     group: 'K' },
  { nameNl: 'Colombia',           nameEn: 'Colombia',             code: 'co',     group: 'K' },
  // Groep L
  { nameNl: 'Engeland',           nameEn: 'England',              code: 'gb-eng', group: 'L' },
  { nameNl: 'Kroatië',            nameEn: 'Croatia',              code: 'hr',     group: 'L' },
  { nameNl: 'Ghana',              nameEn: 'Ghana',                code: 'gh',     group: 'L' },
  { nameNl: 'Panama',             nameEn: 'Panama',               code: 'pa',     group: 'L' },
]

// ─── 72 groepswedstrijden — officieel speelschema WK 2026 ────────────────────
// kickoffUtc: alle tijden in UTC (berekend vanuit lokale aanvangstijden)
// Tijdzones: MDT=UTC-6, CDT=UTC-5, EDT=UTC-4, PDT=UTC-7
const MATCHES: { n: number; home: string; away: string; kickoffUtc: string; group: string }[] = [
  // ── Groep A ──
  { n:  1, home: 'Mexico',         away: 'South Africa',   kickoffUtc: '2026-06-11T19:00:00Z', group: 'A' }, // Azteca   21:00 CEST jun 11
  { n:  2, home: 'South Korea',    away: 'Czech Republic', kickoffUtc: '2026-06-13T00:00:00Z', group: 'A' }, // Akron    18:00 MDT jun 12
  { n: 25, home: 'Czech Republic', away: 'South Africa',   kickoffUtc: '2026-06-18T20:00:00Z', group: 'A' }, // Atlanta  16:00 EDT
  { n: 28, home: 'Mexico',         away: 'South Korea',    kickoffUtc: '2026-06-20T01:00:00Z', group: 'A' }, // Akron    19:00 MDT jun 19
  { n: 53, home: 'Czech Republic', away: 'Mexico',         kickoffUtc: '2026-06-24T23:00:00Z', group: 'A' }, // Azteca   17:00 MDT
  { n: 54, home: 'South Africa',   away: 'South Korea',    kickoffUtc: '2026-06-24T23:00:00Z', group: 'A' }, // BBVA     17:00 MDT

  // ── Groep B ──
  { n:  3, home: 'Canada',         away: 'Bosnia',         kickoffUtc: '2026-06-12T19:00:00Z', group: 'B' }, // Toronto  15:00 EDT
  { n:  8, home: 'Qatar',          away: 'Switzerland',    kickoffUtc: '2026-06-13T19:00:00Z', group: 'B' }, // Levi's   12:00 PDT
  { n: 26, home: 'Switzerland',    away: 'Bosnia',         kickoffUtc: '2026-06-18T19:00:00Z', group: 'B' }, // SoFi     12:00 PDT
  { n: 27, home: 'Canada',         away: 'Qatar',          kickoffUtc: '2026-06-18T22:00:00Z', group: 'B' }, // BC Place 15:00 PDT
  { n: 51, home: 'Switzerland',    away: 'Canada',         kickoffUtc: '2026-06-24T19:00:00Z', group: 'B' }, // BC Place 12:00 PDT
  { n: 52, home: 'Bosnia',         away: 'Qatar',          kickoffUtc: '2026-06-24T19:00:00Z', group: 'B' }, // Lumen    12:00 PDT

  // ── Groep C ──
  { n:  7, home: 'Brazil',         away: 'Morocco',        kickoffUtc: '2026-06-13T22:00:00Z', group: 'C' }, // MetLife  18:00 EDT
  { n:  5, home: 'Haiti',          away: 'Scotland',       kickoffUtc: '2026-06-15T01:00:00Z', group: 'C' }, // Gillette 21:00 EDT jun 14
  { n: 30, home: 'Scotland',       away: 'Morocco',        kickoffUtc: '2026-06-19T22:00:00Z', group: 'C' }, // Gillette 18:00 EDT
  { n: 29, home: 'Brazil',         away: 'Haiti',          kickoffUtc: '2026-06-21T00:30:00Z', group: 'C' }, // Philly   20:30 EDT jun 20
  { n: 49, home: 'Scotland',       away: 'Brazil',         kickoffUtc: '2026-06-24T22:00:00Z', group: 'C' }, // Miami    18:00 EDT
  { n: 50, home: 'Morocco',        away: 'Haiti',          kickoffUtc: '2026-06-24T22:00:00Z', group: 'C' }, // Atlanta  18:00 EDT

  // ── Groep D ──
  { n:  4, home: 'United States',  away: 'Paraguay',       kickoffUtc: '2026-06-14T01:00:00Z', group: 'D' }, // SoFi     18:00 PDT jun 13
  { n:  6, home: 'Australia',      away: 'Turkey',         kickoffUtc: '2026-06-15T04:00:00Z', group: 'D' }, // BC Place 21:00 PDT jun 14
  { n: 32, home: 'United States',  away: 'Australia',      kickoffUtc: '2026-06-19T19:00:00Z', group: 'D' }, // Lumen    12:00 PDT
  { n: 31, home: 'Turkey',         away: 'Paraguay',       kickoffUtc: '2026-06-21T01:00:00Z', group: 'D' }, // Levi's   18:00 PDT jun 20
  { n: 59, home: 'Turkey',         away: 'United States',  kickoffUtc: '2026-06-27T02:00:00Z', group: 'D' }, // SoFi     19:00 PDT jun 26
  { n: 60, home: 'Paraguay',       away: 'Australia',      kickoffUtc: '2026-06-27T02:00:00Z', group: 'D' }, // Levi's   19:00 PDT jun 26

  // ── Groep E ──
  { n: 10, home: 'Germany',        away: 'Curacao',        kickoffUtc: '2026-06-14T17:00:00Z', group: 'E' }, // Houston  12:00 CDT
  { n:  9, home: 'Ivory Coast',    away: 'Ecuador',        kickoffUtc: '2026-06-14T23:00:00Z', group: 'E' }, // Philly   19:00 EDT
  { n: 33, home: 'Germany',        away: 'Ivory Coast',    kickoffUtc: '2026-06-20T20:00:00Z', group: 'E' }, // Toronto  16:00 EDT
  { n: 34, home: 'Ecuador',        away: 'Curacao',        kickoffUtc: '2026-06-22T00:00:00Z', group: 'E' }, // KC       19:00 CDT jun 21
  { n: 55, home: 'Curacao',        away: 'Ivory Coast',    kickoffUtc: '2026-06-25T20:00:00Z', group: 'E' }, // Philly   16:00 EDT
  { n: 56, home: 'Ecuador',        away: 'Germany',        kickoffUtc: '2026-06-25T20:00:00Z', group: 'E' }, // MetLife  16:00 EDT

  // ── Groep F ──
  { n: 11, home: 'Netherlands',    away: 'Japan',          kickoffUtc: '2026-06-14T20:00:00Z', group: 'F' }, // AT&T     15:00 CDT
  { n: 12, home: 'Sweden',         away: 'Tunisia',        kickoffUtc: '2026-06-16T02:00:00Z', group: 'F' }, // BBVA     20:00 MDT jun 15
  { n: 35, home: 'Netherlands',    away: 'Sweden',         kickoffUtc: '2026-06-20T17:00:00Z', group: 'F' }, // Houston  12:00 CDT
  { n: 36, home: 'Tunisia',        away: 'Japan',          kickoffUtc: '2026-06-22T04:00:00Z', group: 'F' }, // BBVA     22:00 MDT jun 21
  { n: 57, home: 'Japan',          away: 'Sweden',         kickoffUtc: '2026-06-25T23:00:00Z', group: 'F' }, // AT&T     18:00 CDT
  { n: 58, home: 'Tunisia',        away: 'Netherlands',    kickoffUtc: '2026-06-25T23:00:00Z', group: 'F' }, // KC       18:00 CDT

  // ── Groep G ──
  { n: 16, home: 'Belgium',        away: 'Egypt',          kickoffUtc: '2026-06-15T19:00:00Z', group: 'G' }, // Lumen    12:00 PDT
  { n: 15, home: 'Iran',           away: 'New Zealand',    kickoffUtc: '2026-06-17T01:00:00Z', group: 'G' }, // SoFi     18:00 PDT jun 16
  { n: 39, home: 'Belgium',        away: 'Iran',           kickoffUtc: '2026-06-21T19:00:00Z', group: 'G' }, // SoFi     12:00 PDT
  { n: 40, home: 'New Zealand',    away: 'Egypt',          kickoffUtc: '2026-06-23T01:00:00Z', group: 'G' }, // BC Place 18:00 PDT jun 22
  { n: 63, home: 'Egypt',          away: 'Iran',           kickoffUtc: '2026-06-28T03:00:00Z', group: 'G' }, // Lumen    20:00 PDT jun 27
  { n: 64, home: 'New Zealand',    away: 'Belgium',        kickoffUtc: '2026-06-28T03:00:00Z', group: 'G' }, // BC Place 20:00 PDT jun 27

  // ── Groep H ──
  { n: 14, home: 'Spain',          away: 'Cape Verde',     kickoffUtc: '2026-06-15T16:00:00Z', group: 'H' }, // Atlanta  12:00 EDT
  { n: 13, home: 'Saudi Arabia',   away: 'Uruguay',        kickoffUtc: '2026-06-15T22:00:00Z', group: 'H' }, // Miami    18:00 EDT
  { n: 38, home: 'Spain',          away: 'Saudi Arabia',   kickoffUtc: '2026-06-21T16:00:00Z', group: 'H' }, // Atlanta  12:00 EDT
  { n: 37, home: 'Uruguay',        away: 'Cape Verde',     kickoffUtc: '2026-06-21T22:00:00Z', group: 'H' }, // Miami    18:00 EDT
  { n: 65, home: 'Cape Verde',     away: 'Saudi Arabia',   kickoffUtc: '2026-06-28T00:00:00Z', group: 'H' }, // Houston  19:00 CDT jun 27
  { n: 66, home: 'Uruguay',        away: 'Spain',          kickoffUtc: '2026-06-28T00:00:00Z', group: 'H' }, // Akron    18:00 MDT jun 27

  // ── Groep I ──
  { n: 17, home: 'France',         away: 'Senegal',        kickoffUtc: '2026-06-16T19:00:00Z', group: 'I' }, // MetLife  15:00 EDT
  { n: 18, home: 'Iraq',           away: 'Norway',         kickoffUtc: '2026-06-16T22:00:00Z', group: 'I' }, // Gillette 18:00 EDT
  { n: 42, home: 'France',         away: 'Iraq',           kickoffUtc: '2026-06-22T21:00:00Z', group: 'I' }, // Philly   17:00 EDT
  { n: 41, home: 'Norway',         away: 'Senegal',        kickoffUtc: '2026-06-24T00:00:00Z', group: 'I' }, // MetLife  20:00 EDT jun 23
  { n: 61, home: 'Norway',         away: 'France',         kickoffUtc: '2026-06-26T19:00:00Z', group: 'I' }, // Gillette 15:00 EDT
  { n: 62, home: 'Senegal',        away: 'Iraq',           kickoffUtc: '2026-06-26T19:00:00Z', group: 'I' }, // Toronto  15:00 EDT

  // ── Groep J ──
  { n: 19, home: 'Argentina',      away: 'Algeria',        kickoffUtc: '2026-06-18T01:00:00Z', group: 'J' }, // KC       20:00 CDT jun 17
  { n: 20, home: 'Austria',        away: 'Jordan',         kickoffUtc: '2026-06-18T04:00:00Z', group: 'J' }, // Levi's   21:00 PDT jun 17
  { n: 43, home: 'Argentina',      away: 'Austria',        kickoffUtc: '2026-06-22T17:00:00Z', group: 'J' }, // AT&T     12:00 CDT
  { n: 44, home: 'Jordan',         away: 'Algeria',        kickoffUtc: '2026-06-24T03:00:00Z', group: 'J' }, // Levi's   20:00 PDT jun 23
  { n: 69, home: 'Algeria',        away: 'Austria',        kickoffUtc: '2026-06-28T21:00:00Z', group: 'J' }, // KC       23:00 CEST jun 28
  { n: 70, home: 'Jordan',         away: 'Argentina',      kickoffUtc: '2026-06-28T21:00:00Z', group: 'J' }, // AT&T     23:00 CEST jun 28

  // ── Groep K ──
  { n: 23, home: 'Portugal',       away: 'DR Congo',       kickoffUtc: '2026-06-17T22:00:00Z', group: 'K' }, // Houston  17:00 CDT
  { n: 24, home: 'Uzbekistan',     away: 'Colombia',       kickoffUtc: '2026-06-19T02:00:00Z', group: 'K' }, // Azteca   20:00 MDT jun 18
  { n: 47, home: 'Portugal',       away: 'Uzbekistan',     kickoffUtc: '2026-06-23T22:00:00Z', group: 'K' }, // Houston  17:00 CDT
  { n: 48, home: 'Colombia',       away: 'DR Congo',       kickoffUtc: '2026-06-25T02:00:00Z', group: 'K' }, // Akron    20:00 MDT jun 24
  { n: 71, home: 'Colombia',       away: 'Portugal',       kickoffUtc: '2026-06-29T03:30:00Z', group: 'K' }, // Miami    23:30 EDT jun 28
  { n: 72, home: 'DR Congo',       away: 'Uzbekistan',     kickoffUtc: '2026-06-29T03:30:00Z', group: 'K' }, // Atlanta  23:30 EDT jun 28

  // ── Groep L ──
  { n: 22, home: 'England',        away: 'Croatia',        kickoffUtc: '2026-06-17T20:00:00Z', group: 'L' }, // AT&T     15:00 CDT
  { n: 21, home: 'Ghana',          away: 'Panama',         kickoffUtc: '2026-06-17T23:00:00Z', group: 'L' }, // Toronto  19:00 EDT
  { n: 45, home: 'England',        away: 'Ghana',          kickoffUtc: '2026-06-23T20:00:00Z', group: 'L' }, // Gillette 16:00 EDT
  { n: 46, home: 'Panama',         away: 'Croatia',        kickoffUtc: '2026-06-23T23:00:00Z', group: 'L' }, // Toronto  19:00 EDT
  { n: 67, home: 'Panama',         away: 'England',        kickoffUtc: '2026-06-27T21:00:00Z', group: 'L' }, // MetLife  17:00 EDT
  { n: 68, home: 'Croatia',        away: 'Ghana',          kickoffUtc: '2026-06-27T21:00:00Z', group: 'L' }, // Philly   17:00 EDT
]

// ─── Bonus vragen ─────────────────────────────────────────────────────────────
const PRE_TOURNAMENT_QUESTIONS = [
  'Wie wordt topscorer van het WK 2026?',
  'Welk land wordt wereldkampioen op het WK 2026?',
  'Wie wordt de beste speler (Gouden Bal) van het WK 2026?',
]

function dailyQuestions(): { question: string; unlock_date: string }[] {
  const templates = [
    (d: number) => `Welk land wint de wedstrijd van dag ${d}?`,
    (d: number) => `Wie scoort als eerste op dag ${d}?`,
    (d: number) => `Hoeveel goals vallen er op dag ${d}?`,
    (d: number) => `Wordt er een rode kaart gegeven op dag ${d}?`,
    (d: number) => `Welke speler is Man of the Match op dag ${d}?`,
    (d: number) => `Eindigt een wedstrijd op dag ${d} in een gelijkspel?`,
    (d: number) => `Welk land heeft de meeste balbezit op dag ${d}?`,
    (d: number) => `Vallen er strafschoppen op dag ${d}?`,
  ]

  const questions: { question: string; unlock_date: string }[] = []
  const start = new Date('2026-06-11')
  const end   = new Date('2026-07-19')
  let day = 1
  const current = new Date(start)

  while (current <= end && questions.length < 64) {
    questions.push({
      question:    templates[(day - 1) % templates.length](day),
      unlock_date: current.toISOString().split('T')[0],
    })
    current.setUTCDate(current.getUTCDate() + 1)
    day++
  }

  return questions
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Start seed...\n')

  // 0. Reset (optioneel)
  if (RESET) {
    console.log('🗑️  Reset: bestaande wedstrijd- en teamdata verwijderen...')
    await supabase.from('group_advancement').delete().neq('id', '')
    await supabase.from('predictions').delete().neq('id', '')
    await supabase.from('poule_scores').delete().neq('user_id', '')
    await supabase.from('matches').delete().eq('stage', 'group')
    await supabase.from('teams').delete().neq('id', '')
    console.log('  ✓ Reset klaar\n')
  }

  // 1. Algemene poule
  console.log('📦 Algemene poule aanmaken...')
  const { data: existing } = await supabase
    .from('poules')
    .select('id')
    .eq('is_general', true)
    .maybeSingle()

  if (!existing) {
    const { error } = await supabase.from('poules').insert({
      name: 'Algemene Poule',
      invite_code: 'ALGEMEEN',
      is_general: true,
    })
    if (error) { console.error('Poule error:', error.message); process.exit(1) }
    console.log('  ✓ Algemene poule aangemaakt')
  } else {
    console.log('  ⏭  Algemene poule bestaat al')
  }

  // 2. Teams
  console.log('\n🏴 Teams seeden (48 teams, groepen A–L)...')
  const { data: existingTeams } = await supabase.from('teams').select('id').limit(1)

  if (existingTeams && existingTeams.length > 0 && !RESET) {
    console.log('  ⏭  Teams bestaan al, gebruik --reset om te herseeden')
  } else {
    const teamRows = TEAMS.map((t) => ({
      name:       t.nameNl,
      code:       t.code,
      flag_url:   flag(t.code),
      group_name: t.group,
    }))

    const { error } = await supabase.from('teams').insert(teamRows)
    if (error) { console.error('Teams error:', error.message); process.exit(1) }
    console.log(`  ✓ ${teamRows.length} teams aangemaakt`)
  }

  // 3. Wedstrijden
  console.log('\n⚽ Wedstrijden seeden (72 groepswedstrijden)...')
  const { data: existingMatches } = await supabase.from('matches').select('id').limit(1)

  if (existingMatches && existingMatches.length > 0 && !RESET) {
    console.log('  ⏭  Wedstrijden bestaan al, gebruik --reset om te herseeden')
  } else {
    const { data: dbTeams } = await supabase
      .from('teams')
      .select('id, name, group_name')

    if (!dbTeams) { console.error('Kon teams niet ophalen'); process.exit(1) }

    // Build map: English name → db id
    const nameToId = new Map<string, string>()
    for (const t of dbTeams) {
      const team = TEAMS.find((x) => x.nameNl === t.name && x.group === t.group_name)
      if (team) nameToId.set(team.nameEn, t.id)
    }

    const matchRows = MATCHES.map((m) => {
      const homeId = nameToId.get(m.home)
      const awayId = nameToId.get(m.away)
      if (!homeId || !awayId) {
        console.error(`Team niet gevonden: ${m.home} of ${m.away} (wedstrijd #${m.n})`)
        process.exit(1)
      }
      return {
        home_team_id: homeId,
        away_team_id: awayId,
        kickoff_at:   m.kickoffUtc,
        stage:        'group',
        match_number: m.n,
      }
    })

    // Sorteer op match_number
    matchRows.sort((a, b) => a.match_number - b.match_number)

    const CHUNK = 20
    for (let i = 0; i < matchRows.length; i += CHUNK) {
      const { error } = await supabase.from('matches').insert(matchRows.slice(i, i + CHUNK))
      if (error) { console.error('Matches error:', error.message); process.exit(1) }
    }
    console.log(`  ✓ ${matchRows.length} wedstrijden aangemaakt`)
  }

  // 4. Pre-tournament bonusvragen
  console.log('\n❓ Pre-tournament bonusvragen...')
  const { data: existingPre } = await supabase
    .from('bonus_questions').select('id').eq('type', 'pre_tournament').limit(1)

  if (existingPre && existingPre.length > 0) {
    console.log('  ⏭  Pre-tournament vragen bestaan al')
  } else {
    const { error } = await supabase.from('bonus_questions').insert(
      PRE_TOURNAMENT_QUESTIONS.map((q) => ({ question: q, type: 'pre_tournament' }))
    )
    if (error) { console.error('Pre-bonus error:', error.message); process.exit(1) }
    console.log(`  ✓ ${PRE_TOURNAMENT_QUESTIONS.length} pre-tournament vragen aangemaakt`)
  }

  // 5. Dagelijkse bonusvragen
  console.log('\n📅 Dagelijkse bonusvragen...')
  const { data: existingDaily } = await supabase
    .from('bonus_questions').select('id').eq('type', 'daily').limit(1)

  if (existingDaily && existingDaily.length > 0) {
    console.log('  ⏭  Dagelijkse vragen bestaan al')
  } else {
    const daily = dailyQuestions()
    const { error } = await supabase.from('bonus_questions').insert(
      daily.map((q) => ({ question: q.question, type: 'daily', unlock_date: q.unlock_date }))
    )
    if (error) { console.error('Daily bonus error:', error.message); process.exit(1) }
    console.log(`  ✓ ${daily.length} dagelijkse vragen aangemaakt (11 jun – 19 jul)`)
  }

  console.log('\n✅ Seed klaar!')
}

seed().catch((e) => { console.error(e); process.exit(1) })
