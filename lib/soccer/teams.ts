import { PITCH_LENGTH, PITCH_WIDTH, PLAYERS_PER_TEAM, STREAKER_MIN_GAP } from './constants'
import type { GameState, PlayerState, PlayerTraits, Role, TeamId, TeamMeta } from './types'
import type { Vec2 } from './vec'

// Default-speler-gezicht (fallback als een speler geen gezicht heeft).
export const DEFAULT_FACE = 'default.png'

// ── Tenue-palet ────────────────────────────────────────────────────────────
export type Kit = { id: string; label: string; shirt: string; trim: string; keeper: string }
export const KITS: Kit[] = [
  { id: 'goud', label: 'Goud', shirt: '#F4B92E', trim: '#1B1300', keeper: '#111418' },
  { id: 'blauw', label: 'Blauw', shirt: '#2D6BE5', trim: '#0A1A3A', keeper: '#E63946' },
  { id: 'rood', label: 'Rood', shirt: '#E63946', trim: '#2A0206', keeper: '#2EA84B' },
  { id: 'groen', label: 'Groen', shirt: '#2EA84B', trim: '#06301A', keeper: '#F4B92E' },
  { id: 'paars', label: 'Paars', shirt: '#7C3AED', trim: '#1E0A3A', keeper: '#F4B92E' },
  { id: 'zwart', label: 'Zwart', shirt: '#2B2F38', trim: '#000000', keeper: '#E63946' },
  { id: 'oranje', label: 'Oranje', shirt: '#E8641C', trim: '#3A1400', keeper: '#111418' },
  { id: 'wit', label: 'Wit', shirt: '#ECECEC', trim: '#1A2536', keeper: '#E63946' },
  { id: 'lichtblauw', label: 'Lichtblauw', shirt: '#4FA8E0', trim: '#0A2A44', keeper: '#E8641C' },
  { id: 'roze', label: 'Roze', shirt: '#E8519A', trim: '#3A0A22', keeper: '#111418' },
  { id: 'turquoise', label: 'Turquoise', shirt: '#1FB6A6', trim: '#04302B', keeper: '#E63946' },
  { id: 'bordeaux', label: 'Bordeaux', shirt: '#7A1F2B', trim: '#1A0206', keeper: '#F4B92E' },
]
export const kitById = (id: string): Kit => KITS.find((k) => k.id === id) ?? KITS[0]

export type TeamColors = { shirt: string; trim: string; keeper: string }

// Landen-presets (naam + vlag + tenuekleuren) om snel een landenteam te kiezen.
export type Country = { name: string; short: string; flag: string; shirt: string; trim: string; keeper: string }
export const COUNTRIES: Country[] = [
  { name: 'Nederland', short: 'NED', flag: '🇳🇱', shirt: '#E4610F', trim: '#0A1A3A', keeper: '#111418' },
  { name: 'België', short: 'BEL', flag: '🇧🇪', shirt: '#E30613', trim: '#111111', keeper: '#FFD100' },
  { name: 'Duitsland', short: 'DUI', flag: '🇩🇪', shirt: '#ECECEC', trim: '#111111', keeper: '#111418' },
  { name: 'Frankrijk', short: 'FRA', flag: '🇫🇷', shirt: '#1E3A8A', trim: '#0A1024', keeper: '#E30613' },
  { name: 'Spanje', short: 'SPA', flag: '🇪🇸', shirt: '#C60B1E', trim: '#2A0206', keeper: '#F4B92E' },
  { name: 'Italië', short: 'ITA', flag: '🇮🇹', shirt: '#1E5AA8', trim: '#0A1A3A', keeper: '#2EA84B' },
  { name: 'Engeland', short: 'ENG', flag: '🏴', shirt: '#EDEDED', trim: '#CE1124', keeper: '#1E3A8A' },
  { name: 'Portugal', short: 'POR', flag: '🇵🇹', shirt: '#C8102E', trim: '#06301A', keeper: '#2EA84B' },
  { name: 'Brazilië', short: 'BRA', flag: '🇧🇷', shirt: '#F7D417', trim: '#1B7A3D', keeper: '#1E3A8A' },
  { name: 'Argentinië', short: 'ARG', flag: '🇦🇷', shirt: '#75AADB', trim: '#0A1A3A', keeper: '#111418' },
  { name: 'Kroatië', short: 'KRO', flag: '🇭🇷', shirt: '#C8102E', trim: '#111111', keeper: '#1E3A8A' },
  { name: 'Marokko', short: 'MAR', flag: '🇲🇦', shirt: '#B01E28', trim: '#06301A', keeper: '#2EA84B' },
  { name: 'Japan', short: 'JAP', flag: '🇯🇵', shirt: '#0B3EA0', trim: '#0A1024', keeper: '#E63946' },
  { name: 'Mexico', short: 'MEX', flag: '🇲🇽', shirt: '#0A7D3B', trim: '#04301A', keeper: '#E63946' },
  { name: 'Nigeria', short: 'NGA', flag: '🇳🇬', shirt: '#12A150', trim: '#04301A', keeper: '#ECECEC' },
  { name: 'Verenigde Staten', short: 'USA', flag: '🇺🇸', shirt: '#1B2A6B', trim: '#7A1220', keeper: '#ECECEC' },
  { name: 'Zwitserland', short: 'SUI', flag: '🇨🇭', shirt: '#D52B1E', trim: '#2A0206', keeper: '#111418' },
  { name: 'Senegal', short: 'SEN', flag: '🇸🇳', shirt: '#0B9444', trim: '#7A1220', keeper: '#F4B92E' },
  { name: 'Zuid-Korea', short: 'KOR', flag: '🇰🇷', shirt: '#C8102E', trim: '#0A1A3A', keeper: '#111418' },
  { name: 'Denemarken', short: 'DEN', flag: '🇩🇰', shirt: '#C60C30', trim: '#2A0206', keeper: '#111418' },
]

