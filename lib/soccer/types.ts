import type { Vec2 } from './vec'

export type TeamId = 0 | 1

// Rollen bepalen formatie-ankers en AI-gedrag.
export type Role = 'GK' | 'DEF' | 'MID' | 'FWD'

// Per-speler eigenschappen op een 1..5-schaal (3 = gemiddeld). Bepalen kleine multipliers
// in de sim zodat elke collega net anders speelt (snel/schutter/sloper).
export type PlayerTraits = { pace: number; shot: number; tackle: number }

export type PlayerState = {
  id: number
  team: TeamId
  role: Role
  name: string
  face: string | null // bestandsnaam in /public/spelers, of null → effen kop
  // Genormaliseerd formatie-anker (x: 0 eigen doel → 1 tegenstander, y: 0 boven → 1 onder).
  // Statisch per speler; AI keert hiernaartoe terug.
  anchor: Vec2
  // Statische speler-eigenschappen (1..5) die het spel per persoon laten verschillen.
  // pace = loopsnelheid, shot = schotkracht, tackle = tackle-bereik. Zie teams.ts.
  traits: PlayerTraits
  pos: Vec2
  vel: Vec2
  facing: Vec2 // laatste loeprichting (genormaliseerd) — schotrichting bij stilstand
  kickCooldown: number // seconden tot deze speler weer mag trappen
  charge: number // hoe lang de schiet-knop al wordt vastgehouden (power-balk)
  stamina: number // 0..1, daalt bij sprinten, herstelt in rust
  slideTimer: number // >0 = aan het sliden (tackle of aanvallers-boost)
  slideTackle: boolean // true = echte tackle (poppetje ligt horizontaal); false = aanvallers-boost (blijft staan)
  feintTimer: number // >0 = bezig met een schijnbeweging/kap (R) — korte dash met de bal
  tumbleTimer: number // >0 = omvergelopen door een tackle (tuimelt + even geen controle)
  tackleCooldown: number // >0 = herstellend na een slide (even trager)
  yellow: boolean // heeft al een gele kaart (2e geel = rood)
  sentOff: boolean // van het veld gestuurd (rood)
}

export type BallState = {
  pos: Vec2
  vel: Vec2
  z: number // hoogte boven het veld (0 = op de grond); geladen schoten liften
  vz: number // verticale snelheid
  lastTouch: number // player.id die de bal het laatst raakte
  prevTouch: number // de aanraker daarvóór (voor doelpunt-toewijzing bij afketsers)
  spin: number // zijwaartse curve (Magnus): >0/<0 = bal krult, dooft uit; 0 = recht
}

// Platte, serialiseerbare besturing per speler. inputs[i] hoort bij players[i].
// Klaar om later over het netwerk te sturen voor online 1v1.
export type InputCommand = {
  move: Vec2 // gewenste richting, lengte 0..1
  kick: boolean // schiet/pass-knop (met bal = power laden)
  sprint?: boolean // sprint-knop (extra snelheid, kost stamina)
  slide?: boolean // sliding-tackle (Q)
  switch?: boolean // handmatig van speler wisselen (edge in de client)
  chip?: boolean // stift / lofte pass over de verdediging (E)
  feint?: boolean // schijnbeweging / kap — korte dash met de bal (R)
}

// Team-configuratie (custom naam + kleuren + gekozen spelers). Dynamisch per wedstrijd.
export type TeamMeta = {
  name: string
  short: string // korte code voor het scorebord (max ~4)
  flag?: string // vlag-emoji (bij een landenteam)
  shirt: string // kit-hoofdkleur
  trim: string // accent/broek
  keeper: string // keeperskleur
  formation: string // gekozen formatie-id (bepaalt rollen + posities)
  players: { name: string; face: string | null }[] // selectie, index = formatieplek
}

export type GoalEvent = {
  team: TeamId // team dat het punt kreeg
  scorer: number // player.id die 'm maakte (of laatst raakte); -1 = onbekend
  ownGoal: boolean // eigen doelpunt (scorer speelt in het andere team)
  clock: number // speelkloktijd (s) in de helft van het doelpunt
  half: 1 | 2
}

export type MatchPhase =
  | 'kickoff' // wachten op aftrap
  | 'playing'
  | 'goal' // korte viering, bal ligt stil
  | 'setpiece' // ingooi / hoekschop / doeltrap / vrije trap
  | 'halftime'
  | 'fulltime'

export type RestartKind = 'throwin' | 'corner' | 'goalkick' | 'freekick'

export type CardEvent = { player: number; team: TeamId; red: boolean; clock: number; half: 1 | 2 }

