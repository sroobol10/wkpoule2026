// Koppenkanon — Angry Birds-lite met collega-koppen. Solo (endless torens slopen, offline) én twee
// ONLINE 1v1-varianten: DUEL (om de beurt elkaars kop raken, best of) en TOREN (om de beurt dezelfde
// toren slopen — meeste doelwitten wint). De 1v1-modi draaien host-authoritative over de netwerklaag.
//
// Physics: lichtgewicht AABB-rigid-bodies (rotatie cosmetisch) met zwaartekracht, grond-/onderlinge
// botsing (MTV + demping) en 'slapen'. Beurten wisselen na elke afgeronde worp.

export const W = 1000
export const H = 560
export const GROUND_Y = 486
export const GRAV = 1040 // zwaartekracht (iets lager → koppen vliegen verder)
export const SLING_X = 140
export const SLING_X2 = W - 140 // rechter katapult (speler 1 bij duel)
export const SLING_Y = GROUND_Y - 96
export const PULL_MAX = 96
export const LAUNCH_MAX = 1260 // lanceersnelheid bij vol trekken (px/s) — genoeg om ruim de torens te halen
export const BALL_R = 20
export const CRATE = 46
export const TARGET_R = 24
export const DUEL_WINS = 3 // aantal rake treffers om een duel te winnen
export const WIND_MAX = 260 // maximale wind-versnelling op het projectiel (px/s²)

// Power-up van de kogel-kop, mid-vlucht te activeren (spatie/klik): bom (ontploft), boost (spurt
// vooruit), slam (dook omlaag), curve (bananenschot), ghost (vliegt door blokken). 'none' = gewoon.
export type PowerKind = 'none' | 'bomb' | 'boost' | 'slam' | 'split' | 'giant' | 'magnet' | 'rocket' | 'curve' | 'ghost'
const POWER_POOL: PowerKind[] = ['bomb', 'boost', 'slam', 'split', 'giant', 'magnet', 'rocket', 'curve', 'ghost']
function randomPower(): PowerKind {
  if (Math.random() < 0.28) return 'none'
  return POWER_POOL[Math.floor(Math.random() * POWER_POOL.length)]
}

// Scène per level: lucht-gradiënt (boven→onder), heuvel- en grondkleur + zwaartekracht. Elk level
// ziet er anders uit; sommige scènes veranderen ook de zwaartekracht (ruimte zweverig, planeet zwaar).
export type Scene = { name: string; skyTop: string; skyBot: string; hill: string; ground: string; grass: string; grav: number }
const SCENES: Scene[] = [
  { name: '', skyTop: '#2a3f66', skyBot: '#7fb0d8', hill: '#3f7a4e', ground: '#6b4a2a', grass: '#5aa35f', grav: GRAV }, // heldere dag
  { name: '🌅 Zonsopkomst', skyTop: '#3a2c5a', skyBot: '#f2a65a', hill: '#4a6b45', ground: '#5e4326', grass: '#6aa35a', grav: GRAV },
  { name: '🌆 Avondrood', skyTop: '#241436', skyBot: '#e8623a', hill: '#39543f', ground: '#4a3320', grass: '#4f8a54', grav: GRAV },
  { name: '🌌 Nacht', skyTop: '#080d22', skyBot: '#2a3550', hill: '#1f3a2f', ground: '#2a2418', grass: '#356b3a', grav: GRAV },
  { name: '❄️ Sneeuwland', skyTop: '#5a7a9a', skyBot: '#d4e6f2', hill: '#dbe9f0', ground: '#aebcc6', grass: '#e8f2f7', grav: GRAV },
  { name: '🌙 Ruimte — lage zwaartekracht', grav: GRAV * 0.42, skyTop: '#04060f', skyBot: '#161c40', hill: '#262a44', ground: '#33384a', grass: '#3a4258' },
  { name: '🪐 Zware planeet', grav: GRAV * 1.5, skyTop: '#3a1f2a', skyBot: '#9a5450', hill: '#5a3838', ground: '#472828', grass: '#6a4040' },
  { name: '🌬️ Stormachtig', grav: GRAV * 0.9, skyTop: '#2c3c50', skyBot: '#61707e', hill: '#3a5545', ground: '#494535', grass: '#4f8a54' },
]
// Grav-neutrale scènes (voor eerlijke 1v1-modi — wel wisselend uiterlijk, geen rare zwaartekracht).
const FAIR_SCENES = SCENES.filter((sc) => sc.grav === GRAV)
const pickScene = (arr: Scene[]) => arr[Math.floor(Math.random() * arr.length)]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export type KanonMode = 'solo' | 'duel' | 'tower'

// crate = hout · stone = zwaar (nauwelijks te bewegen) · tnt = ontploft met kettingreactie ·
// ice = broos (versplintert al bij een lichte tik) · rubber = veert de kop keihard terug ·
// target = doelwit-kop (moet kapot) · bonus = gouden kop (extra punten, niet verplicht) ·
// decoy = nep-kop (ziet eruit als doelwit maar kost punten) · coin = muntje uit de lucht (beloning).
export type BodyKind = 'crate' | 'stone' | 'tnt' | 'ice' | 'rubber' | 'target' | 'bonus' | 'decoy' | 'coin'

