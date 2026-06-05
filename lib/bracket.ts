// Gedeelde bracket-structuur voor WK 2026 (gebruikt in bracket-client én admin-acties)

export type BracketMatch = {
  slot: number
  stage: string
  homeSeed: string
  awaySeed: string
}

export const BRACKET: BracketMatch[] = [
  // R32
  { slot: 73,  stage: 'r32',         homeSeed: '2A',   awaySeed: '2B'   },
  { slot: 74,  stage: 'r32',         homeSeed: '1E',   awaySeed: '3_74' },
  { slot: 75,  stage: 'r32',         homeSeed: '1F',   awaySeed: '2C'   },
  { slot: 76,  stage: 'r32',         homeSeed: '1C',   awaySeed: '2F'   },
  { slot: 77,  stage: 'r32',         homeSeed: '1I',   awaySeed: '3_77' },
  { slot: 78,  stage: 'r32',         homeSeed: '2E',   awaySeed: '2I'   },
  { slot: 79,  stage: 'r32',         homeSeed: '1A',   awaySeed: '3_79' },
  { slot: 80,  stage: 'r32',         homeSeed: '1L',   awaySeed: '3_80' },
  { slot: 81,  stage: 'r32',         homeSeed: '1D',   awaySeed: '3_81' },
  { slot: 82,  stage: 'r32',         homeSeed: '1G',   awaySeed: '3_82' },
  { slot: 83,  stage: 'r32',         homeSeed: '2K',   awaySeed: '2L'   },
  { slot: 84,  stage: 'r32',         homeSeed: '1H',   awaySeed: '2J'   },
  { slot: 85,  stage: 'r32',         homeSeed: '1B',   awaySeed: '3_85' },
  { slot: 86,  stage: 'r32',         homeSeed: '1J',   awaySeed: '2H'   },
  { slot: 87,  stage: 'r32',         homeSeed: '1K',   awaySeed: '3_87' },
  { slot: 88,  stage: 'r32',         homeSeed: '2D',   awaySeed: '2G'   },
  // R16
  { slot: 89,  stage: 'r16',         homeSeed: 'W74',  awaySeed: 'W77'  },
  { slot: 90,  stage: 'r16',         homeSeed: 'W73',  awaySeed: 'W75'  },
  { slot: 91,  stage: 'r16',         homeSeed: 'W76',  awaySeed: 'W78'  },
  { slot: 92,  stage: 'r16',         homeSeed: 'W79',  awaySeed: 'W80'  },
  { slot: 93,  stage: 'r16',         homeSeed: 'W83',  awaySeed: 'W84'  },
  { slot: 94,  stage: 'r16',         homeSeed: 'W81',  awaySeed: 'W82'  },
  { slot: 95,  stage: 'r16',         homeSeed: 'W86',  awaySeed: 'W88'  },
  { slot: 96,  stage: 'r16',         homeSeed: 'W85',  awaySeed: 'W87'  },
  // QF
  { slot: 97,  stage: 'qf',          homeSeed: 'W89',  awaySeed: 'W90'  },
  { slot: 98,  stage: 'qf',          homeSeed: 'W93',  awaySeed: 'W94'  },
  { slot: 99,  stage: 'qf',          homeSeed: 'W91',  awaySeed: 'W92'  },
  { slot: 100, stage: 'qf',          homeSeed: 'W95',  awaySeed: 'W96'  },
  // SF
  { slot: 101, stage: 'sf',          homeSeed: 'W97',  awaySeed: 'W98'  },
  { slot: 102, stage: 'sf',          homeSeed: 'W99',  awaySeed: 'W100' },
  // 3rd + Final
  { slot: 103, stage: 'third_place', homeSeed: 'L101', awaySeed: 'L102' },
  { slot: 104, stage: 'final',       homeSeed: 'W101', awaySeed: 'W102' },
]

