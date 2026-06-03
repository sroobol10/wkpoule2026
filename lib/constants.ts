// Deadline voor groepsfase voorspellingen: eerste wedstrijd WK 2026
export const GROUP_STAGE_DEADLINE = new Date('2026-06-11T15:00:00Z')

export const STAGE_LABELS: Record<string, string> = {
  group:       'Groepsfase',
  r32:         'Ronde van 32',
  r16:         'Ronde van 16',
  qf:          'Kwartfinale',
  sf:          'Halve finale',
  third_place: 'Troostfinale',
  final:       'Finale',
}

export const SCORING = {
  exactScore:          10,
  correctResult:       5,
  correctPlusOneGoal:  7,
  wrongPlusOneGoal:    2,
  advancement:         5,
  bonusDaily:          2,
  bonusPre:            5,
} as const

// Punten per KO-ronde voor correct voorspeld doorgaand land
export const KO_POINTS: Record<string, number> = {
  r32:         15,
  r16:         25,
  qf:          50,
  sf:          100,
  third_place: 50,
  final:       200,
}