export type Body = {
  x: number; y: number; w: number; h: number
  vx: number; vy: number; angle: number; va: number
  kind: BodyKind
  face?: string
  player?: 0 | 1 // duel: wélke speler deze kop ís (wordt geraakt door de ánder)
  arena?: 0 | 1 // (legacy) altijd 0 — bleef verder als één gedeelde arena
  fixed?: boolean // beweegt niet (duel-kop staat gewoon te staan)
  float?: boolean // zweeft (ballon-kop) — geen zwaartekracht, wél te raken
  sky?: boolean // uit de lucht gevallen (gimmick)
  patrol?: number // patrouilleert horizontaal (px/s); zweeft op een rail, geen zwaartekracht
  patX0?: number // midden van de patrouille-rail
  hp?: number // boss-kop: aantal treffers dat 'ie incasseert vóór 'ie sneuvelt (default 1)
  popped: boolean
  sleep: number
}

const massFactor = (b: Body) => (b.kind === 'stone' ? 0.32 : b.kind === 'ice' ? 1.2 : b.kind === 'rubber' ? 0.7 : 1) // steen amper te duwen, ijs/rubber juist licht

export type Ball = { x: number; y: number; vx: number; vy: number; angle: number; va: number; r: number; face: string; owner: 0 | 1; arena: 0 | 1; power: PowerKind; powerUsed: boolean; live: boolean; sleep: number; hits: number; homing?: number; curve?: number; ghost?: number }

export type KanonEvent =
  | { type: 'launch'; x: number; y: number } // kop afgeschoten (katapult-geluid; ook voor de gast)
  | { type: 'pop'; x: number; y: number; face: string; bonus?: boolean }
  | { type: 'thud'; x: number; y: number; power: number }
  | { type: 'boom'; x: number; y: number } // TNT-explosie
  | { type: 'shatter'; x: number; y: number } // ijs versplintert
  | { type: 'bounce'; x: number; y: number } // rubber-blok of trampoline kaatst iets terug
  | { type: 'power'; kind: PowerKind; x: number; y: number } // power-up geactiveerd
  | { type: 'blackhole'; x: number; y: number } // zwart gat geopend (magnet-power)
  | { type: 'combo'; n: number } // 3+ koppen in één schot
  | { type: 'sky'; x: number; kind: BodyKind } // er valt iets uit de lucht
  | { type: 'gust'; wind: number } // plotselinge winddraai mid-vlucht (solo)
  | { type: 'decoy'; x: number; y: number } // nep-kop geraakt (minpunten)
  | { type: 'coin'; x: number; y: number } // muntje gepakt (beloning)
  | { type: 'meteor' } // meteorenregen begint
  | { type: 'cleared' } // solo: level uit
  | { type: 'failed' } // solo: schoten op
  | { type: 'won'; winner: -1 | 0 | 1 } // 1v1: match beslist

export type KanonState = {
  mode: KanonMode
  bodies: Body[]
  ball: Ball | null
  turn: 0 | 1 // wiens beurt (1v1)
  ammo: [string[], string[]] // voorraad per speler
  score: [number, number]
  hits: [number, number] // duel-treffers
  level: number // solo
  picks: [string, string] // gekozen koppen per speler
  targetPool: string[] // koppen voor de doelwitten
  shards: Ball[] // extra projectielen (van de split-power)
  phase: 'aim' | 'fly' | 'settle' | 'cleared' | 'failed' | 'won'
  settleT: number
  winner: -1 | 0 | 1
  skyT: number // afteller voor de volgende 'iets valt uit de lucht' (solo)
  wind: number // horizontale windversnelling op het projectiel (wisselt per schot)
  grav: number // zwaartekracht van dit level (thema)
  gravName: string // label van de scène (getoond in de HUD)
  skyTop: string; skyBot: string; hill: string; ground: string; grass: string // scène-kleuren per level
  nextPower: PowerKind // power van de nu-geladen kop (zichtbaar vóór het schot)
  mysteryNext: boolean // ⁇ mysterie-kop: power pas ná lanceren zichtbaar
  weather: 'none' | 'rain' | 'fog' // cosmetisch weer over het veld
  modifier: 'none' | 'double' | 'lowammo' | 'windy' // ronde-modifier (solo)
  gustT: number // afteller tot de volgende windvlaag mid-vlucht (solo)
  shotPops: number // koppen gesloopt met het huidige schot (voor combo's)
  blackhole: { x: number; y: number; t: number } | null // actief zwart gat (magnet-power)
  meteorT: number // resterende duur van de meteorenregen (0 = niet actief)
  meteorCd: number // afteller tot de volgende meteorenregen (solo)
  pads: { x: number; w: number }[] // trampolines op de grond (solo) — kaatsen alles omhoog
}

export function slingPos(mode: KanonMode, player: 0 | 1): { x: number; y: number } {
  const x = mode === 'duel' && player === 1 ? SLING_X2 : SLING_X
  return { x, y: SLING_Y }
}

// ── Bouwstenen ──────────────────────────────────────────────────────────────────
function crate(bodies: Body[], x: number, y: number, w: number, h: number, arena: 0 | 1 | undefined, kind: BodyKind = 'crate') {
  bodies.push({ x, y, w, h, vx: 0, vy: 0, angle: 0, va: 0, kind, arena, popped: false, sleep: 1 })
}
function head(bodies: Body[], x: number, y: number, arena: 0 | 1 | undefined, face: string, bonus = false) {
  const helmet = !bonus && Math.random() < 0.18 // helm-kop: incasseert één extra treffer
  bodies.push({ x, y, w: TARGET_R * 2, h: TARGET_R * 2, vx: 0, vy: 0, angle: 0, va: 0, kind: bonus ? 'bonus' : 'target', face, arena, hp: helmet ? 2 : undefined, popped: false, sleep: 1 })
}
// Kies een bouwmateriaal: meestal hout, soms zwaar steen, broos ijs, veerkrachtig rubber of TNT.
function material(level: number): BodyKind {
  const r = Math.random()
  if (r < 0.08 + level * 0.01) return 'tnt'
  if (r < 0.22) return 'stone'
  if (r < 0.34) return 'ice'
  if (r < 0.44) return 'rubber'
  return 'crate'
}