// ── Spelerspool (kiesbare gezichten uit /public/spelers) ─────────────────────
// Elke collega heeft een archetype (`tag`) + eigenschappen op 1..5 (pace/shot/tackle).
// Die sturen kleine multipliers in de sim én de AI, zodat teamkeuze er echt toe doet.
export type PoolPlayer = { name: string; face: string; tag: string; traits: PlayerTraits }
// Elke speler telt exact 11 traitpunten op (van 15) → eerlijk; alleen de verdeling verschilt.
export const PLAYER_POOL: PoolPlayer[] = [
  { name: 'Stefan', face: 'steve.png', tag: 'Sluipschutter', traits: { pace: 3, shot: 5, tackle: 3 } },
  { name: 'Julia', face: 'julia.png', tag: 'Spielmacher', traits: { pace: 4, shot: 4, tackle: 3 } },
  { name: 'Jeff', face: 'jeff.png', tag: 'Motor', traits: { pace: 4, shot: 3, tackle: 4 } },
  { name: 'Chris', face: 'chris.png', tag: 'Muur', traits: { pace: 3, shot: 3, tackle: 5 } },
  { name: 'Pim', face: 'pim.png', tag: 'Tank', traits: { pace: 2, shot: 4, tackle: 5 } },
  { name: 'Pawel', face: 'pawel.png', tag: 'Raket', traits: { pace: 5, shot: 3, tackle: 3 } },
  { name: 'Bram', face: 'bram.png', tag: 'Architect', traits: { pace: 2, shot: 5, tackle: 4 } },
  { name: 'Ozair', face: 'ozair.png', tag: 'Terriër', traits: { pace: 4, shot: 2, tackle: 5 } },
  { name: 'Florian', face: 'florian.png', tag: 'Sprinter', traits: { pace: 5, shot: 4, tackle: 2 } },
  { name: 'Athena', face: 'athena.png', tag: 'Ster', traits: { pace: 3, shot: 4, tackle: 4 } },
  { name: 'Jasper', face: 'jasper.png', tag: 'Techneut', traits: { pace: 4, shot: 5, tackle: 2 } },
  { name: 'Corné', face: 'corne.png', tag: 'Goaltjesdief', traits: { pace: 5, shot: 5, tackle: 1 } },
]

// Gemiddeld profiel (AI-landen zonder poolgezicht, of onbekende gezichten).
export const BALANCED_TRAITS: PlayerTraits = { pace: 3, shot: 3, tackle: 3 }
export function traitsForFace(face: string | null | undefined): PlayerTraits {
  if (!face) return BALANCED_TRAITS
  const p = PLAYER_POOL.find((x) => x.face === face)
  return p ? p.traits : BALANCED_TRAITS
}