// Veldbestormer (fun): loopt vanuit de tribune diagonaal het veld over naar een
// willekeurig doel, kan de bal niet bezitten maar wel wegketsen/hinderen.
export type StreakerState = {
  pos: Vec2
  vel: Vec2
  target: Vec2 // waar-ie naartoe rent (net buiten het veld → hij loopt eraf)
  timer: number // resterende leeftijd (s); veiligheids-timeout
  variant: 0 | 1 | 2 // welke van de drie streaker-koppen
  caught: boolean // door de beveiliger gepakt → samen op weg naar de tribune (rand)
}

export type GameState = {
  players: PlayerState[]
  ball: BallState
  ref: { pos: Vec2; vel: Vec2 } // scheidsrechter (loopt mee; raakt de bal niet)
  streaker: StreakerState | null // actieve veldbestormer, of null
  streakerCooldown: number // seconden tot een nieuwe bestorming mag spawnen
  security: { pos: Vec2; vel: Vec2 } | null // beveiliger die de bestormer achterna zit
  wind: Vec2 // windvector (duwt de bal, sterker als-ie in de lucht is); {0,0} = geen wind
  // Dynamisch weer: de wind kruipt naar `windTarget`, en elke `weatherTimer` sec valt er een
  // nieuwe vlaag (en soms begint/stopt de regen). `weather` stuurt de regen-/sneeuw-overlay.
  weather: 'clear' | 'rain' | 'snow'
  windTarget: Vec2
  weatherTimer: number
  surface: 'gras' | 'zaal' | 'strand' | 'sneeuw' // ondergrond → balwrijving (rolt korter op zand/sneeuw)
  ballScale: number // 1 = normaal, >1 = giant-ball-modus (grotere bal + botsradius)
  // Chaos-mutators (fun, vooraf in te stellen): grote koppen (render) + gladde mat (spelers glijden).
  bigHeads: boolean
  slippery: boolean
  // Wedstrijdstatistieken per team [team0, team1] (voor het eindscherm).
  stats: { shots: [number, number]; tackles: [number, number]; pannas: [number, number]; possMs: [number, number] }
  cards: CardEvent[] // kaartenlog (voor overlay + rust/eind)
  foulCount: number // telt overtredingen (client hangt hier de pauze/animatie aan — robuust)
  foulCooldown: number // >0 = even geen nieuwe overtreding (voorkomt dubbele in 1 frame)
  foulStreak: number // aantal overtredingen binnen het lopende venster (voor kaart-escalatie)
  foulStreakTimer: number // sim-seconden tot de streak vervalt (reset bij elke overtreding)
  // Overtreding met vertraging: eerst de tumble-animatie tonen, dán de fluit/kaart toekennen.
  pendingFoul: { slider: number; victim: number; behind: boolean; spot: Vec2; delay: number } | null
  tackleCount: number // telt tackle-inslagen (voor het tackle-geluidje)
  saveCount: number // telt knappe keeperreddingen (voor "WAT EEN REDDING!"-popup)
  pannaCount: number // telt geslaagde panna's (voor de "PANNA!"-popup)
  bicycleCount: number // telt omhalen (client hangt hier de slow-motion + "OMHAAL!"-popup aan)
  lastGoalKind: 'normal' | 'screamer' | 'owngoal' // soort laatste doelpunt (voor de banner)
  restartKind: RestartKind | null // type van de huidige set-piece (voor de overlay)
  score: [number, number]
  teams: [TeamMeta, TeamMeta] // custom team-config (namen, kleuren, selectie)
  goals: GoalEvent[] // log van alle doelpunten (voor het rust/eind-scherm)
  phase: MatchPhase
  phaseTimer: number // aftellen voor 'goal'-viering e.d.
  clock: number // verstreken speeltijd in de huidige helft (seconden)
  half: 1 | 2
  halfLengthSec: number // lengte van één helft
  startKickoffTeam: TeamId // wie in helft 1 aftrapte (helft 2 = de ander)
  // Team dat mag aftrappen (na goal krijgt de andere ploeg de bal).
  kickoffTeam: TeamId
  // Richting waarin team 0 aanvalt: +1 = naar rechts (doel rechts). Wisselt na rust.
  attackDir: 1 | -1
  // Edge-detectie per speler: was de kick-/slide-knop vorige tick ingedrukt?
  prevKick: boolean[]
  prevSlide: boolean[]
  prevChip: boolean[]
  prevFeint: boolean[]
  // Wie de mens bestuurt (client vult dit; sim gebruikt het voor niets kritisch).
  controlled: number
  lastGoalBy: TeamId | null
}

export type MatchConfig = {
  halfLengthSec: number // lengte van één helft
  difficulty: number // 0..1, schaalt AI-reactietijd/-snelheid
  humanTeam: TeamId
}
