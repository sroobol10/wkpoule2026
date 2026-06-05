/**
 * Parseert de teams MD-bestanden uit de /teams folder naar data/team-profiles.json
 *
 * Gebruik:
 *   npx tsx scripts/parse-team-data.ts [teams-folder-path]
 *
 * Standaard leest van: ~/Downloads/teams
 * Output: data/team-profiles.json
 */

import fs from 'fs'
import path from 'path'

const TEAMS_SOURCE = process.argv[2] ?? path.join(process.env.HOME ?? '', 'Downloads', 'teams')
const OUTPUT = path.join(__dirname, '..', 'data', 'team-profiles.json')

type PlayerProfile = {
  name: string
  image: string
  club: string
  position: string
  dateOfBirth: string
  bio: string
}

type TeamProfile = {
  folderName: string
  group: string
  fifaRanking: number | null
  coach: string
  playerToWatch: string
  playerToWatchData: PlayerProfile | null
  strengths: string
  weaknesses: string
  bio: string
}

function parseTableValue(md: string, key: string): string {
  const re = new RegExp(`\\|\\s*\\*\\*${key}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, 'i')
  const m = md.match(re)
  return m ? m[1].trim() : ''
}

function parseSection(md: string, heading: string): string {
  const re = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i')
  const m = md.match(re)
  return m ? m[1].trim() : ''
}

function parsePlayerFile(playerMd: string): Omit<PlayerProfile, 'name'> {
  const imageMatch = playerMd.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/)
  const image = imageMatch ? imageMatch[1] : ''
  const club = parseTableValue(playerMd, 'Club')
  const position = parseTableValue(playerMd, 'Position')
  const dateOfBirth = parseTableValue(playerMd, 'Date of birth')
  const bio = parseSection(playerMd, 'Bio')
  return { image, club, position, dateOfBirth, bio }
}

function findPlayerFile(teamDir: string, playerName: string): string | null {
  const playersDir = path.join(teamDir, 'players')
  if (!fs.existsSync(playersDir)) return null

  // Normalize name for matching (lowercase, remove accents via simple replacements)
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[áàãâä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòõôö]/g, 'o')
      .replace(/[úùûü]/g, 'u')
      .replace(/[ý]/g, 'y')
      .replace(/[ñ]/g, 'n')
      .replace(/[ç]/g, 'c')
      .replace(/[ř]/g, 'r')
      .replace(/[š]/g, 's')
      .replace(/[ž]/g, 'z')
      .replace(/[č]/g, 'c')
      .replace(/[ě]/g, 'e')
      .replace(/[ů]/g, 'u')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

  const normalizedName = normalize(playerName)

  for (const file of fs.readdirSync(playersDir)) {
    if (!file.endsWith('.md')) continue
    const fileBase = file.replace(/^\d+-/, '').replace('.md', '')
    if (fileBase === normalizedName || normalize(fileBase) === normalizedName) {
      return path.join(playersDir, file)
    }
  }
  return null
}

function parseTeam(groupDir: string, teamFolder: string, group: string): TeamProfile {
  const teamDir = path.join(groupDir, teamFolder)
  const teamMdPath = path.join(teamDir, 'team.md')

  if (!fs.existsSync(teamMdPath)) {
    console.warn(`  ⚠ Geen team.md voor ${teamFolder}`)
    return {
      folderName: teamFolder,
      group,
      fifaRanking: null,
      coach: '',
      playerToWatch: '',
      playerToWatchData: null,
      strengths: '',
      weaknesses: '',
      bio: '',
    }
  }

  const md = fs.readFileSync(teamMdPath, 'utf-8')

  const fifaStr = parseTableValue(md, 'FIFA ranking')
  const fifaRanking = fifaStr && fifaStr !== '—' ? parseInt(fifaStr, 10) : null
  const coach = parseTableValue(md, 'Coach')
  const playerToWatch = parseTableValue(md, 'Player to watch')
  const strengths = parseSection(md, 'Strengths')
  const weaknesses = parseSection(md, 'Weaknesses')
  const bio = parseSection(md, 'Bio')

  let playerToWatchData: PlayerProfile | null = null
  if (playerToWatch && playerToWatch !== '—') {
    const playerFile = findPlayerFile(teamDir, playerToWatch)
    if (playerFile) {
      const playerMd = fs.readFileSync(playerFile, 'utf-8')
      playerToWatchData = { name: playerToWatch, ...parsePlayerFile(playerMd) }
    } else {
      console.warn(`  ⚠ Spelerbestand niet gevonden voor: ${playerToWatch} (${teamFolder})`)
    }
  }

  return {
    folderName: teamFolder,
    group,
    fifaRanking,
    coach,
    playerToWatch,
    playerToWatchData,
    strengths,
    weaknesses,
    bio,
  }
}

function main() {
  if (!fs.existsSync(TEAMS_SOURCE)) {
    console.error(`Teams folder niet gevonden: ${TEAMS_SOURCE}`)
    console.error('Geef het pad mee als argument: npx tsx scripts/parse-team-data.ts /path/to/teams')
    process.exit(1)
  }

  console.log(`📂 Parsen uit: ${TEAMS_SOURCE}`)

  const profiles: Record<string, TeamProfile> = {}
  let teamCount = 0

  const groupDirs = fs.readdirSync(TEAMS_SOURCE).filter(d =>
    d.startsWith('Group-') && fs.statSync(path.join(TEAMS_SOURCE, d)).isDirectory()
  ).sort()

  for (const groupDir of groupDirs) {
    const group = groupDir.replace('Group-', '')
    const groupPath = path.join(TEAMS_SOURCE, groupDir)
    const teamFolders = fs.readdirSync(groupPath).filter(d =>
      fs.statSync(path.join(groupPath, d)).isDirectory()
    )

    for (const teamFolder of teamFolders) {
      console.log(`  Groep ${group}: ${teamFolder}`)
      const profile = parseTeam(groupPath, teamFolder, group)
      profiles[teamFolder] = profile
      teamCount++
    }
  }

  const outputDir = path.dirname(OUTPUT)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  fs.writeFileSync(OUTPUT, JSON.stringify(profiles, null, 2), 'utf-8')

  console.log(`\n✅ ${teamCount} teams geparseerd → ${OUTPUT}`)
}

main()
