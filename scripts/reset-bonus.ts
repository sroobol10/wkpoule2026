/**
 * WK Poule 2026 — Bonus-reset script
 *
 * Verwijdert alle bestaande bonus_answers en bonus_questions,
 * en laadt de nieuwe vragen opnieuw in.
 *
 * Gebruik:
 *   npm run bonus:reset
 */

// Laad .env.local handmatig (Node 18 ondersteunt --env-file niet)
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient<Database>(url, key, {
  realtime: { transport: ws as unknown as typeof WebSocket },
})

// ─── Vooraf-vragen ────────────────────────────────────────────────────────────

const PRE_TOURNAMENT: { question: string; description: string }[] = [
  {
    question:    'Topscorer',
    description: 'Volgens officiële FIFA-statistieken',
  },
  {
    question:    'Beste speler',
    description: 'Volgens de FIFA-verkiezing',
  },
  {
    question:    'Goalgettergigant',
    description: 'Elk gescoord doelpunt is 1 punt, incl. eigen doelpunten van de tegenstander',
  },
  {
    question:    'Desastreuze defensie',
    description: 'Elk tegendoelpunt is 1 punt, incl. eigen doelpunten',
  },
  {
    question:    'Kaartenkoning',
    description: 'Elke gele kaart is 1 punt, elke rode kaart 2 punten',
  },
  {
    question:    'GOAT',
    description: 'Wie scoort meer doelpunten? Ronaldo of Messi?',
  },
  {
    question:    'Gedoseerde groepsfase',
    description: 'Hoeveel wedstrijden eindigen in een gelijkspel in de groepsfase?',
  },
]

// ─── Dagelijkse vragen ────────────────────────────────────────────────────────

