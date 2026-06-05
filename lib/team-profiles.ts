import profilesJson from '@/data/team-profiles.json'

export type PlayerProfile = {
  name: string
  image: string
  club: string
  position: string
  dateOfBirth: string
  bio: string
}

export type TeamProfile = {
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

const profiles = profilesJson as Record<string, TeamProfile>

// Dutch DB team name → folder name in data/team-profiles.json
const NL_TO_FOLDER: Record<string, string> = {
  'Mexico':               'Mexico',
  'Zuid-Afrika':          'South-Africa',
  'Zuid-Korea':           'South-Korea',
  'Tsjechië':             'Czechia',
  'Canada':               'Canada',
  'Bosnië-Herzegovina':   'Bosnia-and-Herzegovina',
  'Qatar':                'Qatar',
  'Zwitserland':          'Switzerland',
  'Brazilië':             'Brazil',
  'Marokko':              'Morocco',
  'Haïti':                'Haiti',
  'Schotland':            'Scotland',
  'Verenigde Staten':     'USA',
  'Paraguay':             'Paraguay',
  'Australië':            'Australia',
  'Turkije':              'Turkey',
  'Duitsland':            'Germany',
  'Curaçao':              'Curacao',
  'Ivoorkust':            'Cote-dIvoire',
  'Ecuador':              'Ecuador',
  'Nederland':            'Netherlands',
  'Japan':                'Japan',
  'Zweden':               'Sweden',
  'Tunesië':              'Tunisia',
  'België':               'Belgium',
  'Egypte':               'Egypt',
  'Iran':                 'Iran',
  'Nieuw-Zeeland':        'New-Zealand',
  'Spanje':               'Spain',
  'Kaapverdië':           'Cape-Verde',
  'Saudi-Arabië':         'Saudi-Arabia',
  'Uruguay':              'Uruguay',
  'Frankrijk':            'France',
  'Senegal':              'Senegal',
  'Irak':                 'Iraq',
  'Noorwegen':            'Norway',
  'Argentinië':           'Argentina',
  'Algerije':             'Algeria',
  'Oostenrijk':           'Austria',
  'Jordanië':             'Jordan',
  'Portugal':             'Portugal',
  'DR Congo':             'DR-Congo',
  'Oezbekistan':          'Uzbekistan',
  'Colombia':             'Colombia',
  'Engeland':             'England',
  'Kroatië':              'Croatia',
  'Ghana':                'Ghana',
  'Panama':               'Panama',
}

export function getTeamProfile(dutchName: string): TeamProfile | null {
  const folder = NL_TO_FOLDER[dutchName]
  if (!folder) return null
  return profiles[folder] ?? null
}

// For the AI generation script (uses English folder names directly)
export function getTeamProfileByFolder(folderName: string): TeamProfile | null {
  return profiles[folderName] ?? null
}

export { profiles, NL_TO_FOLDER }
