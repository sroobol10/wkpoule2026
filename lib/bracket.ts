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

// Welke groepen mogen de #3-plek in welke slot invullen
export const THIRD_SLOT_GROUPS: Record<number, string[]> = {
  74: ['A', 'B', 'C', 'D', 'F'],
  77: ['C', 'D', 'F', 'G', 'H'],
  79: ['C', 'E', 'F', 'H', 'I'],
  80: ['E', 'H', 'I', 'J', 'K'],
  81: ['B', 'E', 'F', 'I', 'J'],
  82: ['A', 'E', 'H', 'I', 'J'],
  85: ['E', 'F', 'G', 'I', 'J'],
  87: ['D', 'E', 'I', 'J', 'L'],
}

// Backtracking: wijs 8 doorgegane nummers-3-groepen toe aan de 8 derde-plek-slots
export function assignThirdPlaceSlots(qualifyingGroups: string[]): Record<number, string> {
  const slots = [74, 77, 79, 80, 81, 82, 85, 87]
  const result: Record<number, string> = {}
  const used = new Set<string>()

  function bt(idx: number): boolean {
    if (idx === slots.length) return true
    const slot = slots[idx]
    const valid = THIRD_SLOT_GROUPS[slot]
    for (const g of qualifyingGroups) {
      if (!used.has(g) && valid.includes(g)) {
        result[slot] = g
        used.add(g)
        if (bt(idx + 1)) return true
        delete result[slot]
        used.delete(g)
      }
    }
    return false
  }

  bt(0)
  return result
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
