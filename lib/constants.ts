// Deadline voor groepsfase voorspellingen: eerste wedstrijd WK 2026
export const GROUP_STAGE_DEADLINE = new Date('2026-06-11T15:00:00Z')

export const STAGE_LABELS: Record<string, string> = {
  group: 'Groepsfase',
  r32:   'Ronde van 32',
  r16:   'Ronde van 16',
  qf:    'Kwartfinale',
  sf:    'Halve finale',
  final: 'Finale',
}

export const SCORING = {
  exactScore:    5,
  correctResult: 2,
  advancement:   1,
  knockout:      3,
  bonusDaily:    2,
  bonusPre:      5,
} as const