// Formaties (elk PLAYERS_PER_TEAM=7 plekken; index 0 = keeper).
// anchor genormaliseerd (x: 0 eigen doel → 1 tegenstander, y: 0 boven → 1 onder).
export type FormationSlot = { role: Role; anchor: Vec2 }
export type Formation = { id: string; label: string; slots: FormationSlot[] }
export const FORMATIONS: Formation[] = [
  {
    id: '2-3-1', label: '2-3-1',
    slots: [
      { role: 'GK', anchor: { x: 0.05, y: 0.5 } },
      { role: 'DEF', anchor: { x: 0.24, y: 0.32 } },
      { role: 'DEF', anchor: { x: 0.24, y: 0.68 } },
      { role: 'MID', anchor: { x: 0.48, y: 0.2 } },
      { role: 'MID', anchor: { x: 0.48, y: 0.5 } },
      { role: 'MID', anchor: { x: 0.48, y: 0.8 } },
      { role: 'FWD', anchor: { x: 0.72, y: 0.5 } },
    ],
  },
  {
    id: '3-2-1', label: '3-2-1',
    slots: [
      { role: 'GK', anchor: { x: 0.05, y: 0.5 } },
      { role: 'DEF', anchor: { x: 0.22, y: 0.25 } },
      { role: 'DEF', anchor: { x: 0.2, y: 0.5 } },
      { role: 'DEF', anchor: { x: 0.22, y: 0.75 } },
      { role: 'MID', anchor: { x: 0.5, y: 0.35 } },
      { role: 'MID', anchor: { x: 0.5, y: 0.65 } },
      { role: 'FWD', anchor: { x: 0.74, y: 0.5 } },
    ],
  },
  {
    id: '2-2-2', label: '2-2-2 (2 spitsen)',
    slots: [
      { role: 'GK', anchor: { x: 0.05, y: 0.5 } },
      { role: 'DEF', anchor: { x: 0.24, y: 0.32 } },
      { role: 'DEF', anchor: { x: 0.24, y: 0.68 } },
      { role: 'MID', anchor: { x: 0.48, y: 0.32 } },
      { role: 'MID', anchor: { x: 0.48, y: 0.68 } },
      { role: 'FWD', anchor: { x: 0.72, y: 0.34 } },
      { role: 'FWD', anchor: { x: 0.72, y: 0.66 } },
    ],
  },
  {
    id: '3-1-2', label: '3-1-2 (2 spitsen)',
    slots: [
      { role: 'GK', anchor: { x: 0.05, y: 0.5 } },
      { role: 'DEF', anchor: { x: 0.22, y: 0.25 } },
      { role: 'DEF', anchor: { x: 0.2, y: 0.5 } },
      { role: 'DEF', anchor: { x: 0.22, y: 0.75 } },
      { role: 'MID', anchor: { x: 0.48, y: 0.5 } },
      { role: 'FWD', anchor: { x: 0.72, y: 0.34 } },
      { role: 'FWD', anchor: { x: 0.72, y: 0.66 } },
    ],
  },
]
export const formationById = (id: string): Formation => FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0]

// ── Team-config bouwers ──────────────────────────────────────────────────────
export function deriveShort(name: string): string {
  // Bekend land? gebruik z'n officiële 3-letter code.
  const c = COUNTRIES.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  if (c) return c.short
  const letters = name.replace(/[^A-Za-z0-9]/g, '')
  return (letters.slice(0, 3) || 'TM').toUpperCase()
}

// Maak een TeamMeta uit naam + kleuren + opstelling (per plek een speler; lege plekken
// worden aangevuld met ONGEBRUIKTE spelers → nooit dubbele spelers) + formatie-id.
// `traitsByFace` (optioneel) overschrijft de standaard-traits per gezicht (custom teams).
export function buildTeamMeta(name: string, colors: TeamColors, lineup: (PoolPlayer | null)[], formationId: string, traitsByFace?: Record<string, PlayerTraits>): TeamMeta {
  const used = new Set(lineup.filter((p): p is PoolPlayer => !!p).map((p) => p.face))
  const spares = PLAYER_POOL.filter((p) => !used.has(p.face)) // aanvullers, allemaal uniek
  const full: { name: string; face: string | null; traits?: PlayerTraits }[] = []
  let si = 0
  for (let i = 0; i < PLAYERS_PER_TEAM; i++) {
    const p = lineup[i] ?? spares[si++] ?? PLAYER_POOL[i % PLAYER_POOL.length]
    full.push({ name: p.name, face: p.face, traits: (p.face && traitsByFace?.[p.face]) || p.traits })
  }
  const country = COUNTRIES.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  return {
    name: name.trim() || 'Team',
    short: deriveShort(name),
    flag: country?.flag,
    shirt: colors.shirt,
    trim: colors.trim,
    keeper: colors.keeper,
    formation: formationById(formationId).id,
    players: full,
  }
}

// Waarneembare kleur-afstand (grove, iets naar waarneming gewogen RGB-metriek).
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db)
}
// Onder deze afstand lijken twee shirts te veel op elkaar (bijv. rood ↔ oranje, twee blauwen).
export const KIT_MIN_DIST = 200

// Geef `meta` een contrasterend shirt als z'n kleur te dicht bij `otherShirt` ligt.
// Kiest uit KITS het tenue dat het VERST van `otherShirt` af staat (naam/vlag blijven).
export function ensureDistinctKit(meta: TeamMeta, otherShirt: string): TeamMeta {
  if (colorDistance(meta.shirt, otherShirt) >= KIT_MIN_DIST) return meta
  let best = KITS[0]
  let bestD = -1
  for (const k of KITS) {
    const d = colorDistance(k.shirt, otherShirt)
    if (d > bestD) { bestD = d; best = k }
  }
  return { ...meta, shirt: best.shirt, trim: best.trim, keeper: best.keeper }
}