const DAILY: { date: string; question: string }[] = [
  { date: '2026-06-11', question: 'In welke minuut wordt de eerste goal van het toernooi gescoord?' },
  { date: '2026-06-12', question: 'Worden er vandaag 4 of minder, of 5 of meer goals gescoord?' },
  { date: '2026-06-13', question: 'Eindigt vandaag (minimaal) één van de twee wedstrijden in een gelijkspel?' },
  { date: '2026-06-14', question: 'Hoeveel goals scoren Duitsland en Nederland vanavond tezamen?' },
  { date: '2026-06-15', question: 'Hoeveel goals scoren de acht landen vandaag tezamen?' },
  { date: '2026-06-16', question: 'Wordt er vandaag een speler uit het veld gestuurd met een rode kaart?' },
  { date: '2026-06-17', question: 'Hoeveel goals scoren Messi en Ronaldo vandaag tezamen?' },
  { date: '2026-06-18', question: 'Hoeveel wedstrijden eindigen vandaag in een gelijkspel?' },
  { date: '2026-06-19', question: 'Hoeveel punten behalen de drie gastlanden vandaag tezamen?' },
  { date: '2026-06-20', question: 'Hoeveel goals scoren Marokko en Turkije vanavond tezamen?' },
  { date: '2026-06-21', question: 'Worden er vandaag 8 of minder, of 9 of meer goals gescoord?' },
  { date: '2026-06-22', question: 'In welke wedstrijd worden de meeste goals gescoord vandaag?' },
  { date: '2026-06-23', question: 'Hoeveel goals scoren Haaland en Kane vandaag tezamen?' },
  { date: '2026-06-24', question: 'Wordt er vandaag een speler uit het veld gestuurd met een rode kaart?' },
  { date: '2026-06-25', question: 'Hoeveel wedstrijden eindigen vandaag in een gelijkspel?' },
  { date: '2026-06-26', question: 'Hoeveel goals scoren Ayase Ueda en Ricardo Pepi vandaag tezamen?' },
  { date: '2026-06-27', question: 'Hoeveel goals vallen er vandaag in totaal in het eerste kwartier van alle zes wedstrijden?' },
  { date: '2026-06-28', question: 'Hoeveel goals scoren de acht (groepsfase)landen vandaag tezamen?' },
  { date: '2026-06-29', question: 'Worden er vandaag 4 of minder, of 5 of meer goals gescoord? (incl. verlenging)' },
  { date: '2026-06-30', question: 'Wordt er vandaag een speler uit het veld gestuurd met een rode kaart? (incl. verlenging)' },
  { date: '2026-07-01', question: 'Hoeveel wedstrijden eindigen met een penaltyserie?' },
  { date: '2026-07-02', question: 'Worden er vandaag 5 of minder, of 6 of meer goals gescoord? (incl. verlenging)' },
  { date: '2026-07-03', question: 'Hoeveel wedstrijden gaan een verlenging spelen na 90 minuten?' },
  { date: '2026-07-04', question: 'Worden er vandaag 10 of minder, of 11 of meer goals gescoord? (incl. verlenging)' },
  { date: '2026-07-05', question: 'Hoeveel spelers ontvangen vanavond een gele kaart? (incl. verlenging)' },
  { date: '2026-07-06', question: 'Hoeveel wedstrijden gaan een verlenging spelen na 90 minuten?' },
  { date: '2026-07-07', question: 'Hoeveel wedstrijden eindigen met een penaltyserie?' },
  { date: '2026-07-09', question: 'Worden er vandaag 2 of minder, of 3 of meer goals gescoord? (incl. verlenging)' },
  { date: '2026-07-10', question: 'Hoeveel spelers ontvangen vanavond een gele kaart? (incl. verlenging)' },
  { date: '2026-07-11', question: 'Worden er vanavond meer goals gescoord in de eerste helft of in de tweede helft?' },
  { date: '2026-07-12', question: 'Wordt er gescoord in de eerste 30 minuten van de wedstrijd?' },
  { date: '2026-07-14', question: 'Worden er vandaag 2 of minder, of 3 of meer goals gescoord? (incl. verlenging)' },
  { date: '2026-07-15', question: 'Hoeveel spelers ontvangen vanavond een gele kaart? (incl. verlenging)' },
  { date: '2026-07-18', question: 'Hoeveel goals worden gescoord in de troostfinale? (incl. verlenging)' },
  { date: '2026-07-19', question: 'In welke minuut wordt de eerste goal van de finale gescoord?' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function resetBonus() {
  console.log('🗑️  Verwijder bestaande bonus-antwoorden en vragen...')

  const { error: ansErr } = await supabase.from('bonus_answers').delete().not('id', 'is', null)
  if (ansErr) { console.error('Fout bij verwijderen antwoorden:', ansErr.message); process.exit(1) }

  const { error: qErr } = await supabase.from('bonus_questions').delete().not('id', 'is', null)
  if (qErr) { console.error('Fout bij verwijderen vragen:', qErr.message); process.exit(1) }

  console.log('  ✓ Verwijderd\n')

  // ── Vooraf-vragen ──────────────────────────────────────────────────────────
  console.log('📝 Vooraf-vragen aanmaken...')
  const { error: preErr } = await supabase.from('bonus_questions').insert(
    PRE_TOURNAMENT.map((q) => ({
      question:    q.question,
      description: q.description,
      type:        'pre_tournament',
    }))
  )
  if (preErr) { console.error('Fout bij vooraf-vragen:', preErr.message); process.exit(1) }
  console.log(`  ✓ ${PRE_TOURNAMENT.length} vooraf-vragen aangemaakt\n`)

  // ── Dagelijkse vragen ──────────────────────────────────────────────────────
  console.log('📅 Dagelijkse vragen aanmaken...')
  const { error: dailyErr } = await supabase.from('bonus_questions').insert(
    DAILY.map((q) => ({
      question:    q.question,
      type:        'daily',
      unlock_date: q.date,
    }))
  )
  if (dailyErr) { console.error('Fout bij dagelijkse vragen:', dailyErr.message); process.exit(1) }
  console.log(`  ✓ ${DAILY.length} dagelijkse vragen aangemaakt\n`)

  console.log('✅ Bonus-reset klaar!')
}

resetBonus().catch((e) => { console.error(e); process.exit(1) })