// Bouw één willekeurige structuur bij (cx): toren, piramide of brug. targetFace bovenop.
function structure(bodies: Body[], cx: number, arena: 0 | 1 | undefined, targetFace: string | undefined, level: number) {
  const type = Math.floor(Math.random() * 3)
  if (type === 0) { // TOREN
    const stack = 2 + Math.floor(Math.random() * 3)
    for (let r = 0; r < stack; r++) crate(bodies, cx, GROUND_Y - CRATE / 2 - r * CRATE, CRATE, CRATE, arena, material(level))
    if (targetFace) head(bodies, cx, GROUND_Y - stack * CRATE - TARGET_R, arena, targetFace)
  } else if (type === 1) { // PIRAMIDE
    const rows = 2 + Math.floor(Math.random() * 2)
    for (let r = 0; r < rows; r++) {
      const n = rows - r
      for (let i = 0; i < n; i++) crate(bodies, cx + (i - (n - 1) / 2) * CRATE, GROUND_Y - CRATE / 2 - r * CRATE, CRATE, CRATE, arena, material(level))
    }
    if (targetFace) head(bodies, cx, GROUND_Y - rows * CRATE - TARGET_R, arena, targetFace)
  } else { // BRUG (twee pilaren + plank + kop erop)
    for (const dx of [-CRATE, CRATE]) { crate(bodies, cx + dx, GROUND_Y - CRATE / 2, CRATE, CRATE, arena, material(level)); crate(bodies, cx + dx, GROUND_Y - CRATE * 1.5, CRATE, CRATE, arena, material(level)) }
    crate(bodies, cx, GROUND_Y - CRATE * 2 - 8, CRATE * 3.2, 16, arena, 'crate') // plank
    if (targetFace) head(bodies, cx, GROUND_Y - CRATE * 2 - 16 - TARGET_R, arena, targetFace)
  }
}

// Bouw de bodies + voorraad op voor een bepaald level/modus. targetPool = koppen voor doelwitten.
function buildBodies(s: KanonState): void {
  const bodies: Body[] = []
  const pool = [...s.targetPool].sort(() => Math.random() - 0.5)
  const pick = (i: number) => pool[i % pool.length]
  const L = s.level
  s.pads = []

  if (s.mode === 'solo') {
    const nT = Math.min(4, 1 + Math.floor(L / 2))
    const nCols = 2 + (L % 3)
    let placed = 0
    for (let c = 0; c < nCols; c++) {
      const cx = 560 + c * 120 + (Math.random() * 20 - 10)
      structure(bodies, cx, undefined, placed < nT ? pick(placed) : undefined, L)
      if (placed < nT) placed++
    }
    while (placed < nT) { head(bodies, 560 + placed * 120, GROUND_Y - TARGET_R, undefined, pick(placed)); placed++ }
    if (Math.random() < 0.6) head(bodies, 560 + Math.random() * 340, GROUND_Y - CRATE * (2 + Math.random() * 2) - TARGET_R, undefined, pick(nT), true) // gouden bonus-kop hoog
    if (L >= 2 && Math.random() < 0.55) { // zwevende ballon-kop (extra doelwit in de lucht)
      const bx = 520 + Math.random() * 420
      bodies.push({ x: bx, y: 120 + Math.random() * 100, w: TARGET_R * 2, h: TARGET_R * 2, vx: 0, vy: 0, angle: 0, va: 0, kind: 'target', face: pick(nT + 1), float: true, popped: false, sleep: 1 })
    }
    if (L >= 3 && Math.random() < 0.5) { // patrouillerende kop: schuift heen en weer op een rail
      const bx = 640 + Math.random() * 240
      bodies.push({ x: bx, y: 150 + Math.random() * 180, w: TARGET_R * 2, h: TARGET_R * 2, vx: 0, vy: 0, angle: 0, va: 0, kind: 'target', face: pick(nT + 2), float: true, patrol: (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 70), patX0: bx, popped: false, sleep: 1 })
    }
    if (Math.random() < 0.5) s.pads.push({ x: 470 + Math.random() * 320, w: 76 }) // trampoline op de grond
    if (L >= 2 && Math.random() < 0.4) s.pads.push({ x: 470 + Math.random() * 320, w: 76 })
    if (L >= 4 && Math.random() < 0.45) { // BOSS-kop: reuzenkop die meerdere treffers incasseert
      const bx = 620 + Math.random() * 200
      bodies.push({ x: bx, y: GROUND_Y - TARGET_R * 1.8, w: TARGET_R * 3.6, h: TARGET_R * 3.6, vx: 0, vy: 0, angle: 0, va: 0, kind: 'target', face: pick(nT + 3), hp: 3, popped: false, sleep: 1 })
    }
    if (L >= 2 && Math.random() < 0.4) { // bewegende hindernis: zwevend blok dat je schot kan wegtikken
      const bx = 560 + Math.random() * 320
      const mk: BodyKind = Math.random() < 0.5 ? 'stone' : 'crate'
      bodies.push({ x: bx, y: 150 + Math.random() * 150, w: CRATE, h: CRATE, vx: 0, vy: 0, angle: 0, va: 0, kind: mk, float: true, patrol: (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 80), patX0: bx, popped: false, sleep: 1 })
    }
    if (L >= 2 && Math.random() < 0.45) { // nep-kop tussen de doelwitten (kost punten als je 'm raakt)
      const bx = 540 + Math.random() * 360
      bodies.push({ x: bx, y: GROUND_Y - TARGET_R, w: TARGET_R * 2, h: TARGET_R * 2, vx: 0, vy: 0, angle: 0, va: 0, kind: 'decoy', face: pick(nT + 4), popped: false, sleep: 1 })
    }
    // Munitie = precies genoeg voor alle doelwitten (boss/helm tellen hun treffers mee) + 1 marge-schot.
    // Zo kun je écht dóór je schoten heen en wél 'af' gaan — mikken telt weer. (lowammo: één minder.)
    const need = bodies.reduce((n, b) => n + (b.kind === 'target' ? (b.hp ?? 1) : 0), 0)
    const shots = s.modifier === 'lowammo' ? Math.max(2, need) : Math.max(3, need + 1)
    s.ammo = [Array.from({ length: shots }, () => s.picks[0]), []]
  } else if (s.mode === 'tower') {
    for (let c = 0; c < 3; c++) structure(bodies, 560 + c * 120, undefined, pick(c), L)
    s.ammo = [Array.from({ length: 4 }, () => s.picks[0]), Array.from({ length: 4 }, () => s.picks[1])]
  } else { // duel
    for (let c = 0; c < 3; c++) structure(bodies, W / 2 - 70 + c * 70, undefined, undefined, L) // cover
    bodies.push({ x: 300, y: GROUND_Y - TARGET_R, w: TARGET_R * 2, h: TARGET_R * 2, vx: 0, vy: 0, angle: 0, va: 0, kind: 'target', face: s.picks[0], player: 0, fixed: true, popped: false, sleep: 1 })
    bodies.push({ x: W - 300, y: GROUND_Y - TARGET_R, w: TARGET_R * 2, h: TARGET_R * 2, vx: 0, vy: 0, angle: 0, va: 0, kind: 'target', face: s.picks[1], player: 1, fixed: true, popped: false, sleep: 1 })
    s.ammo = [Array.from({ length: 30 }, () => s.picks[0]), Array.from({ length: 30 }, () => s.picks[1])]
  }
  s.bodies = bodies
}

