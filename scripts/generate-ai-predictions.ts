/**
 * WK Poule 2026 — AI voorspellingen genereren via Anthropic API
 *
 * Gebruikt echte teamdata (sterke/zwakke punten, FIFA-ranking, spelers) als context
 * voor rijkere, onderbouwde analyses per wedstrijd.
 *
 * Vereiste env vars in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *
 * Gebruik:
 *   npx tsx --env-file=.env.local scripts/generate-ai-predictions.ts
 *
 * Opties:
 *   --dry-run    Genereer maar sla niet op in DB
 *   --group=A    Genereer alleen voor groep A (of B, C, etc.)
 *   --overwrite  Overschrijf bestaande analyses (standaard: sla bestaande over)
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { profiles, NL_TO_FOLDER } from '../lib/team-profiles'
import type { TeamProfile } from '../lib/team-profiles'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (!url || !key) {
  console.error('Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!anthropicKey) {
  console.error('Ontbrekende env var: ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  realtime: { transport: ws as unknown as typeof WebSocket },
})

const anthropic = new Anthropic({ apiKey: anthropicKey })

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const overwrite = args.includes('--overwrite')
const groupFilter = args.find(a => a.startsWith('--group='))?.split('=')[1]?.toUpperCase()

// Dutch DB name → folder name
function getFolderName(dutchName: string): string | null {
  return NL_TO_FOLDER[dutchName] ?? null
}

function getProfile(dutchName: string): TeamProfile | null {
  const folder = getFolderName(dutchName)
  if (!folder) return null
  return (profiles as Record<string, TeamProfile>)[folder] ?? null
}

function buildTeamContext(name: string, profile: TeamProfile | null): string {
  if (!profile) return `Team: ${name} (geen profieldata beschikbaar)`

  const player = profile.playerToWatchData
  const playerInfo = player
    ? `Speler om op te letten: ${player.name} (${player.position}, ${player.club})
       Bio: ${player.bio.slice(0, 400)}...`
    : `Speler om op te letten: ${profile.playerToWatch}`

  return `
Team: ${name}
FIFA-ranking: ${profile.fifaRanking ?? 'onbekend'}
Coach: ${profile.coach}
Groep: ${profile.group}

Sterke punten: ${profile.strengths}

Zwakke punten: ${profile.weaknesses}

Teamprofiel: ${profile.bio.slice(0, 500)}

${playerInfo}
`.trim()
}

type GeneratedPrediction = {
  homeScore: number
  awayScore: number
  analyse: string
  sleutelspelerThuis: string
  sleutelspelerUit: string
  kansThuis: number
  kansGelijkspel: number
  kansUit: number
}

async function generatePrediction(
  homeName: string,
  awayName: string,
  homeProfile: TeamProfile | null,
  awayProfile: TeamProfile | null,
): Promise<GeneratedPrediction> {
  const homeContext = buildTeamContext(homeName, homeProfile)
  const awayContext = buildTeamContext(awayName, awayProfile)

  const prompt = `Je bent een voetbalanalist die een WK 2026 groepswedstrijd analyseert.

THUISTEAM:
${homeContext}

UITTEAM:
${awayContext}

Analyseer deze wedstrijd en geef een voorspelling. Schrijf in het Nederlands.

Geef je antwoord UITSLUITEND als geldig JSON (geen markdown, geen tekst eromheen):
{
  "homeScore": <geheel getal 0-6>,
  "awayScore": <geheel getal 0-6>,
  "analyse": "<2-3 zinnen analyse, max 300 tekens, focus op sterktes/zwaktes en de verwachte uitkomst>",
  "sleutelspelerThuis": "<naam van de speler om op te letten + korte reden, max 100 tekens>",
  "sleutelspelerUit": "<naam van de speler om op te letten + korte reden, max 100 tekens>",
  "kansThuis": <integer 0-100>,
  "kansGelijkspel": <integer 0-100>,
  "kansUit": <integer 0-100>
}

De drie kansen moeten optellen tot precies 100.
Gebruik de echte "speler om op te letten" uit de teamprofielen als sleutelspeler.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`Geen JSON in respons: ${text.slice(0, 200)}`)

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedPrediction

  // Normaliseer kansen zodat ze exact 100 zijn
  const total = parsed.kansThuis + parsed.kansGelijkspel + parsed.kansUit
  if (total !== 100) {
    parsed.kansUit = 100 - parsed.kansThuis - parsed.kansGelijkspel
  }

  return parsed
}

async function main() {
  console.log(`⚡ AI voorspellingen genereren${isDryRun ? ' (dry run)' : ''}${groupFilter ? ` voor groep ${groupFilter}` : ''}\n`)

  // Haal alle groepswedstrijden op
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matches, error } = await (supabase as any)
    .from('matches')
    .select(`
      id,
      home_team:teams!matches_home_team_id_fkey ( name, group_name ),
      away_team:teams!matches_away_team_id_fkey ( name, group_name )
    `)
    .eq('stage', 'group')

  if (error || !matches) {
    console.error('Fout bij ophalen wedstrijden:', error?.message)
    process.exit(1)
  }

  // Haal bestaande voorspellingen op (om te kunnen overslaan)
  let existingIds = new Set<string>()
  if (!overwrite) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('match_ai_predictions')
      .select('match_id')
    existingIds = new Set((existing ?? []).map((r: { match_id: string }) => r.match_id))
  }

  let generated = 0
  let skipped = 0
  let errors = 0

  for (const m of matches) {
    const homeNl = (m.home_team as { name: string } | null)?.name ?? ''
    const awayNl = (m.away_team as { name: string } | null)?.name ?? ''
    const group = (m.home_team as { group_name: string } | null)?.group_name ?? ''

    if (groupFilter && group !== groupFilter) continue
    if (!overwrite && existingIds.has(m.id)) {
      console.log(`  ↷ ${homeNl} vs ${awayNl} (bestaande analyse overgeslagen)`)
      skipped++
      continue
    }

    const homeProfile = getProfile(homeNl)
    const awayProfile = getProfile(awayNl)

    if (!homeProfile || !awayProfile) {
      console.warn(`  ⚠ Geen profiel voor: ${homeNl} of ${awayNl}`)
    }

    console.log(`  ⚡ ${homeNl} vs ${awayNl}...`)

    try {
      const pred = await generatePrediction(homeNl, awayNl, homeProfile, awayProfile)

      if (isDryRun) {
        console.log(`    → ${pred.homeScore}–${pred.awayScore} | thuis ${pred.kansThuis}% gelijk ${pred.kansGelijkspel}% uit ${pred.kansUit}%`)
        console.log(`    Analyse: ${pred.analyse.slice(0, 80)}...`)
        generated++
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upsertError } = await (supabase as any)
        .from('match_ai_predictions')
        .upsert({
          match_id:            m.id,
          home_score:          pred.homeScore,
          away_score:          pred.awayScore,
          match_analyse:       pred.analyse,
          sleutelspeler_thuis: pred.sleutelspelerThuis,
          sleutelspeler_uit:   pred.sleutelspelerUit,
          kans_thuis:          pred.kansThuis,
          kans_gelijkspel:     pred.kansGelijkspel,
          kans_uit:            pred.kansUit,
        }, { onConflict: 'match_id' })

      if (upsertError) {
        console.error(`    ✗ DB-fout: ${upsertError.message}`)
        errors++
      } else {
        console.log(`    ✓ ${pred.homeScore}–${pred.awayScore}`)
        generated++
      }

      // Kleine pauze om rate limits te vermijden
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`    ✗ Fout: ${(err as Error).message}`)
      errors++
    }
  }

  console.log(`\n✅ Klaar: ${generated} gegenereerd, ${skipped} overgeslagen, ${errors} fouten`)
}

main().catch(console.error)
