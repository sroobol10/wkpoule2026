export type PlayerToWatch = {
  name: string
  traits: string[]
}

export type TeamInfo = {
  nameNl: string
  flagCode: string
  ranking: number
  appearances: number
  appearanceYears?: string
  bestFinish: string
  lastAppearance: string
  lastStage: string
  qualification: string
  qualificationRegion: string
  player: PlayerToWatch
}

export type H2HMatch = {
  home: string
  score: string
  away: string
  year: number
  type: string
}

export type GroupStat = {
  value: string   // bijv. "28", "3/4", "2002"
  label: string   // beschrijving van wat het cijfer betekent
}

export type GroupInfo = {
  group: string
  verdict: string
  verdictDesc: string
  stars: number
  teams: TeamInfo[]
  headToHead: H2HMatch[]
  stats: GroupStat[]   // groep-specifieke statistieken met eigen label
}

export const GROUP_DATA: Record<string, GroupInfo> = {
  A: {
    group: 'A',
    verdict: 'VERY TOUGH!',
    verdictDesc:
      'Experience. Speed. Power. Tactics. Anyone can advance. Every match will matter.',
    stars: 4.5,
    stats: [
      { value: '3/4', label: 'Landen bereikten ooit de Ronde van 16 op het WK' },
      { value: '28', label: 'WK-wedstrijden gespeeld door Groep A-landen (historisch)' },
      { value: '6', label: 'WK-doelpunten gescoord door México in 2022 — meest van de groep' },
      { value: '2002', label: 'Zuid-Korea behaalde 4e plek — beste WK-resultaat ooit in Azië' },
    ],
    teams: [
      {
        nameNl: 'México',
        flagCode: 'mx',
        ranking: 15,
        appearances: 17,
        appearanceYears: '1930–2022',
        bestFinish: 'Kwartfinale (1970, 1986)',
        lastAppearance: '2022',
        lastStage: 'R16',
        qualification: 'CONCACAF',
        qualificationRegion: 'N&C-Amerika',
        player: {
          name: 'Raúl Jiménez',
          traits: [
            'Clinical finisher',
            'Aerial threat',
            'Leads the line',
            'Always dangerous in attack',
          ],
        },
      },
      {
        nameNl: 'Zuid-Korea',
        flagCode: 'kr',
        ranking: 23,
        appearances: 11,
        appearanceYears: '1954–2022',
        bestFinish: '4e Plaats (2002)',
        lastAppearance: '2022',
        lastStage: 'R16',
        qualification: 'AFC',
        qualificationRegion: 'Azië',
        player: {
          name: 'Son Heung-Min',
          traits: [
            'World-class forward',
            'Leader',
            'Speed',
            'Clinical finisher',
          ],
        },
      },
      {
        nameNl: 'Zuid-Afrika',
        flagCode: 'za',
        ranking: 59,
        appearances: 3,
        appearanceYears: '1998–2010',
        bestFinish: 'Groepsfase (beste 1990)',
        lastAppearance: '2010',
        lastStage: 'GS',
        qualification: 'CAF',
        qualificationRegion: 'Afrika',
        player: {
          name: 'Lyle Foster',
          traits: [
            'Pace and power',
            'Clinical finisher',
            'A constant threat on the break',
          ],
        },
      },
      {
        nameNl: 'Tsjechië',
        flagCode: 'cz',
        ranking: 36,
        appearances: 10,
        appearanceYears: '1934–2006',
        bestFinish: 'Finalist (1934)',
        lastAppearance: '2006',
        lastStage: 'GS',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Tomáš Souček',
          traits: [
            'Box-to-box engine',
            'Strong',
            'Reliable',
            'Leads by example',
          ],
        },
      },
    ],
    headToHead: [
      { home: 'México', score: '2-1', away: 'Zuid-Korea', year: 2018, type: 'International Friendly' },
      { home: 'México', score: '1-0', away: 'Tsjechië', year: 2017, type: 'International Friendly' },
      { home: 'Zuid-Korea', score: '2-0', away: 'Zuid-Afrika', year: 2010, type: 'FIFA World Cup' },
      { home: 'Zuid-Afrika', score: '1-1', away: 'Tsjechië', year: 2006, type: 'International Friendly' },
    ],
  },

  B: {
    group: 'B',
    verdict: 'VERY TOUGH!',
    verdictDesc:
      'European quality, Asian ambition & North American growth. Anyone can surprise. Every match will matter.',
    stars: 4,
    stats: [
      { value: '2/4', label: 'Landen namen eerder deel aan het WK' },
      { value: '17', label: 'WK-wedstrijden gespeeld door Groep B-landen (historisch)' },
      { value: '4', label: 'WK-doelpunten door Groep B-landen (meest door Canada)' },
      { value: '2022', label: "Qatar's eerste — en tot nu toe enige — WK-deelname" },
    ],
    teams: [
      {
        nameNl: 'Canada',
        flagCode: 'ca',
        ranking: 48,
        appearances: 2,
        appearanceYears: '1986, 2022',
        bestFinish: 'Groepsfase (1986, 2022)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'CONCACAF',
        qualificationRegion: 'N&C-Amerika',
        player: {
          name: 'Alphonso Davies',
          traits: ['Explosive speed', 'Elite left-back', 'Game changer'],
        },
      },
      {
        nameNl: 'Bosnië-Herzegovina',
        flagCode: 'ba',
        ranking: 74,
        appearances: 0,
        bestFinish: '—',
        lastAppearance: '—',
        lastStage: '—',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Edin Džeko',
          traits: ['Legendary striker', 'Clinical finisher', 'Leads by example'],
        },
      },
      {
        nameNl: 'Qatar',
        flagCode: 'qa',
        ranking: 51,
        appearances: 1,
        appearanceYears: '2022',
        bestFinish: 'Groepsfase (2022)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'AFC',
        qualificationRegion: 'Azië',
        player: {
          name: 'Akram Afif',
          traits: ['Creative genius', 'Dribbling threat', 'Match winner'],
        },
      },
      {
        nameNl: 'Zwitserland',
        flagCode: 'ch',
        ranking: 15,
        appearances: 12,
        appearanceYears: '1934–2022',
        bestFinish: 'Kwartfinale (1934, 1938, 1954)',
        lastAppearance: '2022',
        lastStage: 'R16',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Granit Xhaka',
          traits: ['Midfield general', 'Strong & smart', 'Leads the team'],
        },
      },
    ],
    headToHead: [
      { home: 'Canada', score: '2-0', away: 'Qatar', year: 2022, type: 'International Friendly' },
      { home: 'Bosnië-Herzegovina', score: '0-1', away: 'Zwitserland', year: 2018, type: 'International Friendly' },
      { home: 'Bosnië-Herzegovina', score: '2-1', away: 'Qatar', year: 2010, type: 'International Friendly' },
    ],
  },

  C: {
    group: 'C',
    verdict: 'VERY TOUGH!',
    verdictDesc:
      'A blend of power, passion & potential. Anyone can beat anyone. Expect drama. Expect surprises. Every match will matter.',
    stars: 4.5,
    stats: [
      { value: '2/4', label: 'Landen bereikten ooit de Ronde van 16' },
      { value: '15', label: 'WK-wedstrijden gespeeld door Groep C-landen (historisch)' },
      { value: '21', label: 'WK-doelpunten gescoord door alle Groep C-landen (historisch)' },
      { value: '2002', label: "Brazilië's laatste WK-titel — 5-voudig wereldkampioen" },
    ],
    teams: [
      {
        nameNl: 'Brazilië',
        flagCode: 'br',
        ranking: 3,
        appearances: 22,
        appearanceYears: '1930–2022',
        bestFinish: 'Kampioen (1958, 1962, 1970, 1994, 2002)',
        lastAppearance: '2022',
        lastStage: 'QF',
        qualification: 'CONMEBOL',
        qualificationRegion: 'Zuid-Amerika',
        player: {
          name: 'Neymar Jr.',
          traits: ['Magic on the ball', 'Unpredictable', 'Match-winner every time'],
        },
      },
      {
        nameNl: 'Marokko',
        flagCode: 'ma',
        ranking: 12,
        appearances: 6,
        appearanceYears: '1970–1998',
        bestFinish: 'Ronde van 16 (1986)',
        lastAppearance: '1998',
        lastStage: 'GS',
        qualification: 'CAF',
        qualificationRegion: 'Afrika',
        player: {
          name: 'Achraf Hakimi',
          traits: ['Lightning pace', 'Elite defender', 'Danger going forward'],
        },
      },
      {
        nameNl: 'Schotland',
        flagCode: 'gb-sct',
        ranking: 39,
        appearances: 9,
        appearanceYears: '1954–1998',
        bestFinish: 'Groepsfase (beste 1990)',
        lastAppearance: '1998',
        lastStage: 'GS',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Andrew Robertson',
          traits: ['Relentless drive', 'World-class left-back', 'Leads by example'],
        },
      },
      {
        nameNl: 'Haïti',
        flagCode: 'ht',
        ranking: 83,
        appearances: 1,
        appearanceYears: '1974',
        bestFinish: 'Groepsfase (1974)',
        lastAppearance: '1974',
        lastStage: 'GS',
        qualification: 'CONCACAF',
        qualificationRegion: 'N&C-Amerika',
        player: {
          name: 'Duckens Nazon',
          traits: ['Explosive forward', 'Strong presence', 'Leads the line'],
        },
      },
    ],
    headToHead: [
      { home: 'Brazilië', score: '3-1', away: 'Schotland', year: 1998, type: 'FIFA World Cup' },
      { home: 'Marokko', score: '2-0', away: 'Schotland', year: 2013, type: 'International Friendly' },
      { home: 'Brazilië', score: '7-1', away: 'Haïti', year: 2010, type: 'International Friendly' },
      { home: 'Marokko', score: '4-1', away: 'Haïti', year: 2016, type: 'International Friendly' },
    ],
  },

  D: {
    group: 'D',
    verdict: 'TOUGH!',
    verdictDesc:
      'Highly competitive group with quality, experience and physicality. Anyone can challenge. Every match will matter.',
    stars: 4,
    stats: [
      { value: '2/4', label: 'Landen bereikten de Ronde van 16 (VS & Australië)' },
      { value: '26', label: 'WK-wedstrijden gespeeld door Groep D-landen (historisch)' },
      { value: '35', label: 'WK-doelpunten gescoord door alle Groep D-landen (historisch)' },
      { value: '2002', label: "Turkije's beste WK-prestatie: 3e plek" },
    ],
    teams: [
      {
        nameNl: 'Verenigde Staten',
        flagCode: 'us',
        ranking: 11,
        appearances: 12,
        appearanceYears: '1930–2026',
        bestFinish: '3e Plaats (1930)',
        lastAppearance: '2022',
        lastStage: 'R16',
        qualification: 'CONCACAF',
        qualificationRegion: 'N&C-Amerika',
        player: {
          name: 'Christian Pulisic',
          traits: ['Creative', 'Fast', 'Game changer', 'Leads by example'],
        },
      },
      {
        nameNl: 'Paraguay',
        flagCode: 'py',
        ranking: 56,
        appearances: 9,
        appearanceYears: '1930–2026',
        bestFinish: 'Kwartfinale (2010)',
        lastAppearance: '2014',
        lastStage: 'GS',
        qualification: 'CONMEBOL',
        qualificationRegion: 'Zuid-Amerika',
        player: {
          name: 'Gustavo Gómez',
          traits: ['Rock in defence', 'Aerial threat', 'Strong leader', 'Warrior'],
        },
      },
      {
        nameNl: 'Australië',
        flagCode: 'au',
        ranking: 23,
        appearances: 7,
        appearanceYears: '1974–2026',
        bestFinish: 'Ronde van 16 (2006, 2022)',
        lastAppearance: '2022',
        lastStage: 'R16',
        qualification: 'AFC',
        qualificationRegion: 'Azië',
        player: {
          name: 'Nestory Irankunda',
          traits: ['Explosive pace', 'Fearless dribbler', 'Bright future', 'Exciting talent'],
        },
      },
      {
        nameNl: 'Turkije',
        flagCode: 'tr',
        ranking: 28,
        appearances: 3,
        appearanceYears: '1954–2026',
        bestFinish: '3e Plaats (2002)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Hakan Çalhanoğlu',
          traits: [
            'World-class passer',
            'Dead-ball specialist',
            'Controls the game',
            'Big-match player',
          ],
        },
      },
    ],
    headToHead: [
      { home: 'Verenigde Staten', score: '1-1', away: 'Turkije', year: 2022, type: 'International Friendly' },
      { home: 'Australië', score: '1-0', away: 'Paraguay', year: 2022, type: 'International Friendly' },
      { home: 'Verenigde Staten', score: '4-0', away: 'Paraguay', year: 2015, type: 'International Friendly' },
      { home: 'Australië', score: '0-0', away: 'Turkije', year: 2018, type: 'International Friendly' },
    ],
  },

  E: {
    group: 'E',
    verdict: 'TOUGH!',
    verdictDesc:
      'A highly competitive group with physicality, experience and physicality. Anyone can challenge. Every match will matter.',
    stars: 4,
    stats: [
      { value: '1/4', label: 'Land bereikte de Ronde van 16 (Duitsland)' },
      { value: '26', label: 'WK-wedstrijden gespeeld door Groep E-landen (historisch)' },
      { value: '36', label: 'WK-doelpunten gescoord door alle Groep E-landen (historisch)' },
      { value: '2026', label: "Curaçao maakt zijn historisch WK-debuut!" },
    ],
    teams: [
      {
        nameNl: 'Duitsland',
        flagCode: 'de',
        ranking: 16,
        appearances: 21,
        appearanceYears: '1934–2026',
        bestFinish: 'Kampioen (1954, 1974, 1990, 2014)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Jamal Musiala',
          traits: ['Creative genius', 'Dribbling wizard', 'Game changer in tight spaces'],
        },
      },
      {
        nameNl: 'Curaçao',
        flagCode: 'cw',
        ranking: 82,
        appearances: 1,
        appearanceYears: '2026',
        bestFinish: '— (historic debut 2026)',
        lastAppearance: '—',
        lastStage: '—',
        qualification: 'CONCACAF',
        qualificationRegion: 'N&C-Amerika',
        player: {
          name: 'Leandro Bacuna',
          traits: ['Experienced leader', 'Set-piece threat', 'Controls the midfield'],
        },
      },
      {
        nameNl: 'Ivoorkust',
        flagCode: 'ci',
        ranking: 41,
        appearances: 4,
        appearanceYears: '2006–2026',
        bestFinish: 'Groepsfase',
        lastAppearance: '2014',
        lastStage: 'GS',
        qualification: 'CAF',
        qualificationRegion: 'Afrika',
        player: {
          name: 'Sébastien Haller',
          traits: ['Powerful striker', 'Aerial threat', 'Clinical finisher in the box'],
        },
      },
      {
        nameNl: 'Ecuador',
        flagCode: 'ec',
        ranking: 27,
        appearances: 5,
        appearanceYears: '2002–2026',
        bestFinish: 'Ronde van 16 (2006)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'CONMEBOL',
        qualificationRegion: 'Zuid-Amerika',
        player: {
          name: 'Moisés Caicedo',
          traits: ['Midfield dynamo', 'Work rate monster', 'Breaks lines', 'Builds attacks'],
        },
      },
    ],
    headToHead: [
      { home: 'Duitsland', score: '3-0', away: 'Ecuador', year: 2014, type: 'FIFA World Cup' },
      { home: 'Ivoorkust', score: '3-1', away: 'Curaçao', year: 2017, type: 'International Friendly' },
      { home: 'Duitsland', score: '3-0', away: 'Ivoorkust', year: 2010, type: 'FIFA World Cup' },
      { home: 'Ecuador', score: '4-0', away: 'Curaçao', year: 2022, type: 'International Friendly' },
    ],
  },

  F: {
    group: 'F',
    verdict: 'TOUGH!',
    verdictDesc:
      'A highly competitive group with quality, experience and talent in every team. Anyone can challenge. Every match will matter.',
    stars: 4,
    stats: [
      { value: '1/4', label: 'Land bereikte de Halve Finale (Nederland)' },
      { value: '24', label: 'WK-wedstrijden gespeeld door Groep F-landen (historisch)' },
      { value: '38', label: 'WK-doelpunten gescoord door alle Groep F-landen (historisch)' },
      { value: '2010', label: "Nederland's laatste WK-finale-optreden" },
    ],
    teams: [
      {
        nameNl: 'Nederland',
        flagCode: 'nl',
        ranking: 7,
        appearances: 12,
        appearanceYears: '1934–2026',
        bestFinish: 'Finalist (1974, 1978, 2010)',
        lastAppearance: '2022',
        lastStage: 'QF',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Virgil van Dijk',
          traits: [
            'World-class defender',
            'Leads by example',
            'Strong in the air',
            'A true leader',
          ],
        },
      },
      {
        nameNl: 'Japan',
        flagCode: 'jp',
        ranking: 17,
        appearances: 8,
        appearanceYears: '1998–2026',
        bestFinish: 'Ronde van 16 (2002, 2010, 2018)',
        lastAppearance: '2022',
        lastStage: 'R16',
        qualification: 'AFC',
        qualificationRegion: 'Azië',
        player: {
          name: 'Kaoru Mitoma',
          traits: ['Dynamic winger', 'Fast and skillful', 'Creates chances', 'A constant threat'],
        },
      },
      {
        nameNl: 'Tunesië',
        flagCode: 'tn',
        ranking: 30,
        appearances: 7,
        appearanceYears: '1978–2026',
        bestFinish: 'Groepsfase',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'CAF',
        qualificationRegion: 'Afrika',
        player: {
          name: 'Ellyes Skhiri',
          traits: ['Midfield engine', 'Great passer', 'Controls the tempo', 'Tactical leader'],
        },
      },
      {
        nameNl: 'Zweden',
        flagCode: 'se',
        ranking: 21,
        appearances: 13,
        appearanceYears: '1934–2026',
        bestFinish: 'Finalist (1958)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Alexander Isak',
          traits: [
            'Clinical finisher',
            'Explosive pace',
            'Technical striker',
            'Match winner',
          ],
        },
      },
    ],
    headToHead: [
      { home: 'Nederland', score: '2-1', away: 'Japan', year: 2023, type: 'International Friendly' },
      { home: 'Zweden', score: '1-0', away: 'Tunesië', year: 2005, type: 'International Friendly' },
      { home: 'Nederland', score: '4-1', away: 'Tunesië', year: 2018, type: 'International Friendly' },
      { home: 'Japan', score: '0-2', away: 'Zweden', year: 2012, type: 'International Friendly' },
    ],
  },

  G: {
    group: 'G',
    verdict: 'TOUGH!',
    verdictDesc:
      'A physical and tactical group with world-class talent. Every match could be a battle.',
    stars: 4,
    stats: [
      { value: '1/4', label: 'Land bereikte de Halve Finale (België)' },
      { value: '22', label: 'WK-wedstrijden gespeeld door Groep G-landen (historisch)' },
      { value: '29', label: 'WK-doelpunten gescoord door alle Groep G-landen (historisch)' },
      { value: '2018', label: "België's beste WK-prestatie: 3e plek" },
    ],
    teams: [
      {
        nameNl: 'België',
        flagCode: 'be',
        ranking: 3,
        appearances: 15,
        appearanceYears: '1930–2026',
        bestFinish: '3e Plaats (2018)',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'UEFA',
        qualificationRegion: 'Europa',
        player: {
          name: 'Romelu Lukaku',
          traits: ['Powerful striker', 'Clinical finisher', 'Leads the line', 'Big-match player'],
        },
      },
      {
        nameNl: 'Iran',
        flagCode: 'ir',
        ranking: 20,
        appearances: 7,
        appearanceYears: '1978–2026',
        bestFinish: 'Groepsfase',
        lastAppearance: '2022',
        lastStage: 'GS',
        qualification: 'AFC',
        qualificationRegion: 'Azië',
        player: {
          name: 'Mehdi Taremi',
          traits: ['Goal machine', 'Strong in the air', 'Creates chances', 'Always dangerous'],
        },
      },
      {
        nameNl: 'Egypte',
        flagCode: 'eg',
        ranking: 33,
        appearances: 4,
        appearanceYears: '1934–2026',
        bestFinish: 'Groepsfase',
        lastAppearance: '2018',
        lastStage: 'GS',
        qualification: 'CAF',
        qualificationRegion: 'Afrika',
        player: {
          name: 'Mohamed Salah',
          traits: [
            'Explosive winger',
            'Dribbling wizard',
            'Decisive in attack',
            'Match-winner',
          ],
        },
      },
      {
        nameNl: 'Nieuw-Zeeland',
        flagCode: 'nz',
        ranking: 89,
        appearances: 3,
        appearanceYears: '1934–2026',
        bestFinish: 'Groepsfase',
        lastAppearance: '2010',
        lastStage: 'GS',
        qualification: 'OFC',
        qualificationRegion: 'Oceanië',
        player: {
          name: 'Chris Wood',
          traits: ['Target man', 'Strong and physical', 'Leads the attack', 'Clinical finisher'],
        },
      },
    ],
    headToHead: [
      { home: 'België', score: '3-0', away: 'Egypte', year: 2018, type: 'International Friendly' },
      { home: 'Iran', score: '1-0', away: 'Nieuw-Zeeland', year: 2017, type: 'International Friendly' },
      { home: 'België', score: '2-1', away: 'Iran', year: 2022, type: 'International Friendly' },
      { home: 'Egypte', score: '1-1', away: 'Nieuw-Zeeland', year: 2010, type: 'FIFA World Cup' },
    ],
  },
}

export const FLAG_CODES: Record<string, string> = {
  México: 'mx',
  'Zuid-Korea': 'kr',
  'Zuid-Afrika': 'za',
  Tsjechië: 'cz',
  Canada: 'ca',
  'Bosnië-Herzegovina': 'ba',
  Qatar: 'qa',
  Zwitserland: 'ch',
  Brazilië: 'br',
  Marokko: 'ma',
  Schotland: 'gb-sct',
  Haïti: 'ht',
  'Verenigde Staten': 'us',
  Paraguay: 'py',
  Australië: 'au',
  Turkije: 'tr',
  Duitsland: 'de',
  Curaçao: 'cw',
  Ivoorkust: 'ci',
  Ecuador: 'ec',
  Nederland: 'nl',
  Japan: 'jp',
  Tunesië: 'tn',
  Zweden: 'se',
  België: 'be',
  Iran: 'ir',
  Egypte: 'eg',
  'Nieuw-Zeeland': 'nz',
}
