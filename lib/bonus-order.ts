// Vaste volgorde van de algemene (pre-tournament) bonusvragen, zoals op de
// bonusvragenpagina: startend met topscorer, eindigend met kaartenkoning.
export const PRE_BONUS_ORDER = [
  'Topscorer',
  'Beste speler',
  'GOAT',
  'Gedoseerde groepsfase',
  'Goalgettergigant',
  'Desastreuze defensie',
  'Kaartenkoning',
]

export function preBonusIndex(question: string): number {
  const i = PRE_BONUS_ORDER.findIndex((t) => question.toLowerCase().includes(t.toLowerCase()))
  return i === -1 ? 99 : i
}