// Ronde-modifier (alleen solo, vanaf level 2): af en toe een extra draai aan de ronde.
function randomModifier(mode: KanonMode, level: number): KanonState['modifier'] {
  if (mode !== 'solo' || level < 2 || Math.random() < 0.45) return 'none'
  return (['double', 'lowammo', 'windy'] as const)[Math.floor(Math.random() * 3)]
}
// Cosmetisch weer: sneeuwscène krijgt sneeuw; verder af en toe regen of mist.
function randomWeather(scene: Scene): KanonState['weather'] {
  if (scene.name.includes('Sneeuw')) return 'none' // sneeuwland spreekt voor zich
  const r = Math.random()
  return r < 0.22 ? 'rain' : r < 0.34 ? 'fog' : 'none'
}

export function makeGame(mode: KanonMode, picks: [string, string], targetPool: string[], level = 1): KanonState {
  // Scène: level 1 solo start neutraal; daarna elke ronde een andere look (soms met gekke zwaartekracht).
  // 1v1-modi krijgen wél een wisselend uiterlijk, maar altijd normale zwaartekracht (eerlijk).
  const scene = mode !== 'solo' ? pickScene(FAIR_SCENES)
    : level <= 1 ? SCENES[0]
      : pickScene(SCENES)
  const modifier = randomModifier(mode, level)
  const windMul = modifier === 'windy' ? 1.6 : 1
  const s: KanonState = {
    mode, bodies: [], ball: null, shards: [], turn: 0, ammo: [[], []], score: [0, 0], hits: [0, 0],
    level, picks, targetPool, phase: 'aim', settleT: 0, winner: -1, skyT: 4 + Math.random() * 4,
    wind: (Math.random() * 2 - 1) * WIND_MAX * windMul, grav: scene.grav, gravName: scene.name, nextPower: randomPower(), shotPops: 0,
    skyTop: scene.skyTop, skyBot: scene.skyBot, hill: scene.hill, ground: scene.ground, grass: scene.grass,
    mysteryNext: Math.random() < 0.35, weather: randomWeather(scene), modifier, gustT: 0.8 + Math.random() * 1.2,
    blackhole: null, meteorT: 0, meteorCd: 14 + Math.random() * 16, pads: [],
  }
  buildBodies(s)
  return s
}

export function targetsLeft(s: KanonState, arena?: 0 | 1): number {
  return s.bodies.filter((b) => b.kind === 'target' && !b.popped && (arena === undefined || b.arena === arena)).length
}

