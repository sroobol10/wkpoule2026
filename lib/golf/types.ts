export type Vec = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

// Baan-thema: elke hole krijgt een eigen sfeer (kleuren) zodat het niet altijd groen is.
export type GolfTheme = {
  name: string
  fairway: string // hoofd-vlakkleur
  fairway2: string // stripe-kleur voor de maaibanen
  wall: string // rand/boarding
  ink: string // lijn-/tekstkleur die contrasteert
}

// Eén (random gegenereerde) hole: een unie van rechthoekige "kamers" met de tee in de
// eerste en de cup in de laatste, plus obstakels ertussenin.
export type Hole = {
  rects: Rect[]
  tee: Vec
  cup: Vec
  par: number
  theme: GolfTheme
  bumpers: { x: number; y: number; r: number; face: string }[] // stuiterende collega-koppen
  sand: { x: number; y: number; r: number }[] // zandbunker: hoge wrijving
  water: { x: number; y: number; r: number }[] // water: strafslag + terugleggen
  mill: { x: number; y: number; len: number; speed: number } | null // draaiende molenwiek
  boost: { x: number; y: number; r: number; ang: number }[] // pijl-tegels: geven de bal een zetje
}

export type GolfBall = {
  x: number
  y: number
  vx: number
  vy: number
  spin: number // curve: zijwaartse versnelling die uitdooft (van de curve-bal)
  sinking: number // >0 = valt in de cup (render: krimpt); telt af, dán pas 'cup'
}

export type GolfPlayer = {
  face: string
  name: string
  strokes: number[] // slagen per hole
  ball: GolfBall
  holed: boolean // ligt de bal in de cup (deze hole)
  preShot: Vec // positie vóór de laatste slag (voor de water-reset)
}

export type StepEvent = 'rest' | 'cup' | 'water' | null