// Annex C: FIFA WC 2026 — alle 495 combinaties van 8 beste nummer-3's
// Kolommen (per teken): slot79(1A) · slot85(1B) · slot81(1D) · slot74(1E) · slot82(1G) · slot77(1I) · slot87(1K) · slot80(1L)
// Bron: FIFA World Cup 26™ Competition Regulations, Annexe C (mei 2026)
const ANNEX_C: string[] = [
  "EJIFHGLK","HGIDJFLK","EJIDHGLK","EJIDHFLK","EGIDJFLK","EGJDHFLK","EGIDHFLK","EGJDHFLI","EGJDHFIK",
  "HGICJFLK","EJICHGLK","EJICHFLK","EGICJFLK","EGJCHFLK","EGICHFLK","EGJCHFLI","EGJCHFIK","HGICJDLK",
  "CJIDHFLK","CGIDJFLK","CGJDHFLK","CGIDHFLK","CGJDHFLI","CGJDHFIK","EJICHDLK","EGICJDLK","EGJCHDLK",
  "EGICHDLK","EGJCHDLI","EGJCHDIK","CJEDIFLK","CJEDHFLK","CEIDHFLK","CJEDHFLI","CJEDHFIK","CGEDJFLK",
  "CGEDIFLK","CGEDJFLI","CGEDJFIK","CGEDHFLK","CGJDHFLE","CGJDHFEK","CGEDHFLI","CGEDHFIK","CGJDHFEI",
  "HJBFIGLK","EJIBHGLK","EJBFIHLK","EJBFIGLK","EJBFHGLK","EGBFIHLK","EJBFHGLI","EJBFHGIK","HJBDIGLK",
  "HJBDIFLK","IGBDJFLK","HGBDJFLK","HGBDIFLK","HGBDJFLI","HGBDJFIK","EJBDIHLK","EJBDIGLK","EJBDHGLK",
  "EGBDIHLK","EJBDHGLI","EJBDHGIK","EJBDIFLK","EJBDHFLK","EIBDHFLK","EJBDHFLI","EJBDHFIK","EGBDJFLK",
  "EGBDIFLK","EGBDJFLI","EGBDJFIK","EGBDHFLK","HGBDJFLE","HGBDJFEK","EGBDHFLI","EGBDHFIK","HGBDJFEI",
  "HJBCIGLK","HJBCIFLK","IGBCJFLK","HGBCJFLK","HGBCIFLK","HGBCJFLI","HGBCJFIK","EJBCIHLK","EJBCIGLK",
  "EJBCHGLK","EGBCIHLK","EJBCHGLI","EJBCHGIK","EJBCIFLK","EJBCHFLK","EIBCHFLK","EJBCHFLI","EJBCHFIK",
  "EGBCJFLK","EGBCIFLK","EGBCJFLI","EGBCJFIK","EGBCHFLK","HGBCJFLE","HGBCJFEK","EGBCHFLI","EGBCHFIK",
  "HGBCJFEI","HJBCIDLK","IGBCJDLK","HGBCJDLK","HGBCIDLK","HGBCJDLI","HGBCJDIK","CJBDIFLK","CJBDHFLK",
  "CIBDHFLK","CJBDHFLI","CJBDHFIK","CGBDJFLK","CGBDIFLK","CGBDJFLI","CGBDJFIK","CGBDHFLK","CGBDHFLJ",
  "HGBCJFDK","CGBDHFLI","CGBDHFIK","HGBCJFDI","EJBCIDLK","EJBCHDLK","EIBCHDLK","EJBCHDLI","EJBCHDIK",
  "EGBCJDLK","EGBCIDLK","EGBCJDLI","EGBCJDIK","EGBCHDLK","HGBCJDLE","HGBCJDEK","EGBCHDLI","EGBCHDIK",
  "HGBCJDEI","CJBDEFLK","CEBDIFLK","CJBDEFLI","CJBDEFIK","CEBDHFLK","CJBDHFLE","CJBDHFEK","CEBDHFLI",
  "CEBDHFIK","CJBDHFEI","CGBDEFLK","CGBDJFLE","CGBDJFEK","CGBDEFLI","CGBDEFIK","CGBDJFEI","CGBDHFLE",
  "CGBDHFEK","HGBCJFDE","CGBDHFEI","HJIFAGLK","EJIAHGLK","EJIFAHLK","EJIFAGLK","EGJFAHLK","EGIFAHLK",
  "EGJFAHLI","EGJFAHIK","HJIDAGLK","HJIDAFLK","IGJDAFLK","HGJDAFLK","HGIDAFLK","HGJDAFLI","HGJDAFIK",
  "EJIDAHLK","EJIDAGLK","EGJDAHLK","EGIDAHLK","EGJDAHLI","EGJDAHIK","EJIDAFLK","HJEDAFLK","HEIDAFLK",
  "HJEDAFLI","HJEDAFIK","EGJDAFLK","EGIDAFLK","EGJDAFLI","EGJDAFIK","HGEDAFLK","HGJDAFLE","HGJDAFEK",
  "HGEDAFLI","HGEDAFIK","HGJDAFEI","HJICAGLK","HJICAFLK","IGJCAFLK","HGJCAFLK","HGICAFLK","HGJCAFLI",
  "HGJCAFIK","EJICAHLK","EJICAGLK","EGJCAHLK","EGICAHLK","EGJCAHLI","EGJCAHIK","EJICAFLK","HJECAFLK",
  "HEICAFLK","HJECAFLI","HJECAFIK","EGJCAFLK","EGICAFLK","EGJCAFLI","EGJCAFIK","HGECAFLK","HGJCAFLE",
  "HGJCAFEK","HGECAFLI","HGECAFIK","HGJCAFEI","HJICADLK","IGJCADLK","HGJCADLK","HGICADLK","HGJCADLI",
  "HGJCADIK","CJIDAFLK","HJFCADLK","HFICADLK","HJFCADLI","HJFCADIK","CGJDAFLK","CGIDAFLK","CGJDAFLI",
  "CGJDAFIK","HGFCADLK","CGJDAFLH","HGJCAFDK","HGFCADLI","HGFCADIK","HGJCAFDI","EJICADLK","HJECADLK",
  "HEICADLK","HJECADLI","HJECADIK","EGJCADLK","EGICADLK","EGJCADLI","EGJCADIK","HGECADLK","HGJCADLE",
  "HGJCADEK","HGECADLI","HGECADIK","HGJCADEI","CJEDAFLK","CEIDAFLK","CJEDAFLI","CJEDAFIK","HEFCADLK",
  "HJFCADLE","HJECAFDK","HEFCADLI","HEFCADIK","HJECAFDI","CGEDAFLK","CGJDAFLE","CGJDAFEK","CGEDAFLI",
  "CGEDAFIK","CGJDAFEI","HGFCADLE","HGECAFDK","HGJCAFDE","HGECAFDI","HJBAIGLK","HJBAIFLK","IJBFAGLK",
  "HJBFAGLK","HGBAIFLK","HJBFAGLI","HJBFAGIK","EJBAIHLK","EJBAIGLK","EJBAHGLK","EGBAIHLK","EJBAHGLI",
  "EJBAHGIK","EJBAIFLK","EJBFAHLK","EIBFAHLK","EJBFAHLI","EJBFAHIK","EJBFAGLK","EGBAIFLK","EJBFAGLI",
  "EJBFAGIK","EGBFAHLK","HJBFAGLE","HJBFAGEK","EGBFAHLI","EGBFAHIK","HJBFAGEI","IJBDAHLK","IJBDAGLK",
  "HJBDAGLK","IGBDAHLK","HJBDAGLI","HJBDAGIK","IJBDAFLK","HJBDAFLK","HIBDAFLK","HJBDAFLI","HJBDAFIK",
  "FJBDAGLK","IGBDAFLK","FJBDAGLI","FJBDAGIK","HGBDAFLK","HGBDAFLJ","HGBDAFJK","HGBDAFLI","HGBDAFIK",
  "HGBDAFIJ","EJBAIDLK","EJBDAHLK","EIBDAHLK","EJBDAHLI","EJBDAHIK","EJBDAGLK","EGBAIDLK","EJBDAGLI",
  "EJBDAGIK","EGBDAHLK","HJBDAGLE","HJBDAGEK","EGBDAHLI","EGBDAHIK","HJBDAGEI","EJBDAFLK","EIBDAFLK",
  "EJBDAFLI","EJBDAFIK","HEBDAFLK","HJBDAFLE","HJBDAFEK","HEBDAFLI","HEBDAFIK","HJBDAFEI","EGBDAFLK",
  "EGBDAFLJ","EGBDAFJK","EGBDAFLI","EGBDAFIK","EGBDAFIJ","HGBDAFLE","HGBDAFEK","HGBDAFEJ","HGBDAFEI",
  "IJBCAHLK","IJBCAGLK","HJBCAGLK","IGBCAHLK","HJBCAGLI","HJBCAGIK","IJBCAFLK","HJBCAFLK","HIBCAFLK",
  "HJBCAFLI","HJBCAFIK","CJBFAGLK","IGBCAFLK","CJBFAGLI","CJBFAGIK","HGBCAFLK","HGBCAFLJ","HGBCAFJK",
  "HGBCAFLI","HGBCAFIK","HGBCAFIJ","EJBAICLK","EJBCAHLK","EIBCAHLK","EJBCAHLI","EJBCAHIK","EJBCAGLK",
  "EGBAICLK","EJBCAGLI","EJBCAGIK","EGBCAHLK","HJBCAGLE","HJBCAGEK","EGBCAHLI","EGBCAHIK","HJBCAGEI",
  "EJBCAFLK","EIBCAFLK","EJBCAFLI","EJBCAFIK","HEBCAFLK","HJBCAFLE","HJBCAFEK","HEBCAFLI","HEBCAFIK",
  "HJBCAFEI","EGBCAFLK","EGBCAFLJ","EGBCAFJK","EGBCAFLI","EGBCAFIK","EGBCAFIJ","HGBCAFLE","HGBCAFEK",
  "HGBCAFEJ","HGBCAFEI","IJBCADLK","HJBCADLK","HIBCADLK","HJBCADLI","HJBCADIK","CJBDAGLK","IGBCADLK",
  "CJBDAGLI","CJBDAGIK","HGBCADLK","HGBCADLJ","HGBCADJK","HGBCADLI","HGBCADIK","HGBCADIJ","CJBDAFLK",
  "CIBDAFLK","CJBDAFLI","CJBDAFIK","HFBCADLK","CJBDAFLH","HJBCAFDK","HFBCADLI","HFBCADIK","HJBCAFDI",
  "CGBDAFLK","CGBDAFLJ","CGBDAFJK","CGBDAFLI","CGBDAFIK","CGBDAFIJ","CGBDAFLH","HGBCAFDK","HGBCAFDJ",
  "HGBCAFDI","EJBCADLK","EIBCADLK","EJBCADLI","EJBCADIK","HEBCADLK","HJBCADLE","HJBCADEK","HEBCADLI",
  "HEBCADIK","HJBCADEI","EGBCADLK","EGBCADLJ","EGBCADJK","EGBCADLI","EGBCADIK","EGBCADIJ","HGBCADLE",
  "HGBCADEK","HGBCADEJ","HGBCADEI","CEBDAFLK","CJBDAFLE","CJBDAFEK","CEBDAFLI","CEBDAFIK","CJBDAFEI",
  "HFBCADLE","HEBCAFDK","HJBCAFDE","HEBCAFDI","CGBDAFLE","CGBDAFEK","CGBDAFEJ","CGBDAFEI","HGBCAFDE",
]