// Vuur de bovenste voorraad-kop van de speler-aan-beurt af. Geeft de sim-events terug (o.a. 'launch',
// zodat het katapult-geluid ook via de netwerk-snapshot bij de gast belandt).
export function launch(s: KanonState, vx: number, vy: number): KanonEvent[] {
  if (s.phase !== 'aim') return []
  const t = s.turn
  if (s.ammo[t].length === 0) return []
  const face = s.ammo[t].shift()!
  const sp = slingPos(s.mode, t)
  const jit = 1 + (Math.random() - 0.5) * 0.03 // minieme afwijking per schot (voelt levendiger)
  s.ball = { x: sp.x, y: sp.y, vx: vx * jit, vy: vy * jit, angle: 0, va: vx * 0.02 + (Math.random() - 0.5) * 0.6, r: BALL_R, face, owner: t, arena: 0, power: s.nextPower, powerUsed: false, live: true, sleep: 0, hits: 0 }
  s.shards = []
  s.shotPops = 0
  s.nextPower = randomPower()
  s.mysteryNext = Math.random() < 0.35
  s.wind = (Math.random() * 2 - 1) * WIND_MAX * (s.modifier === 'windy' ? 1.6 : 1) // nieuwe windvlaag per schot
  s.gustT = 0.8 + Math.random() * 1.2
  s.phase = 'fly'
  return [{ type: 'launch', x: sp.x, y: sp.y }]
}

// Mid-vlucht de power van de kogel-kop activeren (spatie/klik). Eén keer per schot.
export function activatePower(s: KanonState): KanonEvent[] {
  const ev: KanonEvent[] = []
  const b = s.ball
  if (!b || !b.live || b.powerUsed || b.power === 'none') return ev
  b.powerUsed = true
  if (b.power === 'bomb') explode(s, b.x, b.y, b.owner, ev)
  else if (b.power === 'boost') { b.vx *= 1.7; b.vy -= 190; b.va *= 1.6 }
  else if (b.power === 'slam') { b.vy += 1000; b.vx *= 0.6 }
  else if (b.power === 'giant') { b.r = BALL_R * 2.3; b.vx *= 1.1 } // mega-kop beukt door alles
  else if (b.power === 'split') { // splitst in drieën
    for (const ang of [-0.32, 0.32]) {
      const c = Math.cos(ang), sn = Math.sin(ang)
      s.shards.push({ ...b, vx: b.vx * c - b.vy * sn, vy: b.vx * sn + b.vy * c, power: 'none', powerUsed: true, hits: 0 })
    }
  } else if (b.power === 'magnet') { // opent een zwart gat dat alles naar zich toe zuigt
    s.blackhole = { x: b.x + Math.sign(b.vx || 1) * 150, y: clamp(b.y - 30, 90, GROUND_Y - 80), t: 1.7 }
    ev.push({ type: 'blackhole', x: s.blackhole.x, y: s.blackhole.y })
  } else if (b.power === 'rocket') { b.homing = 1.2; b.va *= 0.4 } // raket: stuurt naar het dichtstbijzijnde doelwit
  else if (b.power === 'curve') { b.curve = (Math.random() < 0.5 ? -1 : 1) * 1100 } // bananenschot: buigt loodrecht op de vaart
  else if (b.power === 'ghost') { b.ghost = 0.9 } // spookkop: vliegt kort dwars door blokken (popt wél koppen)
  ev.push({ type: 'power', kind: b.power, x: b.x, y: b.y })
  return ev
}

function circleAABB(cx: number, cy: number, r: number, b: Body): { nx: number; ny: number; depth: number } | null {
  const hx = b.w / 2, hy = b.h / 2
  const dx = cx - b.x, dy = cy - b.y
  const px = Math.abs(dx) - hx, py = Math.abs(dy) - hy
  if (px > r || py > r) return null
  const qx = clamp(cx, b.x - hx, b.x + hx)
  const qy = clamp(cy, b.y - hy, b.y + hy)
  const ox = cx - qx, oy = cy - qy
  const d = Math.hypot(ox, oy)
  if (d > r) return null
  if (d < 0.0001) {
    if (-px < -py) return { nx: Math.sign(dx) || 1, ny: 0, depth: r - px }
    return { nx: 0, ny: Math.sign(dy) || 1, depth: r - py }
  }
  return { nx: ox / d, ny: oy / d, depth: r - d }
}

const wake = (b: Body) => { if (!b.fixed) b.sleep = 0 }

// Een doelwit/bonus-kop kapot maken + scoren (per modus). owner = wie 'm sloopte.
function popTarget(s: KanonState, b: Body, owner: 0 | 1, ev: KanonEvent[]): void {
  if (b.kind !== 'target' && b.kind !== 'bonus') return
  if (s.mode === 'duel' && b.player !== (1 - owner)) return // in duel telt alleen de kop van de ánder
  if (b.hp && b.hp > 1) { b.hp--; ev.push({ type: 'thud', x: b.x, y: b.y, power: 700 }); return } // boss-kop incasseert nog een treffer
  b.popped = true
  s.shotPops++
  ev.push({ type: 'pop', x: b.x, y: b.y, face: b.face!, bonus: b.kind === 'bonus' })
  if (s.mode === 'tower') s.score[owner] += b.kind === 'bonus' ? 3 : 1
  else if (s.mode === 'duel') s.hits[owner]++
  else if (s.mode === 'solo' && b.kind === 'bonus') s.score[0] += 500 * (s.modifier === 'double' ? 2 : 1)
}