// Willekeurig AI-team (willekeurig land + formatie), met een shirt dat duidelijk
// afwijkt van `excludeShirt` (recolort naar een contrasterend tenue als 't te dicht ligt).
export function randomAiTeam(excludeShirt: string): TeamMeta {
  const c = COUNTRIES[(Math.random() * COUNTRIES.length) | 0] ?? COUNTRIES[0]
  const pool = [...PLAYER_POOL].sort(() => Math.random() - 0.5).slice(0, PLAYERS_PER_TEAM)
  const form = FORMATIONS[(Math.random() * FORMATIONS.length) | 0]
  return ensureDistinctKit(buildTeamMeta(c.name, c, pool, form.id), excludeShirt)
}

// Aanvalsrichting (langs x) van een team, gegeven de huidige helft-oriëntatie.
export function teamDir(team: TeamId, attackDir: 1 | -1): 1 | -1 {
  return (team === 0 ? attackDir : (-attackDir as 1 | -1))
}

// Anker → wereldpositie voor een team, rekening houdend met aanvalsrichting.
export function anchorToWorld(anchor: Vec2, team: TeamId, attackDir: 1 | -1): Vec2 {
  const d = teamDir(team, attackDir)
  const ownGoalX = d > 0 ? 0 : PITCH_LENGTH
  return { x: ownGoalX + d * anchor.x * PITCH_LENGTH, y: anchor.y * PITCH_WIDTH }
}

function makeTeam(team: TeamId, attackDir: 1 | -1, meta: TeamMeta): PlayerState[] {
  return formationById(meta.formation).slots.map((f, i) => {
    const sel = meta.players[i] ?? meta.players[i % Math.max(1, meta.players.length)] ?? { name: 'Speler', face: DEFAULT_FACE }
    const pos = anchorToWorld(f.anchor, team, attackDir)
    const d = teamDir(team, attackDir)
    return {
      id: team * PLAYERS_PER_TEAM + i,
      team,
      role: f.role,
      name: sel.name || `Speler ${i + 1}`,
      face: sel.face ?? DEFAULT_FACE,
      anchor: { ...f.anchor },
      traits: sel.traits ?? traitsForFace(sel.face),
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      facing: { x: d, y: 0 },
      kickCooldown: 0,
      charge: 0,
      stamina: 1,
      slideTimer: 0,
      slideTackle: false,
      feintTimer: 0,
      tumbleTimer: 0,
      tackleCooldown: 0,
      yellow: false,
      sentOff: false,
    }
  })
}

// Verse wedstrijd-state met custom team-config. attackDir=+1 → team 0 valt aan naar rechts.
export function createInitialState(humanTeam: TeamId, halfLengthSec: number, teamA: TeamMeta, teamB: TeamMeta): GameState {
  const attackDir: 1 | -1 = 1
  const players = [...makeTeam(0, attackDir, teamA), ...makeTeam(1, attackDir, teamB)]
  return {
    players,
    ball: {
      pos: { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 },
      vel: { x: 0, y: 0 },
      z: 0,
      vz: 0,
      lastTouch: -1,
      prevTouch: -1,
      spin: 0,
    },
    score: [0, 0],
    teams: [teamA, teamB],
    ref: { pos: { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 - 60 }, vel: { x: 0, y: 0 }, tumble: 0 },
    streaker: null,
    extraStreakers: [],
    streakerCooldown: STREAKER_MIN_GAP,
    security: null,
    wind: { x: 0, y: 0 },
    weather: 'clear',
    windTarget: { x: 0, y: 0 },
    weatherTimer: 6,
    surface: 'gras',
    ballScale: 1,
    bigHeads: false,
    slippery: false,
    stats: { shots: [0, 0], tackles: [0, 0], pannas: [0, 0], possMs: [0, 0] },
    cards: [],
    foulCount: 0,
    foulCooldown: 0,
    foulStreak: 0,
    foulStreakTimer: 0,
    pendingFoul: null,
    tackleCount: 0,
    saveCount: 0,
    pannaCount: 0,
    bicycleCount: 0,
    lastGoalKind: 'normal',
    restartKind: null,
    goals: [],
    phase: 'kickoff',
    phaseTimer: 0,
    clock: 0,
    half: 1,
    halfLengthSec,
    startKickoffTeam: humanTeam,
    kickoffTeam: humanTeam,
    attackDir,
    prevKick: players.map(() => false),
    prevSlide: players.map(() => false),
    prevChip: players.map(() => false),
    prevFeint: players.map(() => false),
    controlled: -1,
    lastGoalBy: null,
  }
}