// Slot-volgorde per positie in de rij: pos0→79(1A), pos1→85(1B), pos2→81(1D), pos3→74(1E), pos4→82(1G), pos5→77(1I), pos6→87(1K), pos7→80(1L)
const ANNEX_C_SLOTS = [79, 85, 81, 74, 82, 77, 87, 80]

// Wijs de 8 doorgegane nummers-3-groepen toe aan de slots via de officiële FIFA Annex C tabel
export function assignThirdPlaceSlots(qualifyingGroups: string[]): Record<number, string> {
  const key = [...qualifyingGroups].sort().join('')
  for (const row of ANNEX_C) {
    if ([...row].sort().join('') === key) {
      const result: Record<number, string> = {}
      for (let i = 0; i < 8; i++) result[ANNEX_C_SLOTS[i]] = row[i]
      return result
    }
  }
  // Fallback: mag nooit voorkomen
  return {}
}

// Kickoff-tijden per slot (UTC) — WK 2026 officieel schema
export const KO_KICKOFFS: Record<number, string> = {
  // R32 — 28 juni t/m 1 juli
  73:  '2026-06-28T18:00:00Z',
  74:  '2026-06-28T21:00:00Z',
  75:  '2026-06-29T18:00:00Z',
  76:  '2026-06-29T21:00:00Z',
  77:  '2026-06-30T18:00:00Z',
  78:  '2026-06-30T21:00:00Z',
  79:  '2026-07-01T18:00:00Z',
  80:  '2026-07-01T21:00:00Z',
  81:  '2026-07-02T18:00:00Z',
  82:  '2026-07-02T21:00:00Z',
  83:  '2026-07-03T18:00:00Z',
  84:  '2026-07-03T21:00:00Z',
  85:  '2026-07-04T18:00:00Z',
  86:  '2026-07-04T21:00:00Z',
  87:  '2026-07-05T18:00:00Z',
  88:  '2026-07-05T21:00:00Z',
  // R16 — 7-10 juli
  89:  '2026-07-07T18:00:00Z',
  90:  '2026-07-07T21:00:00Z',
  91:  '2026-07-08T18:00:00Z',
  92:  '2026-07-08T21:00:00Z',
  93:  '2026-07-09T18:00:00Z',
  94:  '2026-07-09T21:00:00Z',
  95:  '2026-07-10T18:00:00Z',
  96:  '2026-07-10T21:00:00Z',
  // KF — 12-13 juli
  97:  '2026-07-12T18:00:00Z',
  98:  '2026-07-12T21:00:00Z',
  99:  '2026-07-13T18:00:00Z',
  100: '2026-07-13T21:00:00Z',
  // HF — 15-16 juli
  101: '2026-07-15T18:00:00Z',
  102: '2026-07-16T18:00:00Z',
  // Troost + Finale
  103: '2026-07-18T15:00:00Z',
  104: '2026-07-19T15:00:00Z',
}