// TNT-explosie: duwt alles in de buurt weg, popt doelwitten, en zet andere TNT áán (kettingreactie).
function explode(s: KanonState, bx: number, by: number, owner: 0 | 1, ev: KanonEvent[]): void {
  ev.push({ type: 'boom', x: bx, y: by })
  const R = 132
  const chain: Body[] = []
  for (const b of s.bodies) {
    if (b.popped) continue
    const d = Math.hypot(b.x - bx, b.y - by)
    if (d > R) continue
    const nx = (b.x - bx) / (d || 1), ny = (b.y - by) / (d || 1)
    const f = (1 - d / R) * 660
    if (!b.fixed) { wake(b); b.vx += nx * f; b.vy += ny * f - 150; b.va += (Math.random() - 0.5) * 12 }
    if (b.kind === 'tnt') { b.popped = true; chain.push(b) }
    else if (b.kind === 'ice') { b.popped = true; ev.push({ type: 'shatter', x: b.x, y: b.y }) }
    else popTarget(s, b, owner, ev)
  }
  for (const c of chain) explode(s, c.x, c.y, owner, ev) // al gemarkeerd als popped → geen oneindige lus
}

// Dichtstbijzijnde nog levende doelwit-kop (voor de raket-power).
function nearestTarget(s: KanonState, b: Ball): Body | null {
  let best: Body | null = null, bd = Infinity
  for (const t of s.bodies) {
    if (t.popped || (t.kind !== 'target' && t.kind !== 'bonus')) continue
    if (s.mode === 'duel' && t.player === b.owner) continue
    const d = Math.hypot(t.x - b.x, t.y - b.y)
    if (d < bd) { bd = d; best = t }
  }
  return best
}

// Eén projectiel bewegen + botsen (primair óf een split-scherf). Zet b.live=false als-ie uitgeteld is.
function moveBall(s: KanonState, b: Ball, dt: number, ev: KanonEvent[]): void {
  const loX = 0
  const hiX = W
  b.vy += s.grav * dt
  b.vx += s.wind * dt
  if (b.curve) { // bananenschot: versnelling loodrecht op de huidige vaart → gebogen baan
    const sp = Math.hypot(b.vx, b.vy) || 1
    const px = -b.vy / sp, py = b.vx / sp
    b.vx += px * b.curve * dt; b.vy += py * b.curve * dt
  }
  if (b.ghost && b.ghost > 0) b.ghost -= dt
  if (b.homing && b.homing > 0) { // raket-power: stuur de snelheidsvector naar het doelwit
    b.homing -= dt
    const tgt = nearestTarget(s, b)
    if (tgt) {
      const dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy) || 1
      const sp = Math.max(340, Math.hypot(b.vx, b.vy))
      const k = Math.min(1, dt * 5)
      b.vx += (dx / d * sp - b.vx) * k
      b.vy += (dy / d * sp - b.vy) * k
      b.va = (dx > 0 ? 1 : -1) * 6
    }
  }
  b.x += b.vx * dt
  b.y += b.vy * dt
  b.angle += b.va * dt
  if (b.y + b.r > GROUND_Y) {
    const onPad = s.pads.some((p) => Math.abs(b.x - p.x) < p.w / 2)
    b.y = GROUND_Y - b.r
    if (onPad && b.vy > 120) { b.vy = -Math.abs(b.vy) * 0.92 - 240; b.vx *= 0.94; ev.push({ type: 'bounce', x: b.x, y: GROUND_Y }) } // trampoline
    else { b.vy *= -0.34; b.vx *= 0.66; b.va *= 0.6 }
  }
  if (b.x < loX + b.r) { b.x = loX + b.r; b.vx = Math.abs(b.vx) * 0.4 }
  if (b.x > hiX - b.r) { b.x = hiX - b.r; b.vx = -Math.abs(b.vx) * 0.4 }
  for (const bd of s.bodies) {
    if (bd.popped) continue
    if (s.mode === 'duel' && bd.player === b.owner) continue
    const solid = bd.kind !== 'target' && bd.kind !== 'bonus' && bd.kind !== 'decoy' && bd.kind !== 'coin'
    if (b.ghost && b.ghost > 0 && solid) continue // spookkop negeert massieve blokken
    const hit = circleAABB(b.x, b.y, b.r, bd)
    if (!hit) continue
    const impact = Math.hypot(b.vx, b.vy)
    const giant = b.r > BALL_R * 1.5
    if (!giant) { b.x += hit.nx * hit.depth; b.y += hit.ny * hit.depth } // giant beukt door (niet terugduwen)
    if (!bd.fixed) {
      wake(bd)
      const mf = massFactor(bd) * (b.r / BALL_R)
      bd.vx += (b.vx * 0.5 - hit.nx * impact * 0.15) * mf
      bd.vy += (b.vy * 0.5 - hit.ny * impact * 0.15) * mf
      bd.va += (Math.random() - 0.5) * 6 * mf
    }
    if (giant) { b.vx *= 0.88; b.vy *= 0.88 }
    else if (bd.kind === 'rubber') { // kaats hard terug langs de normaal (hoge veerkracht)
      const dot = b.vx * hit.nx + b.vy * hit.ny
      b.vx = (b.vx - 2 * dot * hit.nx) * 1.03
      b.vy = (b.vy - 2 * dot * hit.ny) * 1.03
      ev.push({ type: 'bounce', x: b.x, y: b.y })
    } else { b.vx *= 0.52; b.vy *= 0.52 }
    b.hits++
    ev.push({ type: 'thud', x: b.x, y: b.y, power: impact })
    if (bd.kind === 'tnt' && impact > 90) explode(s, bd.x, bd.y, b.owner, ev)
    else if (bd.kind === 'ice' && impact > 55) { bd.popped = true; ev.push({ type: 'shatter', x: bd.x, y: bd.y }) }
    else if ((bd.kind === 'target' || bd.kind === 'bonus') && impact > 110) popTarget(s, bd, b.owner, ev)
    else if (bd.kind === 'decoy' && impact > 90) { bd.popped = true; ev.push({ type: 'decoy', x: bd.x, y: bd.y }); if (s.mode === 'solo') s.score[0] = Math.max(0, s.score[0] - 200) } // nep-kop: minpunten
    else if (bd.kind === 'coin' && impact > 30) { bd.popped = true; ev.push({ type: 'coin', x: bd.x, y: bd.y }); if (s.mode === 'solo') { s.score[0] += 300 * (s.modifier === 'double' ? 2 : 1); s.ammo[0].push(s.picks[0]) } } // muntje: beloning
  }
  const speed = Math.hypot(b.vx, b.vy)
  if (speed < 30 && b.y + b.r >= GROUND_Y - 1) b.sleep += dt; else b.sleep = 0
  if (b.sleep > 0.5 || b.x < loX - 40 || b.x > hiX + 40 || b.hits > 40) b.live = false
}

