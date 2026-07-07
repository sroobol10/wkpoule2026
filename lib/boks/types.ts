export type Side = 0 | 1 // 0 = links (kijkt naar rechts), 1 = rechts

export type PunchKind = 'jab' | 'hook' | 'uppercut' | 'ultimate'

export type FighterState =
  | 'idle' // dekking, kan lopen/stoten/blokken
  | 'jab' // directe onderweg (windup → raakmoment → herstel)
  | 'hook' // hoek onderweg (trager, harder)
  | 'uppercut' // opstoot: traag, kort bereik, ramt door de dekking en vloert
  | 'ultimate' // finisher: enorme uithaal, alleen met een volle meter
  | 'dodge' // ontwijken: hop naar achteren + duik, met i-frames
  | 'grab' // clinch: korte duw die dwars door dodge/blok raakt (anti-dodge)
  | 'block' // dubbele dekking (schuifelt langzaam)
  | 'hit' // versuft na een treffer (combo-venster voor de ander)
  | 'down' // tegen het canvas — de teller loopt
  | 'win' // armen omhoog

export type BoksInput = {
  move: number // -1..1 voetenwerk
  block: boolean // vasthouden = dekken
  jab: boolean // directe (én: rammen om op te staan bij een count)
  hook: boolean
  uppercut: boolean // Q
  ultimate: boolean // R (alleen bij een volle meter)
  dodge: boolean // W / ↑ — ontwijken naar achteren
  grab: boolean // F — clinch (anti-dodge): raakt door dodge/blok heen
}

export type PlayerTraits = { pace: number; shot: number; tackle: number }

export type Fighter = {
  side: Side
  face: string
  name: string
  traits: PlayerTraits
  x: number
  state: FighterState
  t: number // tijd in de huidige state
  struck: boolean // heeft déze stoot al z'n raakmoment gehad (één resolutie per stoot)
  hp: number
  stamina: number
  knockdowns: number
  points: number // jurypunten (jab 1, hoek 2, zuivere treffer +1)
  getupMeter: number // spatie-taps richting opstaan tijdens een count
  headKnock: number // 0..1, render: hoofd klapt naar achteren (dooft uit)
  ultimate: number // 0..100 ultimate-meter (vult bij raken/geraakt worden)
  dodgeCd: number // >0 = kan nog niet opnieuw ontwijken
}

export type BoksEvent =
  | { type: 'hit'; by: Side; dmg: number; clean: boolean; blocked: boolean; kind: PunchKind }
  | { type: 'knockdown'; who: Side }
  | { type: 'getup'; who: Side }
  | { type: 'ultimate'; by: Side } // finisher afgevuurd
  | { type: 'dodge'; by: Side; kind: PunchKind } // stoot ontweken (kind = de gemiste stoot)
  | { type: 'grab'; by: Side; hit: boolean } // clinch afgevuurd (hit = raak)
  | { type: 'bell'; round: number; last: boolean } // einde van een ronde
  | { type: 'round'; round: number } // start van een nieuwe ronde
  | { type: 'end'; winner: Side | -1; how: 'ko' | 'tko' | 'points' | 'draw' }

export type Match = {
  f: [Fighter, Fighter]
  round: number
  rounds: number
  clock: number // resterende rondetijd
  phase: 'fight' | 'count' | 'rest' | 'over'
  count: number // scheids-teller (0..10, loopt in seconden)
  down: Side | -1 // wie er ligt tijdens 'count'
  restT: number
  winner: Side | -1
  how: 'ko' | 'tko' | 'points' | 'draw' | null
  prevJab: [boolean, boolean]
  prevHook: [boolean, boolean]
  prevUppercut: [boolean, boolean]
  prevUltimate: [boolean, boolean]
  prevDodge: [boolean, boolean]
  prevGrab: [boolean, boolean]
}