// Volgende speler die nog schoten heeft; -1 als niemand meer kan.
function nextShooter(s: KanonState, from: 0 | 1): 0 | 1 | -1 {
  const other = (1 - from) as 0 | 1
  if (s.ammo[other].length > 0) return other
  if (s.ammo[from].length > 0) return from
  return -1
}

export function step(s: KanonState, dt: number): KanonEvent[] {
  const ev: KanonEvent[] = []
  if (s.phase === 'won' || s.phase === 'cleared' || s.phase === 'failed') return ev

  // Gimmick (solo): af en toe valt er iets uit de lucht — een kist, zwaar steen of een TNT-vat.
  if (s.mode === 'solo' && (s.phase === 'aim' || s.phase === 'fly') && s.bodies.length < 40) {
    s.skyT -= dt
    if (s.skyT <= 0) {
      s.skyT = 5 + Math.random() * 5
      const x = 470 + Math.random() * 450
      const r0 = Math.random()
      const k: BodyKind = r0 < 0.15 ? 'coin' : r0 < 0.4 ? 'tnt' : r0 < 0.68 ? 'stone' : 'crate' // soms valt er een muntje mee
      const box = k === 'coin' ? 30 : CRATE
      s.bodies.push({ x, y: -40, w: box, h: box, vx: 0, vy: 0, angle: 0, va: (Math.random() - 0.5) * 3, kind: k, sky: true, popped: false, sleep: 0 })
      ev.push({ type: 'sky', x, kind: k })
    }
  }

  // Gimmick (solo): af en toe een korte, hevige METEORENREGEN — stenen en TNT kletteren snel omlaag.
  if (s.mode === 'solo' && (s.phase === 'aim' || s.phase === 'fly')) {
    if (s.meteorT > 0) {
      s.meteorT -= dt
      if (Math.random() < dt * 7 && s.bodies.length < 48) {
        const x = 460 + Math.random() * 470
        const k: BodyKind = Math.random() < 0.42 ? 'tnt' : 'stone'
        s.bodies.push({ x, y: -50, w: CRATE, h: CRATE, vx: (Math.random() - 0.5) * 140, vy: 280 + Math.random() * 180, angle: 0, va: (Math.random() - 0.5) * 7, kind: k, sky: true, popped: false, sleep: 0 })
      }
    } else {
      s.meteorCd -= dt
      if (s.meteorCd <= 0 && s.level >= 3) { s.meteorT = 2.4; s.meteorCd = 22 + Math.random() * 20; ev.push({ type: 'meteor' }) }
    }
  }

  // Gimmick (solo): windvlaag mid-vlucht — de wind draait plots, de baan wordt onvoorspelbaar.
  if (s.mode === 'solo' && s.phase === 'fly' && s.ball) {
    s.gustT -= dt
    if (s.gustT <= 0) {
      s.gustT = 0.7 + Math.random() * 0.9
      s.wind = (Math.random() * 2 - 1) * WIND_MAX * (s.modifier === 'windy' ? 1.6 : 1)
      ev.push({ type: 'gust', wind: s.wind })
    }
  }

  // Zwart gat (magnet-power): zuigt koppen, kisten én het projectiel naar zich toe; dooft daarna uit.
  if (s.blackhole) {
    const bh = s.blackhole
    bh.t -= dt
    const pull = (o: { x: number; y: number; vx: number; vy: number }) => {
      const dx = bh.x - o.x, dy = bh.y - o.y
      const d = Math.hypot(dx, dy) || 1
      if (d > 300) return
      const f = (1 - d / 300) * 2600 * dt
      o.vx += (dx / d) * f; o.vy += (dy / d) * f
    }
    if (s.ball?.live) pull(s.ball)
    for (const sh of s.shards) if (sh.live) pull(sh)
    for (const b of s.bodies) { if (b.popped || b.fixed || b.float) continue; wake(b); pull(b) }
    if (bh.t <= 0) s.blackhole = null
  }

  // ── Projectielen (primair + eventuele split-scherven) ────────────────────────
  if (s.ball) { moveBall(s, s.ball, dt, ev); if (!s.ball.live) s.ball = null }
  for (const sh of s.shards) if (sh.live) moveBall(s, sh, dt, ev)
  s.shards = s.shards.filter((sh) => sh.live)
  if (s.phase === 'fly' && !s.ball && s.shards.length === 0) { // alle koppen tot rust → combo + beurt afronden
    if (s.shotPops >= 3) { ev.push({ type: 'combo', n: s.shotPops }); if (s.mode === 'solo') s.score[0] += s.shotPops * 200 * (s.modifier === 'double' ? 2 : 1); else if (s.mode === 'tower') s.score[s.turn] += s.shotPops }
    s.phase = 'settle'; s.settleT = 0
  }

  // ── Bodies ────────────────────────────────────────────────────────────────────
  // Patrouillerende koppen schuiven horizontaal heen en weer op hun rail (zweven, geen zwaartekracht).
  for (const b of s.bodies) {
    if (b.popped || !b.patrol) continue
    b.x += b.patrol * dt
    if (b.patX0 !== undefined && Math.abs(b.x - b.patX0) > 150) { b.x = b.patX0 + Math.sign(b.x - b.patX0) * 150; b.patrol = -b.patrol }
    if (b.x < 470 || b.x > W - 40) b.patrol = -b.patrol
  }
  for (const b of s.bodies) {
    if (b.popped || b.fixed || b.float || b.sleep > 0.6) continue
    b.vy += s.grav * dt
    b.x += b.vx * dt; b.y += b.vy * dt; b.angle += b.va * dt; b.va *= 0.92
    if (b.y + b.h / 2 > GROUND_Y) {
      const onPad = s.pads.some((p) => Math.abs(b.x - p.x) < p.w / 2)
      b.y = GROUND_Y - b.h / 2
      if (onPad && b.vy > 160) { b.vy = -b.vy * 0.82 - 120; b.va += (Math.random() - 0.5) * 6; ev.push({ type: 'bounce', x: b.x, y: GROUND_Y }) } // trampoline kaatst 'm terug omhoog
      else { if (Math.abs(b.vy) > 240) ev.push({ type: 'thud', x: b.x, y: b.y, power: Math.abs(b.vy) }); b.vy = 0; b.vx *= 0.72; b.va *= 0.6 }
    }
    if (b.x < b.w / 2) { b.x = b.w / 2; b.vx = Math.abs(b.vx) * 0.3 }
    if (b.x > W - b.w / 2) { b.x = W - b.w / 2; b.vx = -Math.abs(b.vx) * 0.3 }
  }
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < s.bodies.length; i++) {
      for (let j = i + 1; j < s.bodies.length; j++) {
        const a = s.bodies[i], b = s.bodies[j]
        if (a.popped || b.popped || a.fixed || b.fixed || a.float || b.float) continue
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x)
        const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y)
        if (ox <= 0 || oy <= 0) continue
        wake(a); wake(b)
        if (ox < oy) {
          const push = (a.x < b.x ? -1 : 1) * ox / 2
          a.x += push; b.x -= push
          const rel = a.vx - b.vx; a.vx -= rel * 0.5; b.vx += rel * 0.5
        } else {
          const push = (a.y < b.y ? -1 : 1) * oy / 2
          a.y += push; b.y -= push
          const rel = a.vy - b.vy; a.vy -= rel * 0.5; b.vy += rel * 0.5
          const crush = Math.abs(rel)
          if (crush > 300) {
            const owner = s.ball?.owner ?? s.turn
            for (const t of [a, b]) {
              if (t.popped) continue
              if (t.kind === 'tnt') explode(s, t.x, t.y, owner, ev)
              else if (t.kind === 'ice') { t.popped = true; ev.push({ type: 'shatter', x: t.x, y: t.y }) }
              else popTarget(s, t, owner, ev)
            }
          }
        }
      }
    }
  }
  for (const b of s.bodies) {
    if (b.popped || b.fixed) continue
    if (Math.hypot(b.vx, b.vy) < 8 && Math.abs(b.va) < 0.3) b.sleep += dt; else b.sleep = 0
    if (b.sleep > 0.6) { b.vx = 0; b.vy = 0; b.va = 0 }
  }

  // ── Win/verlies bepalen ──────────────────────────────────────────────────────
  if (s.mode === 'solo') {
    if (targetsLeft(s) === 0) { s.phase = 'cleared'; s.score[0] += (1000 + s.ammo[0].length * 250) * (s.modifier === 'double' ? 2 : 1); ev.push({ type: 'cleared' }); return ev }
  } else if (s.mode === 'tower') {
    if (targetsLeft(s) === 0) { s.phase = 'won'; s.winner = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1; ev.push({ type: 'won', winner: s.winner }); return ev }
  } else { // duel
    if (s.hits[0] >= DUEL_WINS || s.hits[1] >= DUEL_WINS) { s.phase = 'won'; s.winner = s.hits[0] >= DUEL_WINS ? 0 : 1; ev.push({ type: 'won', winner: s.winner }); return ev }
  }

  // ── Beurt afronden ───────────────────────────────────────────────────────────
  if (s.phase === 'settle') {
    s.settleT += dt
    const asleep = s.bodies.every((b) => b.popped || b.fixed || b.sleep > 0.4)
    if (s.settleT > 1.4 || asleep) {
      if (s.mode === 'solo') {
        if (s.ammo[0].length > 0) s.phase = 'aim'
        else { s.phase = 'failed'; ev.push({ type: 'failed' }) }
      } else if (s.mode === 'duel') {
        // Miss → herstel de cover + beurt naar de andere speler.
        buildBodies(s)
        s.turn = (1 - s.turn) as 0 | 1
        s.phase = 'aim'
      } else {
        const nxt = nextShooter(s, s.turn)
        if (nxt === -1) { s.phase = 'won'; s.winner = s.mode === 'tower' ? (s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1) : -1; ev.push({ type: 'won', winner: s.winner }) }
        else { s.turn = nxt; s.phase = 'aim' }
      }
    }
  }
  return ev
}
