'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import ImmersiveToggle from './immersive-toggle'
import {
  FIXED_DT, MAX_STEPS_PER_FRAME, CONTROL_RADIUS, PLAYER_RADIUS, MAX_CHARGE_TIME,
  PLAYERS_PER_TEAM, SLOWMO_TIME,
} from '@/lib/soccer/constants'
import {
  createInitialState, KITS, COUNTRIES, PLAYER_POOL, FORMATIONS, formationById, buildTeamMeta, randomAiTeam, ensureDistinctKit,
  type PoolPlayer, type TeamColors,
} from '@/lib/soccer/teams'
import { placeForKickoff, startSecondHalf, nearestTeammateToBall, step, debugSpawnStreaker, debugCard, debugGoal } from '@/lib/soccer/sim'
import { computeAICommands } from '@/lib/soccer/ai'
import { PixiSoccerRenderer } from '@/lib/soccer/pixi-renderer'
import { KeyboardInput, DEFAULT_BINDINGS, KB_LEFT_BINDINGS, KB_RIGHT_BINDINGS, loadBindings, saveBindings, activeGamepad, connectedGamepadCount, type Bindings, type ActionId } from '@/lib/soccer/input'
import { SoccerNet, buildSnapshot, lerpSnapshotInto, makeRoomCode, type Snapshot, type RosterMember, type SlotAssign } from '@/lib/soccer/net'
import type { GameState, InputCommand, PlayerTraits, TeamId, TeamMeta } from '@/lib/soccer/types'
import { dist } from '@/lib/soccer/vec'

type Stage = 'menu' | 'match' | 'penalty'
type Mode = 'local' | 'local2p' | 'coop' | 'local2v2' | 'online' | 'penalty'
// Toetsenbord-links (WASD) / toetsenbord-rechts (pijltjes) / controller 1-4.
type InputDevice = 'kbL' | 'kbR' | 'pad1' | 'pad2' | 'pad3' | 'pad4'
const DEVICE_IDS: InputDevice[] = ['kbL', 'kbR', 'pad1', 'pad2', 'pad3', 'pad4']
// Metadata voor de apparaat-kiezer (icoon + duidelijke uitleg i.p.v. cryptische pijltjes).
// pad = gamepad-index (undefined voor toetsenbord) → we tonen alleen verbonden controllers.
const DEVICE_META: { id: InputDevice; icon: string; label: string; sub: string; pad?: number }[] = [
  { id: 'kbL', icon: '⌨️', label: 'Toetsenbord', sub: 'WASD-kant' },
  { id: 'kbR', icon: '⌨️', label: 'Toetsenbord', sub: 'Pijltjes-kant' },
  { id: 'pad1', icon: '🎮', label: 'Controller 1', sub: 'Gamepad', pad: 0 },
  { id: 'pad2', icon: '🎮', label: 'Controller 2', sub: 'Gamepad', pad: 1 },
  { id: 'pad3', icon: '🎮', label: 'Controller 3', sub: 'Gamepad', pad: 2 },
  { id: 'pad4', icon: '🎮', label: 'Controller 4', sub: 'Gamepad', pad: 3 },
]
// Multiplayer-modi als leesbare kaartjes (i.p.v. een propvolle 4-weg-segment). Standaard = 1v1.
const MP_MODES: { id: Mode; label: string; desc: string }[] = [
  { id: 'local2p', label: '1v1', desc: '2 spelers, zelfde pc' },
  { id: 'coop', label: 'Co-op', desc: 'Samen vs computer' },
  { id: 'local2v2', label: '2v2', desc: '4 spelers, zelfde pc' },
  { id: 'online', label: 'Online', desc: 'Op afstand' },
]
// Apparaat → een input-bron. kbL/kbR = vaste toetsenbordhelft; padX = alleen die controller.
function makePlayerInput(device: InputDevice): KeyboardInput {
  if (device === 'kbL') return new KeyboardInput(KB_LEFT_BINDINGS, { keyboard: true, padIndex: -1 })
  if (device === 'kbR') return new KeyboardInput(KB_RIGHT_BINDINGS, { keyboard: true, padIndex: -1 })
  const idx = device === 'pad1' ? 0 : device === 'pad2' ? 1 : device === 'pad3' ? 2 : 3
  return new KeyboardInput(loadBindings(), { keyboard: false, padIndex: idx })
}
type Lobby = 'idle' | 'hosting' | 'joining' | 'hosting2v2' | 'joining2v2'
type Role = 'host' | 'guest' | null
type Overlay = null | 'goal' | 'halftime' | 'fulltime'
type Scorer = { team: TeamId; name: string; ownGoal: boolean; clock: number; half: number; face?: string | null }
// Kaart op de tijdlijn (rust/eind): geel of rood, met speler + foto.
type TlCard = { team: TeamId; name: string; face: string | null; red: boolean; secondYellow: boolean; clock: number; half: number }
type MatchStats = { possPct: [number, number]; shots: [number, number]; tackles: [number, number]; pannas: [number, number] }
type Mvp = { name: string; face: string | null; team: TeamId; line: string }
type PanelInfo = { title: string; score: [number, number]; result?: 'win' | 'loss' | 'draw'; scorers: Scorer[]; cards: TlCard[]; halfLen: number; note?: string; motm?: Mvp; stats?: MatchStats }
type GoalInfo = { name: string; teamName: string; face: string | null; team: TeamId; ownGoal: boolean; color: string; kind: 'normal' | 'screamer' | 'owngoal' }

const GOAL_SOUNDS = ['/sfx/goal.mp3', '/sfx/goal2.mp3', '/sfx/goal3.mp3']
const KICK_SOUNDS = ['/sfx/kick.mp3']       // trap/pass-plof (Steve levert clips; werkt stil tot dan)
const WHISTLE_SOUNDS = ['/sfx/whistle.mp3'] // scheidsfluit (aftrap/overtreding/rust/eind)
const TACKLE_SOUNDS = ['/sfx/tackle.mp3']   // dreun bij een sliding-tackle die iemand omver loopt
const YELLOWCARD_SOUNDS = ['/sfx/yellowcard.mp3'] // bij een gele kaart
const REDCARD_SOUNDS = ['/sfx/redcard.mp3']       // bij een rode kaart
// Voorgeladen audio-pool → geen decode-vertraging bij de eerste keer (bijv. de kaartfluit).
const audioPool = new Map<string, HTMLAudioElement>()
function primeSound(src: string) {
  if (typeof window === 'undefined' || audioPool.has(src)) return
  try { const a = new Audio(); a.preload = 'auto'; a.src = src; a.load(); audioPool.set(src, a) } catch { /* geen audio */ }
}
function playSound(srcs: string[], volume = 0.8) {
  if (typeof window === 'undefined' || srcs.length === 0) return
  const src = srcs[Math.floor(Math.random() * srcs.length)]
  try {
    const base = audioPool.get(src)
    // Hergebruik het voorgeladen element als 't vrij is (direct af); anders een kloon voor overlap.
    const a = base && base.paused ? base : new Audio(src)
    if (a === base) a.currentTime = 0
    else if (!audioPool.has(src)) audioPool.set(src, a)
    a.volume = volume
    void a.play().catch(() => {})
  } catch {
    /* geen audio beschikbaar */
  }
}

// ── Commentaar-quips (naam-bewust, luchtig — het is een spel onder collega's) ──────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
function goalQuip(name: string, team: string, kind: 'normal' | 'screamer' | 'owngoal'): string {
  if (kind === 'owngoal') return pick([`😅 EIGEN GOAL van ${name}! ${team} lacht in z'n vuistje.`, `🙈 ${name} verlengt 'm in eigen doel… au.`, `📎 ${name} scoort… aan de verkeerde kant!`])
  if (kind === 'screamer') return pick([`🚀 ${name} met een PEGEL — boven in de kruising!`, `💥 ${name} ramt 'm er vanaf afstand in!`, `😱 Wat een knal van ${name}!`])
  return pick([`⚽ ${name} scoort voor ${team}!`, `🎯 ${name} maakt 'm ijskoud af.`, `🔥 ${name}!! Daar is de goal.`, `🙌 ${name} tekent voor de treffer.`])
}
function cardQuip(name: string, red: boolean): string {
  return red
    ? pick([`🟥 ROOD! ${name} mag gaan douchen 🚿`, `🟥 ${name} vliegt eruit — dat was 'm.`, `🟥 Rode kaart voor ${name}. Domme actie.`])
    : pick([`🟨 Geel voor ${name}. Even dimmen.`, `🟨 ${name} op de bon.`, `🟨 De ref waarschuwt ${name}.`])
}
const PANNA_QUIPS = ['🪄 PANNA! Door de benen — meedogenloos 💀', '🪄 Poortje! Iemand een pleister?', '🪄 PANNA! Dat doet pijn.']
const SAVE_QUIPS = ['🧤 REDDING! Van de lijn gehaald.', '🧤 Wat een keeper!', '🧤 Gepareerd — sterk werk.']
const STREAKER_QUIPS = ['🏃 Een veldbestormer! Beveiliging, actie!', '🏃 Wie liet die los?!', '🏃 Streaker op het veld 😳']
const FOUL_QUIPS = ['😤 Overtreding! De ref fluit.', '🦵 Daar gaat-ie neer — vrije trap.', '😬 Dat mag niet, hoor.']
// Loopend omgevingsgeluid (publiek / regen). Faalt stil als het bestand ontbreekt.
function startLoop(src: string, volume: number): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  try {
    const a = new Audio(src)
    a.loop = true
    a.volume = volume
    void a.play().catch(() => {})
    return a
  } catch {
    return null
  }
}

// Vaste wedstrijdhelft: 2 minuten (versneld → ~een volledige pot). Niet meer instelbaar.
const HALF_SEC = 120
const DIFFICULTY = [
  { label: '🔥', val: 0.35 },
  { label: '🔥🔥', val: 0.6 },
  { label: '🔥🔥🔥', val: 0.85 },
]

const RESTART_LABEL: Record<string, string> = {
  throwin: 'Ingooi',
  corner: 'Hoekschop',
  goalkick: 'Doeltrap',
  freekick: 'Vrije trap',
}

const SETUP_KEY = 'kopstukken:setup:v1' // lokaal bewaarde team-setup + settings
const TRAITS_KEY = 'kopstukken:traits:v1' // lokaal aangepaste speler-traits (face → {pace,shot,tackle})
const TRAIT_BUDGET = 11 // vaste puntensom per speler (eerlijk)
const defaultTraitsFor = (face: string): PlayerTraits => PLAYER_POOL.find((p) => p.face === face)?.traits ?? { pace: 3, shot: 3, tackle: 3 }
const RESULTS_KEY = 'kopstukken:results:v1' // lokale geschiedenis van gespeelde wedstrijden
type MatchResult = {
  a: string; b: string; ca: string; cb: string; sa: number; sb: number; pens?: 0 | 1; ts: number
  // Uitgebreid (nieuwe wedstrijden) → voedt de Erelijst. Oude entries missen dit; val netjes terug.
  na?: string; nb?: string // volledige teamnamen
  you?: 0 | 1              // welke kant de mens speelde (0 = links/team A)
  sc?: { n: string; t: 0 | 1 }[] // doelpuntenmakers (naam + team), eigen goals uitgezonderd
  mvp?: string             // man of the match
}

// Erelijst: verdicht de lokale wedstrijdgeschiedenis tot carrière-stats vanuit JOUW perspectief.
// Oude entries zonder `you`/`sc` vallen netjes terug (you=0, geen scorers).
type Career = {
  played: number; w: number; d: number; l: number; gf: number; ga: number
  winStreak: number
  biggest: { text: string } | null
  topScorers: [string, number][]
  nemesis: { name: string; l: number } | null
}
function computeCareer(results: MatchResult[]): Career {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0
  let biggest: { margin: number; text: string } | null = null
  const scorerTally = new Map<string, number>()
  const oppTally = new Map<string, { p: number; w: number; l: number }>()
  // Uitslag vanuit jouw kant, inclusief strafschoppen-beslissing bij gelijkspel.
  const outcomes: ('w' | 'd' | 'l')[] = [] // in opslagvolgorde (nieuwste eerst)
  for (const r of results) {
    const you: 0 | 1 = r.you ?? 0
    const mine = you === 0 ? r.sa : r.sb
    const opp = you === 0 ? r.sb : r.sa
    gf += mine; ga += opp
    let res: 'w' | 'd' | 'l'
    if (mine > opp) res = 'w'
    else if (mine < opp) res = 'l'
    else res = r.pens === undefined ? 'd' : (r.pens === you ? 'w' : 'l')
    outcomes.push(res)
    if (res === 'w') w++; else if (res === 'l') l++; else d++
    const oppName = (you === 0 ? (r.nb ?? r.b) : (r.na ?? r.a)) || '?'
    if (res === 'w' && (!biggest || mine - opp > biggest.margin)) biggest = { margin: mine - opp, text: `${mine}–${opp} vs ${oppName}` }
    for (const g of r.sc ?? []) if (g.t === you) scorerTally.set(g.n, (scorerTally.get(g.n) ?? 0) + 1)
    const o = oppTally.get(oppName) ?? { p: 0, w: 0, l: 0 }
    o.p++; if (res === 'w') o.w++; else if (res === 'l') o.l++
    oppTally.set(oppName, o)
  }
  // Langste zegereeks: chronologisch = omgekeerde opslagvolgorde.
  let streak = 0, best = 0
  for (let i = outcomes.length - 1; i >= 0; i--) { if (outcomes[i] === 'w') { streak++; best = Math.max(best, streak) } else streak = 0 }
  const topScorers = [...scorerTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const nemEntry = [...oppTally.entries()].filter(([, o]) => o.l > 0).sort((a, b) => b[1].l - a[1].l)[0]
  return {
    played: results.length, w, d, l, gf, ga, winStreak: best,
    biggest: biggest ? { text: biggest.text } : null,
    topScorers,
    nemesis: nemEntry ? { name: nemEntry[0], l: nemEntry[1].l } : null,
  }
}

const SNAPSHOT_EVERY = 3
const GUEST_SEND_MS = 33
const RENDER_DELAY_MS = 110

// Volgende veldspeler (op id) van hetzelfde team — voor handmatig wisselen met X.
function cycleTeammate(s: GameState, team: TeamId, cur: number): number {
  const mates = s.players.filter((p) => p.team === team && p.role !== 'GK' && !p.sentOff).map((p) => p.id).sort((a, b) => a - b)
  if (!mates.length) return cur
  const i = mates.indexOf(cur)
  return mates[(i + 1) % mates.length]
}

// Voorkomt de "dubbele tackle": als de controle (auto-)wisselt naar een andere speler terwijl
// Q/E/R al ingedrukt is, zou die nieuwe speler meteen een edge-actie doen (slide/stift/kap).
// We zaaien daarom prevSlide/prevChip/prevFeint = true bij een wissel → pas een VERSE druk telt.
function seedEdgesOnSwitch(
  s: GameState,
  id: number,
  cmd: InputCommand,
  prevRef: { current: number },
) {
  if (id === prevRef.current) return
  prevRef.current = id
  if (id < 0) return
  if (cmd.slide) s.prevSlide[id] = true
  if (cmd.chip) s.prevChip[id] = true
  if (cmd.feint) s.prevFeint[id] = true
}

function pickControlledForTeam(s: GameState, team: TeamId, curId: number): number {
  const b = s.ball
  // De keeper blijft altijd AI-bestuurd (je krijgt 'm nooit onder de knop → geen "verkeerde kant op").
  const curP = curId >= 0 ? s.players[curId] : null
  const nearest = nearestTeammateToBall(s, team)
  if (!curP || curP.team !== team || curP.role === 'GK' || curP.sentOff) return nearest
  if (dist(curP.pos, b.pos) < CONTROL_RADIUS + PLAYER_RADIUS) return curId
  if (nearest >= 0 && nearest !== curId) {
    const dN = dist(s.players[nearest].pos, b.pos)
    const dC = dist(curP.pos, b.pos)
    if (dN + 20 < dC) return nearest
  }
  return curId
}

// Co-op besturing: dichtstbijzijnde veldspeler van `team` bij de bal, maar NOOIT de speler die de
// andere mens (`otherId`) al bestuurt. Hysterese zoals bij pickControlledForTeam.
function pickCoop(s: GameState, team: TeamId, curId: number, otherId: number): number {
  const b = s.ball
  let nearest = -1
  let nd = Infinity
  for (const p of s.players) {
    if (p.team !== team || p.role === 'GK' || p.sentOff || p.id === otherId) continue
    const d = dist(p.pos, b.pos)
    if (d < nd) { nd = d; nearest = p.id }
  }
  const cur = curId >= 0 ? s.players[curId] : null
  if (!cur || cur.team !== team || cur.role === 'GK' || cur.sentOff || cur.id === otherId) return nearest
  if (dist(cur.pos, b.pos) < CONTROL_RADIUS + PLAYER_RADIUS) return curId
  if (nearest >= 0 && nearest !== curId) {
    const dN = dist(s.players[nearest].pos, b.pos)
    const dC = dist(cur.pos, b.pos)
    if (dN + 20 < dC) return nearest
  }
  return curId
}

export default function SoccerClient() {
  const router = useRouter()
  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/poules')
  }

  const [stage, setStage] = useState<Stage>('menu')
  const [mode, setMode] = useState<Mode>('local')
  // Lokaal 2-spelers: welk apparaat elke speler gebruikt (toetsenbord / controller 1 / controller 2).
  const [p1Device, setP1Device] = useState<InputDevice>('pad1')
  const [p2Device, setP2Device] = useState<InputDevice>('pad2')
  const [p3Device, setP3Device] = useState<InputDevice>('kbL') // alleen 2v2
  const [p4Device, setP4Device] = useState<InputDevice>('kbR') // alleen 2v2
  const [padCount, setPadCount] = useState(0) // reactief aantal verbonden controllers (voor de apparaat-kiezer)
  const [role, setRole] = useState<Role>(null)
  const [lobby, setLobby] = useState<Lobby>('idle')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  // Online 2v2 lobby: kamergrootte (2 = 1v1, 4 = 2v2) + roster + team-toewijzing per peer.
  const [onlineSize, setOnlineSize] = useState<2 | 4>(2)
  const [lobbyMembers, setLobbyMembers] = useState<RosterMember[]>([])
  const [teamAssign, setTeamAssign] = useState<Record<string, 0 | 1>>({}) // host: peerId → team
  const [myTeam, setMyTeam] = useState<0 | 1 | null>(null) // gast: eigen toegewezen team
  const guestTeamsRef = useRef<Record<string, TeamMeta>>({}) // host: team-config per gast (peerId)
  const slotInputsRef = useRef<Record<number, InputCommand>>({}) // host: laatste input per slot (2v2)
  const mySlotRef = useRef<number>(-1) // gast: eigen slot in 2v2
  const [netMsg, setNetMsg] = useState('')
  const halfSec = HALF_SEC
  const [difficulty, setDifficulty] = useState(0.6)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [tooSmall, setTooSmall] = useState(false)
  const [panelInfo, setPanelInfo] = useState<PanelInfo | null>(null)
  const [goalInfo, setGoalInfo] = useState<GoalInfo | null>(null)
  const [matchTeams, setMatchTeams] = useState<[TeamMeta, TeamMeta] | null>(null)
  const [scoreFlash, setScoreFlash] = useState<[number, number] | null>(null)
  const [setpieceLabel, setSetpieceLabel] = useState<string | null>(null)
  const [cardFlash, setCardFlash] = useState<{ red: boolean; secondYellow: boolean; name: string; teamName: string; n: number } | null>(null)
  const [foulFlash, setFoulFlash] = useState(false)
  const [countdown, setCountdown] = useState<number | 'GO' | null>(null)
  const [hintDone, setHintDone] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Commentaar-feed: korte, naam-bewuste quips die onderin oplopen en vanzelf vervagen.
  const [commentary, setCommentary] = useState<{ id: number; text: string }[]>([])
  const [ready, setReady] = useState(false)
  const [results, setResults] = useState<MatchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [showTraits, setShowTraits] = useState(false)
  const [showMatchSettings, setShowMatchSettings] = useState(false)
  // Zelf aangepaste traits per speler (face → traits); leeg = standaard uit de pool.
  const [customTraits, setCustomTraits] = useState<Record<string, PlayerTraits>>({})
  const traitsFor = useCallback((face: string): PlayerTraits => customTraits[face] ?? defaultTraitsFor(face), [customTraits])
  const [paused, setPaused] = useState(false)
  const [penaltyResult, setPenaltyResult] = useState<{ winner: TeamId; score: [number, number] } | null>(null)
  const matchRecordedRef = useRef<boolean>(false)
  const [shootout, setShootout] = useState(false)
  const [shootoutResult, setShootoutResult] = useState<{ winner: TeamId; score: [number, number] } | null>(null)
  // Team-builder
  const [teamName, setTeamName] = useState('')
  const [kit, setKit] = useState<TeamColors>(() => ({ shirt: KITS[0].shirt, trim: KITS[0].trim, keeper: KITS[0].keeper }))
  const [formationId, setFormationId] = useState('2-3-1')
  const [giantBall, setGiantBall] = useState(false)
  const [bigHeads, setBigHeads] = useState(false)
  const [slippery, setSlippery] = useState(false)
  const [lineup, setLineup] = useState<(PoolPlayer | null)[]>(() => Array.from({ length: PLAYERS_PER_TEAM }, (_, i) => PLAYER_POOL[i % PLAYER_POOL.length]))
  // Opgepakte speler: uit de pool (from=null) of van een veldplek (from=slotindex, voor swap).
  const [picked, setPicked] = useState<{ player: PoolPlayer; from: number | null } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<GameState | null>(null)
  const rendererRef = useRef<PixiSoccerRenderer | null>(null)
  const inputRef = useRef<KeyboardInput | null>(null)
  const controlledRef = useRef<number>(-1)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef<number>(0)
  const accRef = useRef<number>(0)
  const pausedRef = useRef<boolean>(false)
  const difficultyRef = useRef<number>(difficulty)
  const p1DeviceRef = useRef<InputDevice>(p1Device)
  const p2DeviceRef = useRef<InputDevice>(p2Device)
  const p3DeviceRef = useRef<InputDevice>(p3Device)
  const p4DeviceRef = useRef<InputDevice>(p4Device)
  const giantBallRef = useRef<boolean>(giantBall)
  const bigHeadsRef = useRef<boolean>(bigHeads)
  const slipperyRef = useRef<boolean>(slippery)
  const humanTeamRef = useRef<TeamId>(0)
  const overlayRef = useRef<Overlay>(null)
  const score0Ref = useRef<HTMLSpanElement | null>(null)
  const score1Ref = useRef<HTMLSpanElement | null>(null)
  const clockElRef = useRef<HTMLSpanElement | null>(null)
  const powerWrapRef = useRef<HTMLDivElement | null>(null)
  const powerFillRef = useRef<HTMLDivElement | null>(null)
  const staminaFillRef = useRef<HTMLDivElement | null>(null)
  const roleRef = useRef<Role>(null)
  const netRef = useRef<SoccerNet | null>(null)
  const guestInputRef = useRef<InputCommand>({ move: { x: 0, y: 0 }, kick: false })
  const controlledGuestRef = useRef<number>(-1)
  const tickRef = useRef<number>(0)
  const lastGuestSendRef = useRef<number>(0)
  const lastPausedSendRef = useRef<number>(0) // host: snapshots blijven sturen tijdens een pauze (rust/kaart/einde)
  const snapBufRef = useRef<{ snap: Snapshot; at: number }[]>([])
  const startedGuestRef = useRef<boolean>(false)
  const hostMetaRef = useRef<TeamMeta | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const prevSwitchRef = useRef<boolean>(false)
  const manualHoldRef = useRef<number>(0)
  const prevCtrlRef = useRef<number>(-1)
  const prevCtrlGRef = useRef<number>(-1)
  // Lokaal 2-spelers (zelfde PC): speler 2 = tweede input (controller 2), bestuurt team 1.
  const twoPlayerRef = useRef<boolean>(false)
  const coopRef = useRef<boolean>(false) // 2 mensen samen op team 0 vs AI (co-op)
  const fourPlayerRef = useRef<boolean>(false) // 4 bestuurde spelers (lokaal 2v2 óf online-host 2v2)
  const netHost2v2Ref = useRef<boolean>(false) // host 2v2 online: slots 1-3 komen van het netwerk
  const net2v2GuestRef = useRef<boolean>(false) // gast in een 2v2-kamer
  const input2Ref = useRef<KeyboardInput | null>(null)
  const input3Ref = useRef<KeyboardInput | null>(null)
  const input4Ref = useRef<KeyboardInput | null>(null)
  const prevSwitch2Ref = useRef<boolean>(false)
  const prevSwitch3Ref = useRef<boolean>(false)
  const prevSwitch4Ref = useRef<boolean>(false)
  const manualHold2Ref = useRef<number>(0)
  const manualHold3Ref = useRef<number>(0)
  const manualHold4Ref = useRef<number>(0)
  const controlled3Ref = useRef<number>(-1) // team 1, speler 3 (2v2)
  const controlled4Ref = useRef<number>(-1) // team 1, speler 4 (2v2)
  const prevCtrl3Ref = useRef<number>(-1)
  const prevCtrl4Ref = useRef<number>(-1)
  const setpieceRef = useRef<string | null>(null)
  const prevCardsRef = useRef<number>(0)
  const prevFoulRef = useRef<number>(0)
  const prevTackleRef = useRef<number>(0)
  const prevSaveRef = useRef<number>(0)
  const prevPannaRef = useRef<number>(0)
  const prevBicycleRef = useRef<number>(0)
  const slowmoUntilRef = useRef<number>(0) // performance.now() tot wanneer de sim vertraagd loopt (omhaal)
  const prevStreakerRef = useRef<boolean>(false)
  const toastTimerRef = useRef<number | null>(null)
  const goalOverlayTimerRef = useRef<number | null>(null)
  const cardTimerRef = useRef<number | null>(null)
  const prevPhaseUiRef = useRef<string | null>(null)
  const countdownTimersRef = useRef<number[]>([])
  const commentaryIdRef = useRef<number>(0)
  const commentaryTimersRef = useRef<number[]>([])
  const foulTimerRef = useRef<number | null>(null)
  const hydratedRef = useRef<boolean>(false)
  const venueRef = useRef<{ venue: 'stadion' | 'zaal' | 'strand' | 'sneeuw'; weather: 'clear' | 'rain' | 'snow' } | null>(null)
  const crowdAudioRef = useRef<HTMLAudioElement | null>(null)
  const rainAudioRef = useRef<HTMLAudioElement | null>(null)
  const prevKickSpeedRef = useRef<number>(0)

  useEffect(() => { difficultyRef.current = difficulty }, [difficulty])
  useEffect(() => { p1DeviceRef.current = p1Device }, [p1Device])
  useEffect(() => { p2DeviceRef.current = p2Device }, [p2Device])
  useEffect(() => { p3DeviceRef.current = p3Device }, [p3Device])
  useEffect(() => { p4DeviceRef.current = p4Device }, [p4Device])
  // Host 2v2-lobby: broadcast de (voorlopige) team-indeling zodat gasten hun kant live zien.
  useEffect(() => {
    if (lobby !== 'hosting2v2' || !netRef.current) return
    const guests = lobbyMembers.filter((m) => m.role === 'guest')
    const slots: SlotAssign[] = [{ peerId: netRef.current.peerId, slot: 0, team: 0 }]
    guests.forEach((g, i) => slots.push({ peerId: g.peerId, slot: i + 1, team: (teamAssign[g.peerId] ?? 1) as 0 | 1 }))
    netRef.current.sendLobby({ size: 4, slots })
  }, [lobby, lobbyMembers, teamAssign])
  useEffect(() => { giantBallRef.current = giantBall }, [giantBall])
  useEffect(() => { bigHeadsRef.current = bigHeads }, [bigHeads])
  useEffect(() => { slipperyRef.current = slippery }, [slippery])
  // Houd het aantal verbonden controllers bij (voor de apparaat-kiezer in de instellingen).
  useEffect(() => {
    const upd = () => setPadCount(connectedGamepadCount())
    upd()
    window.addEventListener('gamepadconnected', upd)
    window.addEventListener('gamepaddisconnected', upd)
    return () => { window.removeEventListener('gamepadconnected', upd); window.removeEventListener('gamepaddisconnected', upd) }
  }, [])

  // Bewaarde team-setup + settings inladen (lokaal, per apparaat). Alles wordt gevalideerd
  // tegen de huidige pool/kits/formaties zodat een oude opslag nooit kapotgaat.
  // (Bewust setState-na-mount i.p.v. lazy init → geen SSR/hydration-mismatch.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETUP_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (typeof s.teamName === 'string') setTeamName(s.teamName.slice(0, 18))
        if (s.kit && typeof s.kit.shirt === 'string' && typeof s.kit.trim === 'string' && typeof s.kit.keeper === 'string') {
          setKit({ shirt: s.kit.shirt, trim: s.kit.trim, keeper: s.kit.keeper })
        }
        if (typeof s.formationId === 'string' && FORMATIONS.some((f) => f.id === s.formationId)) setFormationId(s.formationId)
        if (Array.isArray(s.lineup)) {
          setLineup(Array.from({ length: PLAYERS_PER_TEAM }, (_, i) => {
            const e = s.lineup[i]
            return e && typeof e.face === 'string' ? (PLAYER_POOL.find((p) => p.face === e.face) ?? null) : null
          }))
        }
        if (typeof s.difficulty === 'number' && DIFFICULTY.some((o) => o.val === s.difficulty)) setDifficulty(s.difficulty)
        if (typeof s.giantBall === 'boolean') setGiantBall(s.giantBall)
        if (typeof s.bigHeads === 'boolean') setBigHeads(s.bigHeads)
        if (typeof s.slippery === 'boolean') setSlippery(s.slippery)
        if (DEVICE_IDS.includes(s.p1Device)) setP1Device(s.p1Device)
        if (DEVICE_IDS.includes(s.p2Device)) setP2Device(s.p2Device)
        if (DEVICE_IDS.includes(s.p3Device)) setP3Device(s.p3Device)
        if (DEVICE_IDS.includes(s.p4Device)) setP4Device(s.p4Device)
      }
    } catch {
      /* corrupte opslag → gewoon de standaardwaarden */
    }
    // Zelf aangepaste traits inladen (alleen geldige, som === budget).
    try {
      const raw = localStorage.getItem(TRAITS_KEY)
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, PlayerTraits>
        const clean: Record<string, PlayerTraits> = {}
        for (const [face, tr] of Object.entries(obj)) {
          if (tr && [tr.pace, tr.shot, tr.tackle].every((v) => Number.isInteger(v) && v >= 1 && v <= 5) && tr.pace + tr.shot + tr.tackle === TRAIT_BUDGET) {
            clean[face] = { pace: tr.pace, shot: tr.shot, tackle: tr.tackle }
          }
        }
        setCustomTraits(clean)
      }
    } catch { /* corrupt → standaard */ }
    hydratedRef.current = true
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Aangepaste traits opslaan bij elke wijziging.
  useEffect(() => {
    if (!hydratedRef.current) return
    try { localStorage.setItem(TRAITS_KEY, JSON.stringify(customTraits)) } catch { /* quota */ }
  }, [customTraits])

  // Setup opslaan bij elke wijziging (pas nadat de opslag geladen is).
  useEffect(() => {
    if (!hydratedRef.current) return
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify({ teamName, kit, formationId, lineup, halfSec, difficulty, giantBall, bigHeads, slippery, p1Device, p2Device, p3Device, p4Device }))
    } catch {
      /* private mode / quota → stil overslaan */
    }
  }, [teamName, kit, formationId, lineup, halfSec, difficulty, giantBall, bigHeads, slippery, p1Device, p2Device, p3Device, p4Device])

  // Uitslagen-geschiedenis inladen (lokaal, per apparaat) — mount-time, geen hydration-mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESULTS_KEY)
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) setResults(arr.slice(0, 40)) }
    } catch { /* corrupt → leeg */ }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debug-hotkeys (alleen in dev): 1=geel, 2=rood, 3=streaker, 4=goal — om momenten te screenshotten.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || stage !== 'match') return
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current
      if (!s || roleRef.current === 'guest') return // gast simuleert niet
      if (e.code === 'Digit1') debugCard(s, false)
      else if (e.code === 'Digit2') debugCard(s, true)
      else if (e.code === 'Digit3') debugSpawnStreaker(s)
      else if (e.code === 'Digit4') debugGoal(s)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage])

  // Pauzemenu met Esc (alleen lokaal — online pauzeert de host-sim niet). Alleen tijdens vrij spel.
  useEffect(() => {
    if (stage !== 'match') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      if (roleRef.current !== null) return
      if (paused) { e.preventDefault(); setPaused(false); pausedRef.current = false; return }
      if (pausedRef.current || overlayRef.current !== null || countdown !== null || shootout || foulFlash) return
      e.preventDefault()
      setPaused(true)
      pausedRef.current = true
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, paused, countdown, shootout, foulFlash])


  useEffect(() => {
    const check = () => setTooSmall(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Geluiden + kaart-afbeeldingen voorladen → geen vertraging/blanco beeld bij de eerste kaart.
  useEffect(() => {
    for (const src of [...GOAL_SOUNDS, ...KICK_SOUNDS, ...WHISTLE_SOUNDS, ...TACKLE_SOUNDS, ...YELLOWCARD_SOUNDS, ...REDCARD_SOUNDS]) primeSound(src)
    for (const src of ['/spelers/ref-yellow.png', '/spelers/ref-red.png']) { const im = new window.Image(); im.src = src }
  }, [])

  const resizeRenderer = useCallback(() => {
    const wrap = wrapRef.current
    const r = rendererRef.current
    if (wrap && r) r.resize(wrap.clientWidth, wrap.clientHeight)
  }, [])

  const updateHud = useCallback((s: GameState) => {
    if (score0Ref.current) score0Ref.current.textContent = String(s.score[0])
    if (score1Ref.current) score1Ref.current.textContent = String(s.score[1])
    if (clockElRef.current) {
      // "Echte" wedstrijdtijd: elke helft loopt van 0→45 voetbalminuten (2e helft 45→90),
      // ongeacht de gekozen helft-lengte → de klok tikt gewoon sneller.
      const frac = s.halfLengthSec > 0 ? Math.min(1, s.clock / s.halfLengthSec) : 0
      const totalMin = (s.half === 1 ? 0 : 45) + frac * 45
      const mm = Math.floor(totalMin).toString().padStart(2, '0')
      const ss = Math.floor((totalMin - Math.floor(totalMin)) * 60).toString().padStart(2, '0')
      clockElRef.current.textContent = `${mm}:${ss}`
    }
    const c = controlledRef.current
    const frac = c >= 0 ? Math.min(1, (s.players[c]?.charge ?? 0) / MAX_CHARGE_TIME) : 0
    if (powerWrapRef.current) powerWrapRef.current.style.opacity = frac > 0.02 ? '1' : '0'
    if (powerFillRef.current) {
      powerFillRef.current.style.width = `${frac * 100}%`
      powerFillRef.current.style.background = frac < 0.5 ? '#2EA84B' : frac < 0.85 ? '#F4B92E' : '#E63946'
    }
    // Stamina van de bestuurde speler (voor de sprint).
    const stam = c >= 0 ? Math.max(0, Math.min(1, s.players[c]?.stamina ?? 1)) : 1
    if (staminaFillRef.current) {
      staminaFillRef.current.style.width = `${stam * 100}%`
      staminaFillRef.current.style.background = stam < 0.25 ? '#E63946' : stam < 0.55 ? '#F4B92E' : '#2EA84B'
    }
  }, [])

  const drawFrame = useCallback((dt: number) => {
    const s = stateRef.current
    const r = rendererRef.current
    if (!s || !r || !r.ready) return
    r.draw(s, dt, controlledRef.current)
    updateHud(s)
    // Trap/pass-geluid: zelfde snelheidssprong-detectie als de visuele kick-fx.
    if (dt > 0) {
      const bs = Math.hypot(s.ball.vel.x, s.ball.vel.y)
      if (bs - prevKickSpeedRef.current > 170 && bs > 260) playSound(KICK_SOUNDS, bs > 470 ? 0.6 : 0.4)
      prevKickSpeedRef.current = bs
    }
  }, [updateHud])

  // Voeg een commentaar-regel toe (max 3 zichtbaar, elk ~4,6s) — naam-bewuste match-narratie.
  const pushComment = useCallback((text: string) => {
    const id = ++commentaryIdRef.current
    setCommentary((cur) => [...cur, { id, text }].slice(-3))
    const t = window.setTimeout(() => setCommentary((cur) => cur.filter((c) => c.id !== id)), 4600)
    commentaryTimersRef.current.push(t)
  }, [])

  const syncOverlay = useCallback((s: GameState) => {
    // Set-piece-label (ingooi/hoekschop/doeltrap/vrije trap) tijdens de setpiece-fase.
    const rk = s.phase === 'setpiece' ? s.restartKind : null
    if (rk) {
      if (setpieceRef.current !== rk) {
        setpieceRef.current = rk
        setSetpieceLabel(RESTART_LABEL[rk])
      }
    } else if (setpieceRef.current) {
      setpieceRef.current = null
      setSetpieceLabel(null)
    }
    // Kaart-flash bij een nieuwe kaart in de log. Scherm/pauze ~4-5s; het geluid (geel 7s / rood 6s)
    // speelt gewoon door nadat het scherm weg is (los Audio-element).
    let cardJustAdded = false
    let cardHoldMs = 0
    if (s.cards.length !== prevCardsRef.current) {
      const added = s.cards.length > prevCardsRef.current
      prevCardsRef.current = s.cards.length
      if (added) {
        cardJustAdded = true
        const c = s.cards[s.cards.length - 1]
        cardHoldMs = c.red ? 4500 : 5000
        setCardFlash({ red: c.red, secondYellow: !!c.secondYellow, name: s.players[c.player]?.name ?? '', teamName: s.teams[c.team]?.name ?? '', n: s.cards.length })
        pushComment(cardQuip(s.players[c.player]?.name ?? 'iemand', c.red))
        playSound(c.red ? REDCARD_SOUNDS : YELLOWCARD_SOUNDS, 0.75)
        if (cardTimerRef.current) clearTimeout(cardTimerRef.current)
        cardTimerRef.current = window.setTimeout(() => setCardFlash(null), cardHoldMs)
      }
    }
    // Overtreding (robuust via de teller, niet via de fase): spel écht stil + animatie + fluit;
    // daarna neemt de tegenpartij de vrije trap (sim houdt de tegenstander op afstand).
    if (s.foulCount !== prevFoulRef.current) {
      const increased = s.foulCount > prevFoulRef.current
      prevFoulRef.current = s.foulCount
      if (increased) {
        setFoulFlash(true)
        if (!cardJustAdded) pushComment(pick(FOUL_QUIPS)) // bij een kaart praat de kaart-quip al
        playSound(WHISTLE_SOUNDS, 0.6)
        if (roleRef.current !== 'guest') pausedRef.current = true
        if (foulTimerRef.current) clearTimeout(foulTimerRef.current)
        const hold = cardJustAdded ? cardHoldMs : 1700 // bij een kaart stil zolang de clip duurt (geel 7s / rood 6s)
        foulTimerRef.current = window.setTimeout(() => {
          setFoulFlash(false)
          if (roleRef.current !== 'guest') pausedRef.current = false
        }, hold)
      }
    }
    // Tackle-dreun (elke keer dat iemand omvergelopen wordt).
    if (s.tackleCount !== prevTackleRef.current) {
      const more = s.tackleCount > prevTackleRef.current
      prevTackleRef.current = s.tackleCount
      if (more) playSound(TACKLE_SOUNDS, 0.6)
    }
    // Knappe redding → "WAT EEN REDDING!"-popup.
    if (s.saveCount !== prevSaveRef.current) {
      const more = s.saveCount > prevSaveRef.current
      prevSaveRef.current = s.saveCount
      if (more) {
        setToast('Wat een redding! 🧤')
        pushComment(pick(SAVE_QUIPS))
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = window.setTimeout(() => setToast(null), 1600)
      }
    }
    // Veldbestormer verschijnt → opvallende popup zodat je 'm niet mist.
    const hasStreaker = !!s.streaker
    if (hasStreaker !== prevStreakerRef.current) {
      prevStreakerRef.current = hasStreaker
      if (hasStreaker) {
        setToast('🏃 Veldbestormer!')
        pushComment(pick(STREAKER_QUIPS))
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = window.setTimeout(() => setToast(null), 2000)
      }
    }
    // Geslaagde panna → "PANNA!"-popup.
    if (s.pannaCount !== prevPannaRef.current) {
      const more = s.pannaCount > prevPannaRef.current
      prevPannaRef.current = s.pannaCount
      if (more) {
        setToast('PANNA! 🪄')
        pushComment(pick(PANNA_QUIPS))
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = window.setTimeout(() => setToast(null), 1600)
      }
    }
    // Omhaal → korte slow-motion + "OMHAAL!"-popup (client vertraagt de sim heel even).
    if (s.bicycleCount !== prevBicycleRef.current) {
      const more = s.bicycleCount > prevBicycleRef.current
      prevBicycleRef.current = s.bicycleCount
      if (more && roleRef.current !== 'guest') {
        slowmoUntilRef.current = performance.now() + SLOWMO_TIME * 1000
        setToast('🚲 OMHAAL!')
        pushComment('🚲 OMHAAL! Wat een actie!')
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = window.setTimeout(() => setToast(null), 1800)
      }
    }
    // Fase-overgangen: aftel-animatie bij (her)start, korte overtredings-flits bij een vrije trap,
    // en de controls-hint verdwijnt zodra het spel echt loopt.
    if (s.phase !== prevPhaseUiRef.current) {
      const from = prevPhaseUiRef.current
      prevPhaseUiRef.current = s.phase
      if (s.phase === 'playing') setHintDone(true)
      if ((s.phase === 'halftime' || s.phase === 'fulltime') && from !== s.phase) playSound(WHISTLE_SOUNDS, 0.7)
      // Aftellen 3-2-1-GO bij de aftrap. De gast toont 't ook (cosmetisch), maar pauzeert niet:
      // alleen host/lokaal bevriest de sim tijdens het aftellen.
      if (s.phase === 'kickoff' && from !== 'kickoff') {
        const isGuest = roleRef.current === 'guest'
        countdownTimersRef.current.forEach((t) => clearTimeout(t))
        countdownTimersRef.current = []
        if (!isGuest) pausedRef.current = true
        setCountdown(3)
        const at = (ms: number, fn: () => void) => countdownTimersRef.current.push(window.setTimeout(fn, ms))
        at(750, () => setCountdown(2))
        at(1500, () => setCountdown(1))
        at(2250, () => { setCountdown('GO'); playSound(WHISTLE_SOUNDS, 0.6) }) // aftrapfluit
        at(3000, () => { setCountdown(null); if (!isGuest) pausedRef.current = false })
      }
    }
    const desired: Overlay =
      s.phase === 'goal' ? 'goal' : s.phase === 'halftime' ? 'halftime' : s.phase === 'fulltime' ? 'fulltime' : null
    const prev = overlayRef.current
    if (desired === prev) return
    overlayRef.current = desired
    // Na de goal-animatie (goal → aftrap): kort de tussenstand groot onderin tonen.
    if (prev === 'goal' && desired === null) {
      if (goalOverlayTimerRef.current) { clearTimeout(goalOverlayTimerRef.current); goalOverlayTimerRef.current = null }
      setScoreFlash([s.score[0], s.score[1]])
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = window.setTimeout(() => setScoreFlash(null), 3200)
    }
    if (desired === 'goal') {
      const g = s.goals[s.goals.length - 1]
      const p = g && g.scorer >= 0 ? s.players[g.scorer] : null
      setGoalInfo(g ? { name: p?.name ?? '', teamName: s.teams[g.team]?.name ?? '', face: p?.face ?? null, team: g.team, ownGoal: g.ownGoal, color: s.teams[g.team].shirt, kind: s.lastGoalKind } : null)
      if (g) pushComment(goalQuip(p?.name ?? 'Iemand', s.teams[g.team]?.name ?? 'het team', g.ownGoal ? 'owngoal' : s.lastGoalKind))
      playSound(GOAL_SOUNDS)
      // Eerst een korte on-pitch viering laten zien; dan pas het full-screen goalscherm.
      if (goalOverlayTimerRef.current) clearTimeout(goalOverlayTimerRef.current)
      goalOverlayTimerRef.current = window.setTimeout(() => setOverlay('goal'), 900)
    } else {
      setOverlay(desired)
    }
    if (desired === 'halftime' || desired === 'fulltime') {
      if (roleRef.current !== 'guest') pausedRef.current = true
      const ht = humanTeamRef.current
      const mine = s.score[ht]
      const theirs = s.score[ht === 0 ? 1 : 0]
      // Klok → voetbal-schaal (0→45 per helft), in seconden.
      const toMatchClock = (c: number) => (s.halfLengthSec > 0 ? Math.min(45, (c / s.halfLengthSec) * 45) * 60 : c)
      const scorers = s.goals.map((g) => ({
        team: g.team,
        name: g.scorer >= 0 ? (s.players[g.scorer]?.name ?? '?') : '?',
        face: g.scorer >= 0 ? (s.players[g.scorer]?.face ?? null) : null,
        ownGoal: g.ownGoal,
        clock: toMatchClock(g.clock),
        half: g.half,
      }))
      const tlCards: TlCard[] = s.cards.map((c) => ({
        team: c.team,
        name: s.players[c.player]?.name ?? '?',
        face: s.players[c.player]?.face ?? null,
        red: c.red,
        secondYellow: !!c.secondYellow,
        clock: toMatchClock(c.clock),
        half: c.half,
      }))
      // Man of the Match (bij einde): speler met de meeste (echte) goals + een speels lijntje.
      let motm: Mvp | undefined
      if (desired === 'fulltime') {
        const tally: Record<number, number> = {}
        for (const g of s.goals) if (!g.ownGoal && g.scorer >= 0) tally[g.scorer] = (tally[g.scorer] ?? 0) + 1
        let bestId = -1, bestN = 0
        for (const [id, n] of Object.entries(tally)) if (n > bestN) { bestN = n; bestId = Number(id) }
        if (bestId >= 0) {
          const pl = s.players[bestId]
          const tag = PLAYER_POOL.find((pp) => pp.face === pl?.face)?.tag
          const praise = bestN >= 3 ? 'hattrick-held 🎩' : bestN >= 2 ? 'onhoudbaar 🔥' : 'clinical'
          motm = { name: pl?.name ?? '?', face: pl?.face ?? null, team: pl?.team ?? 0, line: `${bestN} goal${bestN > 1 ? 's' : ''} · ${tag ?? praise}` }
        }
      }
      // Post-match stats (alleen op het eindscherm).
      let matchStats: MatchStats | undefined
      if (desired === 'fulltime') {
        const tot = (s.stats.possMs[0] + s.stats.possMs[1]) || 1
        const p0 = Math.round((s.stats.possMs[0] / tot) * 100)
        matchStats = {
          possPct: [p0, 100 - p0],
          shots: [s.stats.shots[0], s.stats.shots[1]],
          tackles: [s.stats.tackles[0], s.stats.tackles[1]],
          pannas: [s.stats.pannas[0], s.stats.pannas[1]],
        }
      }
      setPanelInfo({
        title: desired === 'halftime' ? 'HALF TIME' : 'FULL TIME',
        score: [s.score[0], s.score[1]],
        result: desired === 'fulltime' ? (mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw') : undefined,
        scorers,
        cards: tlCards,
        halfLen: 45,
        motm,
        stats: matchStats,
      })
      // Gelijkspel bij rust... nee: bij einde + lokaal → strafschoppenserie.
      if (desired === 'fulltime' && mine === theirs && roleRef.current === null) setShootout(true)
      // Uitslag vastleggen (één keer per wedstrijd, lokaal bewaard).
      if (desired === 'fulltime' && !matchRecordedRef.current) {
        matchRecordedRef.current = true
        const entry: MatchResult = {
          a: s.teams[0].short, b: s.teams[1].short, ca: s.teams[0].shirt, cb: s.teams[1].shirt,
          sa: s.score[0], sb: s.score[1], ts: Date.now(),
          na: s.teams[0].name, nb: s.teams[1].name, you: humanTeamRef.current,
          sc: scorers.filter((g) => !g.ownGoal).map((g) => ({ n: g.name, t: g.team })),
          mvp: motm?.name,
        }
        setResults((prev) => {
          const next = [entry, ...prev].slice(0, 40)
          try { localStorage.setItem(RESULTS_KEY, JSON.stringify(next)) } catch { /* quota */ }
          return next
        })
      }
    }
  }, [pushComment])

  const advance = useCallback((frameDt: number) => {
    const s = stateRef.current
    if (!s) return
    const netRole = roleRef.current

    if (netRole === 'guest') {
      const now = performance.now()
      if (inputRef.current && netRef.current && now - lastGuestSendRef.current > GUEST_SEND_MS) {
        lastGuestSendRef.current = now
        const cmd = inputRef.current.command()
        // 2v2: input taggen met je eigen slot; 1v1: los versturen.
        if (net2v2GuestRef.current) netRef.current.sendInputSlot(mySlotRef.current, cmd)
        else netRef.current.sendInput(cmd)
      }
      const buf = snapBufRef.current
      if (buf.length > 0) {
        const renderAt = now - RENDER_DELAY_MS
        let a: { snap: Snapshot; at: number } | null = null
        let b: { snap: Snapshot; at: number } | null = null
        for (let i = 0; i < buf.length; i++) {
          if (buf[i].at <= renderAt) a = buf[i]
          else { b = buf[i]; break }
        }
        if (a && b) lerpSnapshotInto(s, a.snap, b.snap, (renderAt - a.at) / Math.max(1, b.at - a.at))
        else { const last = buf[buf.length - 1]; lerpSnapshotInto(s, last.snap, last.snap, 0) }
        const latest = buf[buf.length - 1].snap
        // 2v2: jouw bestuurde speler = cs[mijnSlot]; 1v1: cg.
        controlledRef.current = net2v2GuestRef.current ? (latest.cs?.[mySlotRef.current] ?? -1) : latest.cg
        while (buf.length > 12) buf.shift()
      }
      syncOverlay(s)
      drawFrame(frameDt)
      return
    }

    // Menselijke input één keer per frame lezen; handmatig wisselen (X) op de edge.
    const hcmd = inputRef.current ? inputRef.current.command() : null
    const team = humanTeamRef.current
    if (hcmd?.switch && !prevSwitchRef.current) {
      controlledRef.current = cycleTeammate(s, team, controlledRef.current)
      manualHoldRef.current = 2 // even niet auto-wisselen na een handmatige keuze
    }
    prevSwitchRef.current = !!hcmd?.switch
    if (manualHoldRef.current > 0) manualHoldRef.current = Math.max(0, manualHoldRef.current - frameDt)
    // Speler 2: lokaal van z'n apparaat, of (online 2v2) van slot 1 over het netwerk.
    const p2cmd = netHost2v2Ref.current ? (slotInputsRef.current[1] ?? null) : (twoPlayerRef.current && input2Ref.current ? input2Ref.current.command() : null)
    if (p2cmd?.switch && !prevSwitch2Ref.current) {
      // Speler 2 zit op team 0 bij co-op én 2v2; alleen bij lokaal 1v1 op team 1.
      controlledGuestRef.current = cycleTeammate(s, coopRef.current || fourPlayerRef.current ? 0 : 1, controlledGuestRef.current)
      manualHold2Ref.current = 2
    }
    prevSwitch2Ref.current = !!p2cmd?.switch
    if (manualHold2Ref.current > 0) manualHold2Ref.current = Math.max(0, manualHold2Ref.current - frameDt)
    // Spelers 3 & 4 (team 1): lokaal van hun apparaat, of (online 2v2) van slot 2/3 over het netwerk.
    const p3cmd = netHost2v2Ref.current ? (slotInputsRef.current[2] ?? null) : (fourPlayerRef.current && input3Ref.current ? input3Ref.current.command() : null)
    if (p3cmd?.switch && !prevSwitch3Ref.current) { controlled3Ref.current = cycleTeammate(s, 1, controlled3Ref.current); manualHold3Ref.current = 2 }
    prevSwitch3Ref.current = !!p3cmd?.switch
    if (manualHold3Ref.current > 0) manualHold3Ref.current = Math.max(0, manualHold3Ref.current - frameDt)
    const p4cmd = netHost2v2Ref.current ? (slotInputsRef.current[3] ?? null) : (fourPlayerRef.current && input4Ref.current ? input4Ref.current.command() : null)
    if (p4cmd?.switch && !prevSwitch4Ref.current) { controlled4Ref.current = cycleTeammate(s, 1, controlled4Ref.current); manualHold4Ref.current = 2 }
    prevSwitch4Ref.current = !!p4cmd?.switch
    if (manualHold4Ref.current > 0) manualHold4Ref.current = Math.max(0, manualHold4Ref.current - frameDt)

    if (!pausedRef.current) {
      // Slow-motion na een omhaal: minder sim-tijd per frame → alles beweegt heel even vertraagd.
      const slow = performance.now() < slowmoUntilRef.current
      accRef.current += frameDt * (slow ? 0.3 : 1)
      let steps = 0
      while (accRef.current >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        // Online: AI-teamgenoten altijd op 'Normaal' (geen difficulty-keuze in 1v1).
        const aiDiff = roleRef.current === null ? difficultyRef.current : 0.6
        const inputs: InputCommand[] = computeAICommands(s, -1, aiDiff)
        if (fourPlayerRef.current) {
          // Lokaal 2v2: team 0 = speler 1+2, team 1 = speler 3+4 (elk paar nooit dezelfde speler).
          const c1 = manualHoldRef.current > 0 ? controlledRef.current : pickCoop(s, 0, controlledRef.current, controlledGuestRef.current)
          controlledRef.current = c1
          const c2 = manualHold2Ref.current > 0 ? controlledGuestRef.current : pickCoop(s, 0, controlledGuestRef.current, c1)
          controlledGuestRef.current = c2
          const c3 = manualHold3Ref.current > 0 ? controlled3Ref.current : pickCoop(s, 1, controlled3Ref.current, controlled4Ref.current)
          controlled3Ref.current = c3
          const c4 = manualHold4Ref.current > 0 ? controlled4Ref.current : pickCoop(s, 1, controlled4Ref.current, c3)
          controlled4Ref.current = c4
          if (hcmd && c1 >= 0) { seedEdgesOnSwitch(s, c1, hcmd, prevCtrlRef); inputs[c1] = hcmd }
          if (p2cmd && c2 >= 0) { seedEdgesOnSwitch(s, c2, p2cmd, prevCtrlGRef); inputs[c2] = p2cmd }
          if (p3cmd && c3 >= 0) { seedEdgesOnSwitch(s, c3, p3cmd, prevCtrl3Ref); inputs[c3] = p3cmd }
          if (p4cmd && c4 >= 0) { seedEdgesOnSwitch(s, c4, p4cmd, prevCtrl4Ref); inputs[c4] = p4cmd }
        } else if (coopRef.current) {
          // Co-op: beide mensen op team 0 (nooit dezelfde speler); team 1 volledig AI.
          const c1 = manualHoldRef.current > 0 ? controlledRef.current : pickCoop(s, 0, controlledRef.current, controlledGuestRef.current)
          controlledRef.current = c1
          const c2 = manualHold2Ref.current > 0 ? controlledGuestRef.current : pickCoop(s, 0, controlledGuestRef.current, c1)
          controlledGuestRef.current = c2
          if (hcmd && c1 >= 0) { seedEdgesOnSwitch(s, c1, hcmd, prevCtrlRef); inputs[c1] = hcmd }
          if (p2cmd && c2 >= 0) { seedEdgesOnSwitch(s, c2, p2cmd, prevCtrlGRef); inputs[c2] = p2cmd }
        } else if (netRole === 'host' || twoPlayerRef.current) {
          // Twee bestuurde spelers: team 0 = speler 1, team 1 = online-gast óf lokale speler 2.
          const cH = manualHoldRef.current > 0 ? controlledRef.current : pickControlledForTeam(s, 0, controlledRef.current)
          const cG = manualHold2Ref.current > 0 ? controlledGuestRef.current : pickControlledForTeam(s, 1, controlledGuestRef.current)
          controlledRef.current = cH
          controlledGuestRef.current = cG
          if (hcmd && cH >= 0) { seedEdgesOnSwitch(s, cH, hcmd, prevCtrlRef); inputs[cH] = hcmd }
          const t1cmd = twoPlayerRef.current ? p2cmd : guestInputRef.current
          if (t1cmd && cG >= 0) { seedEdgesOnSwitch(s, cG, t1cmd, prevCtrlGRef); inputs[cG] = t1cmd }
        } else {
          const c = manualHoldRef.current > 0 ? controlledRef.current : pickControlledForTeam(s, team, controlledRef.current)
          controlledRef.current = c
          if (c >= 0 && hcmd) { seedEdgesOnSwitch(s, c, hcmd, prevCtrlRef); inputs[c] = hcmd }
        }
        step(s, inputs, FIXED_DT)
        accRef.current -= FIXED_DT
        steps++
        if (netRole === 'host') {
          tickRef.current++
          if (tickRef.current % SNAPSHOT_EVERY === 0) {
            const cs = netHost2v2Ref.current ? [controlledRef.current, controlledGuestRef.current, controlled3Ref.current, controlled4Ref.current] : undefined
            netRef.current?.sendSnapshot(buildSnapshot(s, tickRef.current, controlledGuestRef.current, cs))
          }
        }
      }
      if (steps === MAX_STEPS_PER_FRAME) accRef.current = 0
      syncOverlay(s)
    } else if (netRole === 'host' && netRef.current) {
      // Ook tijdens een pauze (rust, kaart-animatie, einde) blijft de host de fase + score naar
      // de gast sturen — de sim staat stil, dus posities blijven gelijk — zodat de gast het
      // rust-/eind-/kaartscherm óók (en op tijd) ziet i.p.v. pas als het spel weer loopt.
      const now = performance.now()
      if (now - lastPausedSendRef.current > 90) {
        lastPausedSendRef.current = now
        tickRef.current++
        const cs = netHost2v2Ref.current ? [controlledRef.current, controlledGuestRef.current, controlled3Ref.current, controlled4Ref.current] : undefined
        netRef.current.sendSnapshot(buildSnapshot(s, tickRef.current, controlledGuestRef.current, cs))
      }
    }
    drawFrame(pausedRef.current ? 0 : frameDt)
  }, [drawFrame, syncOverlay])

  // Match starten met concrete team-configs. `cosmetic` = venue/weer opgelegd door de host
  // (voor de gast); zonder → zelf willekeurig kiezen (lokaal/host).
  const beginMatch = useCallback((r: Role, metas: [TeamMeta, TeamMeta], hs: number, cosmetic?: { venue: 'stadion' | 'zaal' | 'strand' | 'sneeuw'; weather: 'clear' | 'rain' | 'snow'; ballScale?: number; bigHeads?: boolean; slippery?: boolean }) => {
    const humanTeam: TeamId = r === 'guest' ? 1 : 0
    roleRef.current = r
    setRole(r)
    humanTeamRef.current = humanTeam
    const s = createInitialState(humanTeam, hs, metas[0], metas[1])
    // Venue + weer + wind: opgelegd (gast) of zelf willekeurig (host/lokaal). Ondergrond bepaalt
    // de balwrijving, wind duwt de bal. De renderer krijgt venue/weer mee; de sim surface/wind.
    let venue: 'stadion' | 'zaal' | 'strand' | 'sneeuw'
    let weather: 'clear' | 'rain' | 'snow'
    if (cosmetic) {
      venue = cosmetic.venue
      weather = cosmetic.weather
    } else {
      const VENUES = ['stadion', 'stadion', 'strand', 'zaal', 'sneeuw'] as const
      venue = VENUES[Math.floor(Math.random() * VENUES.length)]
      weather = venue === 'sneeuw' ? 'snow' : (venue !== 'zaal' && Math.random() < 0.4 ? 'rain' : 'clear')
    }
    s.surface = venue === 'zaal' ? 'zaal' : venue === 'strand' ? 'strand' : venue === 'sneeuw' ? 'sneeuw' : 'gras'
    // Wind: volledig willekeurig van richting én kracht — meestal mild, maar met pech flink
    // (bias naar laag via ^1.7, tot ~150). Binnen (zaal) geen wind. Alleen host/lokaal simuleert.
    const windMag = r === 'guest' || venue === 'zaal' ? 0 : Math.pow(Math.random(), 1.7) * 150
    const wa = Math.random() * Math.PI * 2
    s.wind = { x: Math.cos(wa) * windMag, y: Math.sin(wa) * windMag }
    // Startweer + windvlaag-doel; daarna verandert het weer dynamisch tijdens het spel (sim).
    s.weather = weather
    s.windTarget = { x: s.wind.x, y: s.wind.y }
    s.weatherTimer = 5 + Math.random() * 6
    s.ballScale = cosmetic ? (cosmetic.ballScale ?? 1) : (giantBallRef.current ? 2 : 1)
    s.bigHeads = cosmetic ? !!cosmetic.bigHeads : bigHeadsRef.current
    s.slippery = cosmetic ? !!cosmetic.slippery : slipperyRef.current
    venueRef.current = { venue, weather }
    placeForKickoff(s, s.kickoffTeam)
    controlledRef.current = r === 'guest' ? -1 : nearestTeammateToBall(s, humanTeam)
    controlledGuestRef.current = nearestTeammateToBall(s, 1)
    guestInputRef.current = { move: { x: 0, y: 0 }, kick: false }
    tickRef.current = 0
    snapBufRef.current = []
    stateRef.current = s
    setMatchTeams(metas)
    overlayRef.current = null
    setOverlay(null)
    setPanelInfo(null)
    setpieceRef.current = null
    setSetpieceLabel(null)
    prevCardsRef.current = 0
    prevFoulRef.current = 0
    prevTackleRef.current = 0
    prevSaveRef.current = 0
    prevPannaRef.current = 0
    prevBicycleRef.current = 0
    slowmoUntilRef.current = 0
    prevStreakerRef.current = false
    matchRecordedRef.current = false
    setPaused(false)
    setToast(null)
    setCommentary([])
    commentaryTimersRef.current.forEach((t) => clearTimeout(t))
    commentaryTimersRef.current = []
    setCardFlash(null)
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current)
    // Aftel-/hint-/overtredings-state resetten voor de nieuwe wedstrijd.
    prevPhaseUiRef.current = null
    setHintDone(false)
    setFoulFlash(false)
    setCountdown(null)
    setShootout(false)
    setShootoutResult(null)
    countdownTimersRef.current.forEach((t) => clearTimeout(t))
    countdownTimersRef.current = []
    if (foulTimerRef.current) clearTimeout(foulTimerRef.current)
    if (goalOverlayTimerRef.current) clearTimeout(goalOverlayTimerRef.current)
    pausedRef.current = false
    accRef.current = 0
    lastRef.current = performance.now() / 1000
    rendererRef.current?.resetCamera(s)
    setStage('match')
  }, [])

  // Bouw jouw team uit de builder-selectie.
  const myTeamMeta = useCallback(() => buildTeamMeta(teamName, kit, lineup, formationId, customTraits), [teamName, kit, lineup, formationId, customTraits])

  const startLocal = () => {
    twoPlayerRef.current = false
    coopRef.current = false
    fourPlayerRef.current = false
    const human = myTeamMeta()
    const ai = randomAiTeam(kit.shirt)
    beginMatch(null, [human, ai], halfSec)
  }

  // Lokaal 2 spelers (zelfde PC): jij (team 0) vs speler 2 (team 1, willekeurig land). Geen netcode;
  // speler 2 speelt op z'n eigen apparaat. De AI vult op beide teams de niet-bestuurde spelers.
  const startLocal2p = () => {
    twoPlayerRef.current = true
    coopRef.current = false
    fourPlayerRef.current = false
    const p1 = myTeamMeta()
    const p2 = randomAiTeam(kit.shirt) // eigen, contrasterend team voor speler 2
    beginMatch(null, [p1, p2], halfSec)
  }

  // Co-op: speler 1 + speler 2 SAMEN op team 0 (jouw team) tegen de AI (team 1). Elke mens bestuurt
  // automatisch de dichtstbijzijnde teamgenoot — nooit dezelfde.
  const startCoop = () => {
    twoPlayerRef.current = true
    coopRef.current = true
    fourPlayerRef.current = false
    const ours = myTeamMeta()
    const ai = randomAiTeam(kit.shirt)
    beginMatch(null, [ours, ai], halfSec)
  }

  // Lokaal 2v2 (4 mensen, zelfde PC): speler 1+2 op team 0, speler 3+4 op team 1. Elk mens
  // bestuurt automatisch de dichtstbijzijnde teamgenoot (nooit dezelfde). Geen AI-tegenstander.
  const start2v2 = () => {
    twoPlayerRef.current = true
    coopRef.current = false
    fourPlayerRef.current = true
    controlled3Ref.current = -1
    controlled4Ref.current = -1
    const a = myTeamMeta()
    const b = randomAiTeam(kit.shirt)
    beginMatch(null, [a, b], halfSec)
  }

  // Losse penalty-modus (geen veldwedstrijd): direct een strafschoppenserie tegen de AI.
  const startPenalties = () => {
    const human = myTeamMeta()
    const ai = randomAiTeam(kit.shirt)
    setMatchTeams([human, ai])
    setPenaltyResult(null)
    setStage('penalty')
  }

  const backToMenu = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    netRef.current?.leave()
    netRef.current = null
    roleRef.current = null
    setRole(null)
    stateRef.current = null
    setStage('menu')
    setLobby('idle')
    setNetMsg('')
    setOverlay(null)
    overlayRef.current = null
    netHost2v2Ref.current = false
    net2v2GuestRef.current = false
  }, [])

  // ── Online ────────────────────────────────────────────────────────────────
  const startHostMatch = useCallback((teams: [TeamMeta, TeamMeta], hs: number) => {
    if (stateRef.current) return
    twoPlayerRef.current = false
    coopRef.current = false
    fourPlayerRef.current = false
    netHost2v2Ref.current = false
    net2v2GuestRef.current = false
    beginMatch('host', teams, hs) // kiest venue/weer (zet venueRef) → daarna naar de gast sturen
    netRef.current?.sendStart({ teams, halfSec: hs, venue: venueRef.current?.venue, weather: venueRef.current?.weather, ballScale: giantBallRef.current ? 2 : 1, bigHeads: bigHeadsRef.current, slippery: slipperyRef.current })
  }, [beginMatch])

  const hostGame = () => {
    const meta = myTeamMeta()
    hostMetaRef.current = meta
    const hs = halfSec
    const code = makeRoomCode(Math.floor(Math.random() * 1_000_000))
    setRoomCode(code)
    setLobby('hosting')
    setNetMsg('Wachten op tegenstander…')
    const net = new SoccerNet('host', code, {
      onGuestJoined: () => setNetMsg('Tegenstander verbonden!'),
      onTeam: (guestMeta) => {
        const guest = ensureDistinctKit(guestMeta, hostMetaRef.current!.shirt)
        startHostMatch([hostMetaRef.current!, guest], hs)
      },
      onInput: (cmd) => { guestInputRef.current = cmd },
      onPeerLeft: () => setNetMsg('Tegenstander verliet het spel.'),
    })
    netRef.current = net
    net.connect()
  }

  const joinGame = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) { setNetMsg('Voer een geldige code in.'); return }
    const guestMeta = myTeamMeta()
    net2v2GuestRef.current = false
    netHost2v2Ref.current = false
    setLobby('joining')
    setNetMsg('Verbinden…')
    startedGuestRef.current = false
    const enterGuest = (payload: { teams: [TeamMeta, TeamMeta]; halfSec: number; venue?: 'stadion' | 'zaal' | 'strand' | 'sneeuw'; weather?: 'clear' | 'rain' | 'snow'; ballScale?: number; bigHeads?: boolean; slippery?: boolean }) => {
      if (startedGuestRef.current) return
      startedGuestRef.current = true
      const cosmetic = payload.venue && payload.weather ? { venue: payload.venue, weather: payload.weather, ballScale: payload.ballScale ?? 1, bigHeads: payload.bigHeads, slippery: payload.slippery } : undefined
      beginMatch('guest', payload.teams, payload.halfSec, cosmetic)
    }
    const net = new SoccerNet('guest', code, {
      onSubscribed: () => { setNetMsg('Verbonden — wachten op host…'); net.sendTeam(guestMeta) },
      onStart: (payload) => enterGuest(payload),
      onSnapshot: (snap) => { snapBufRef.current.push({ snap, at: performance.now() }) },
      onPeerLeft: () => { setNetMsg('Host verliet het spel.'); backToMenu() },
    })
    netRef.current = net
    net.connect()
  }

  // ── Online 2v2 ──────────────────────────────────────────────────────────────
  const hostGame2v2 = () => {
    const meta = myTeamMeta()
    hostMetaRef.current = meta
    guestTeamsRef.current = {}
    slotInputsRef.current = {}
    setTeamAssign({})
    setLobbyMembers([])
    const code = makeRoomCode(Math.floor(Math.random() * 1_000_000))
    setRoomCode(code)
    setLobby('hosting2v2')
    setNetMsg('Wachten op 3 spelers…')
    const net = new SoccerNet('host', code, {
      onRoster: (members) => setLobbyMembers(members),
      onJoin: (p) => { guestTeamsRef.current[p.peerId] = p.team },
      onInputSlot: (slot, cmd) => { slotInputsRef.current[slot] = cmd },
      onPeerLeft: () => setNetMsg('Een speler verliet de kamer.'),
    }, meta.name)
    netRef.current = net
    net.connect()
  }

  // Host drukt op start: bouw slots (0=host A, 1=A-gast, 2+3=B-gasten), team B = team van de 1e B-speler.
  const start2v2Online = () => {
    const net = netRef.current
    if (!net) return
    const guests = lobbyMembers.filter((m) => m.role === 'guest')
    const aG = guests.filter((g) => teamAssign[g.peerId] === 0)
    const bG = guests.filter((g) => (teamAssign[g.peerId] ?? 1) === 1)
    if (guests.length !== 3 || aG.length !== 1 || bG.length !== 2) return
    const slots: SlotAssign[] = [
      { peerId: net.peerId, slot: 0, team: 0 },
      { peerId: aG[0].peerId, slot: 1, team: 0 },
      { peerId: bG[0].peerId, slot: 2, team: 1 },
      { peerId: bG[1].peerId, slot: 3, team: 1 },
    ]
    const teamA = hostMetaRef.current!
    const teamB = ensureDistinctKit(guestTeamsRef.current[bG[0].peerId] ?? randomAiTeam(teamA.shirt), teamA.shirt)
    twoPlayerRef.current = true
    fourPlayerRef.current = true
    coopRef.current = false
    netHost2v2Ref.current = true
    net2v2GuestRef.current = false
    controlled3Ref.current = -1
    controlled4Ref.current = -1
    slotInputsRef.current = {}
    beginMatch('host', [teamA, teamB], halfSec)
    net.sendStart({ teams: [teamA, teamB], halfSec, venue: venueRef.current?.venue, weather: venueRef.current?.weather, ballScale: giantBallRef.current ? 2 : 1, bigHeads: bigHeadsRef.current, slippery: slipperyRef.current, slots })
  }

  const joinGame2v2 = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) { setNetMsg('Voer een geldige code in.'); return }
    const guestMeta = myTeamMeta()
    net2v2GuestRef.current = true
    netHost2v2Ref.current = false
    mySlotRef.current = -1
    setMyTeam(null)
    setLobby('joining2v2')
    setNetMsg('Verbinden…')
    startedGuestRef.current = false
    const net = new SoccerNet('guest', code, {
      onSubscribed: () => { setNetMsg('Verbonden — wachten op de indeling van de host…'); net.sendJoin({ peerId: net.peerId, name: guestMeta.name, team: guestMeta }) },
      onLobby: (payload) => { const mine = payload.slots.find((sl) => sl.peerId === net.peerId); if (mine) { setMyTeam(mine.team); mySlotRef.current = mine.slot } },
      onStart: (payload) => {
        if (startedGuestRef.current) return
        startedGuestRef.current = true
        const mine = payload.slots?.find((sl) => sl.peerId === net.peerId)
        const cosmetic = payload.venue && payload.weather ? { venue: payload.venue, weather: payload.weather, ballScale: payload.ballScale ?? 1, bigHeads: payload.bigHeads, slippery: payload.slippery } : undefined
        beginMatch('guest', payload.teams, payload.halfSec, cosmetic)
        if (mine) { mySlotRef.current = mine.slot; humanTeamRef.current = mine.team; setMyTeam(mine.team) }
      },
      onSnapshot: (snap) => { snapBufRef.current.push({ snap, at: performance.now() }) },
      onPeerLeft: () => { setNetMsg('De host verliet het spel.'); backToMenu() },
    }, guestMeta.name)
    netRef.current = net
    net.connect()
  }

  const cancelLobby = () => {
    netRef.current?.leave()
    netRef.current = null
    roleRef.current = null
    setRole(null)
    setLobby('idle')
    setNetMsg('')
    netHost2v2Ref.current = false
    net2v2GuestRef.current = false
  }

  useEffect(() => {
    if (stage !== 'match') return
    const canvas = canvasRef.current
    const s = stateRef.current
    if (!canvas || !s) return
    let cancelled = false
    setReady(false) // laadscherm tonen tot de WebGL-renderer klaar is
    const renderer = new PixiSoccerRenderer()
    rendererRef.current = renderer
    const faces = Array.from(new Set(s.players.map((p) => p.face).filter((f): f is string => !!f)))
    // Speler 1: standaard toetsenbord+eerste controller; bij multiplayer het gekozen apparaat.
    const kb = twoPlayerRef.current ? makePlayerInput(p1DeviceRef.current) : new KeyboardInput()
    kb.attach()
    inputRef.current = kb
    const attachDev = (ref: typeof input2Ref, on: boolean, dev: InputDevice) => {
      if (on) { const k = makePlayerInput(dev); k.attach(); ref.current = k } else { ref.current = null }
    }
    attachDev(input2Ref, twoPlayerRef.current, p2DeviceRef.current) // speler 2 (team 0 co-op/2v2, of team 1 bij 1v1)
    attachDev(input3Ref, fourPlayerRef.current, p3DeviceRef.current) // 2v2: team 1 speler 3
    attachDev(input4Ref, fourPlayerRef.current, p4DeviceRef.current) // 2v2: team 1 speler 4
    const ro = new ResizeObserver(() => resizeRenderer())
    if (wrapRef.current) ro.observe(wrapRef.current)
    const loop = (t: number) => {
      const now = t / 1000
      let frameDt = now - lastRef.current
      lastRef.current = now
      if (frameDt > 0.25) frameDt = 0.25
      advance(frameDt)
      rafRef.current = requestAnimationFrame(loop)
    }
    void renderer.init(canvas, s, faces, venueRef.current ?? undefined).then(() => {
      if (cancelled) { renderer.destroy(); return }
      resizeRenderer()
      lastRef.current = performance.now() / 1000
      rafRef.current = requestAnimationFrame(loop)
      setReady(true)
      // Omgevingsgeluid: publiek altijd, regen alleen bij regenweer (renderer koos 't).
      crowdAudioRef.current = startLoop('/sfx/crowd.mp3', 0.28)
      if (renderer.activeWeather === 'rain') rainAudioRef.current = startLoop('/sfx/rain.mp3', 0.3)
    })
    return () => {
      cancelled = true
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      kb.detach()
      input2Ref.current?.detach(); input2Ref.current = null
      input3Ref.current?.detach(); input3Ref.current = null
      input4Ref.current?.detach(); input4Ref.current = null
      ro.disconnect()
      renderer.destroy()
      rendererRef.current = null
      crowdAudioRef.current?.pause(); crowdAudioRef.current = null
      rainAudioRef.current?.pause(); rainAudioRef.current = null
    }
  }, [stage, advance, resizeRenderer])

  useEffect(() => () => { netRef.current?.leave(); if (flashTimerRef.current) clearTimeout(flashTimerRef.current) }, [])

  const resumeSecondHalf = () => {
    const s = stateRef.current
    if (!s) return
    startSecondHalf(s)
    controlledRef.current = nearestTeammateToBall(s, humanTeamRef.current)
    rendererRef.current?.resetCamera(s)
    overlayRef.current = null
    setOverlay(null)
    pausedRef.current = false
    lastRef.current = performance.now() / 1000
    accRef.current = 0
  }

  const rematch = () => {
    const s = stateRef.current
    if (roleRef.current === 'host' && s) {
      const teams = s.teams
      stateRef.current = null
      startHostMatch(teams, s.halfLengthSec)
    } else if (s) {
      beginMatch(null, s.teams, s.halfLengthSec)
    }
  }

  const myTeamName = matchTeams ? matchTeams[role === 'guest' ? 1 : 0].name : ''
  const controlHint = role !== null
    ? `Jij bent ${myTeamName} · WASD = lopen · Shift = sprint · spatie = schot/pass · E = stift · R = kap · Q = panna/hakje/sliding · X = wisselen · 🎮 controller ondersteund`
    : 'WASD = lopen · Shift = sprint · spatie = schot/pass · E = stift · R = kap · Q = panna/hakje/sliding · X = wisselen · 🎮 controller ondersteund'

  return (
    <div data-game-root className="relative min-h-screen bg-wk-bg text-wk-text overflow-hidden">
      <ImmersiveToggle />
      <Link
        href="/poules"
        aria-label="Sluiten"
        onClick={(e) => { e.preventDefault(); close() }}
        className="fixed top-4 right-4 z-[61] flex items-center justify-center w-10 h-10 rounded-full bg-wk-surface border border-white/10 text-wk-soft hover:text-wk-text hover:border-white/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Link>

      {tooSmall && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-wk-bg/95 px-8 text-center">
          <span className="text-4xl">🖥️</span>
          <h2 className="font-display text-2xl uppercase text-wk-gold">Speel op desktop</h2>
          <p className="max-w-xs text-sm text-wk-soft">Kopstukken is een toetsenbordspel voor een groot scherm. Open deze pagina op je computer.</p>
        </div>
      )}

      {stage === 'menu' ? (
        <div className="fixed inset-0 flex flex-col overflow-hidden bg-wk-bg">
          {/* sfeer-glows */}
          <div className="pointer-events-none absolute -left-48 -top-48 h-[480px] w-[480px] rounded-full opacity-[0.10] blur-3xl" style={{ background: 'radial-gradient(closest-side, var(--color-wk-gold), transparent)' }} />
          <div className="pointer-events-none absolute -right-48 top-1/4 h-[440px] w-[440px] rounded-full opacity-[0.08] blur-3xl" style={{ background: 'radial-gradient(closest-side, #2D6BE5, transparent)' }} />

          <header className="relative flex items-center justify-center px-10 pb-4 pt-6">
            <Image src="/spelers/kopstukken.png" alt="Kopstukken" width={1408} height={704} priority className="h-20 w-auto" />
            {results.length > 0 && (
              <button onClick={() => setShowResults(true)}
                className="absolute left-10 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-wk-surface/70 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-wk-soft hover:border-white/35 hover:text-wk-text">
                🏆 Erelijst ({results.length})
              </button>
            )}
          </header>

          {showResults && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6" onClick={() => setShowResults(false)}>
              <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-white/12 bg-wk-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-lg uppercase tracking-[0.14em] text-wk-text">Erelijst</h2>
                  <button onClick={() => setShowResults(false)} className="font-mono text-[11px] uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</button>
                </div>
                {(() => {
                  const c = computeCareer(results)
                  return (
                    <div className="mb-3 shrink-0 space-y-2">
                      <div className="grid grid-cols-4 gap-1.5">
                        <StatCell label="Gespeeld" value={c.played} />
                        <StatCell label="Winst" value={c.w} tone="text-wk-green" />
                        <StatCell label="Gelijk" value={c.d} tone="text-wk-gold" />
                        <StatCell label="Verlies" value={c.l} tone="text-wk-red" />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <StatCell label="Voor / Tegen" value={`${c.gf}–${c.ga}`} />
                        <StatCell label="Zegereeks" value={c.winStreak} tone="text-wk-green" />
                        <StatCell label="Grootste zege" value={c.biggest?.text ?? '—'} />
                      </div>
                      {c.topScorers.length > 0 && (
                        <div className="rounded-lg bg-wk-bg2/60 px-3 py-2">
                          <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.16em] text-wk-muted">⚽ Topscorers (jouw teams)</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {c.topScorers.map(([name, n], i) => (
                              <span key={name} className="font-mono text-[11px] text-wk-soft">
                                <span className="text-wk-gold">{i + 1}.</span> {name} <span className="text-wk-muted">({n})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {c.nemesis && (
                        <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-wk-muted">
                          😤 Angstgegner: <span className="text-wk-red">{c.nemesis.name}</span> ({c.nemesis.l}× verloren)
                        </p>
                      )}
                    </div>
                  )
                })()}
                <p className="mb-1.5 shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-wk-muted">Wedstrijden</p>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scrollbar-none">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-wk-bg2/60 px-3 py-2">
                      <span className="flex-1 truncate text-right font-mono text-xs uppercase tracking-wide" style={{ color: r.ca }}>{r.a}</span>
                      <span className="shrink-0 font-score text-lg leading-none text-wk-text tabular-nums">{r.sa}<span className="mx-1 text-wk-muted">-</span>{r.sb}</span>
                      <span className="flex-1 truncate font-mono text-xs uppercase tracking-wide" style={{ color: r.cb }}>{r.b}</span>
                      {r.pens !== undefined && (
                        <span className="shrink-0 rounded-full bg-wk-gold/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-wk-gold" title="na strafschoppen">p:{r.pens === 0 ? r.a : r.b}</span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setResults([]); try { localStorage.removeItem(RESULTS_KEY) } catch { /* */ } setShowResults(false) }}
                  className="mt-3 shrink-0 self-center font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted hover:text-wk-red"
                >Wis geschiedenis</button>
              </div>
            </div>
          )}

          {showControls && (
            <ControlsModal onClose={() => setShowControls(false)} onApply={(b) => inputRef.current?.setBindings(b)} />
          )}
          {showTraits && (
            <TraitsModal current={customTraits} onClose={() => setShowTraits(false)} onSave={setCustomTraits} />
          )}
          {showMatchSettings && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6" onClick={() => setShowMatchSettings(false)}>
              <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-2xl border border-white/12 bg-wk-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg uppercase tracking-[0.14em] text-wk-text">Instellingen</h2>
                  <button onClick={() => setShowMatchSettings(false)} className="font-mono text-[11px] uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</button>
                </div>

                {mode === 'online' && (
                  <Field label="Kamer"><Segmented options={['1v1', '2v2']} value={onlineSize === 2 ? 0 : 1} onChange={(i) => setOnlineSize(i === 0 ? 2 : 4)} /></Field>
                )}

                {(mode === 'local' || mode === 'coop') && (
                  <Field label="Moeilijkheid"><Segmented options={DIFFICULTY.map((o) => o.label)} value={DIFFICULTY.findIndex((o) => o.val === difficulty)} onChange={(i) => setDifficulty(DIFFICULTY[i].val)} /></Field>
                )}

                {(mode === 'local2p' || mode === 'coop') && (
                  <>
                    <Field label="Speler 1"><DevicePicker value={p1Device} onChange={setP1Device} padCount={padCount} /></Field>
                    <Field label="Speler 2"><DevicePicker value={p2Device} onChange={setP2Device} padCount={padCount} /></Field>
                  </>
                )}
                {mode === 'local2v2' && (
                  <>
                    <Field label="Speler 1 · team A"><DevicePicker value={p1Device} onChange={setP1Device} padCount={padCount} /></Field>
                    <Field label="Speler 2 · team A"><DevicePicker value={p2Device} onChange={setP2Device} padCount={padCount} /></Field>
                    <Field label="Speler 3 · team B"><DevicePicker value={p3Device} onChange={setP3Device} padCount={padCount} /></Field>
                    <Field label="Speler 4 · team B"><DevicePicker value={p4Device} onChange={setP4Device} padCount={padCount} /></Field>
                  </>
                )}

                {mode !== 'penalty' && (
                  <>
                    <Field label="Bal"><Segmented options={['Normaal', '⚽ Giant']} value={giantBall ? 1 : 0} onChange={(i) => setGiantBall(i === 1)} /></Field>
                    <Field label="Chaos">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setBigHeads(!bigHeads)}
                          className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${bigHeads ? 'border-wk-gold bg-wk-gold/15 text-wk-gold' : 'border-white/15 text-wk-soft hover:border-white/35'}`}>🗿 Grote koppen</button>
                        <button type="button" onClick={() => setSlippery(!slippery)}
                          className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${slippery ? 'border-wk-gold bg-wk-gold/15 text-wk-gold' : 'border-white/15 text-wk-soft hover:border-white/35'}`}>⛸️ Gladde mat</button>
                      </div>
                    </Field>
                  </>
                )}

                <Field label="Besturing">
                  <button type="button" onClick={() => { setShowMatchSettings(false); setShowControls(true) }}
                    className="w-full rounded-lg border border-white/15 px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-wk-soft transition hover:border-white/35 hover:text-wk-text">
                    🎮 Toetsen &amp; controller aanpassen
                  </button>
                </Field>

                <button onClick={() => setShowMatchSettings(false)} className="mt-1 rounded-lg border border-wk-green/50 bg-wk-green/15 px-5 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-wk-green hover:bg-wk-green/25">Klaar</button>
              </div>
            </div>
          )}

          {lobby !== 'idle' ? (
            <div className="relative flex flex-1 items-center justify-center px-8">
              <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-white/10 bg-wk-surface/60 px-8 py-10 text-center backdrop-blur-sm animate-fade-up">
                {lobby === 'hosting2v2' ? (() => {
                  const guests = lobbyMembers.filter((m) => m.role === 'guest')
                  const aCount = guests.filter((g) => teamAssign[g.peerId] === 0).length
                  const bCount = guests.filter((g) => (teamAssign[g.peerId] ?? 1) === 1).length
                  const ready = guests.length === 3 && aCount === 1 && bCount === 2
                  return (
                    <>
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-wk-muted">2v2 · deel deze code</p>
                      <p className="font-score text-6xl tracking-[0.15em] text-wk-gold">{roomCode}</p>
                      <div className="w-full space-y-1.5">
                        <div className="flex items-center justify-between rounded-lg border border-wk-gold/40 bg-wk-gold/10 px-3 py-2">
                          <span className="truncate font-mono text-[11px] text-wk-gold">{lobbyMembers.find((m) => m.role === 'host')?.name || 'Jij'} (host)</span>
                          <span className="font-mono text-[10px] uppercase text-wk-gold">Team A</span>
                        </div>
                        {guests.map((g) => {
                          const t = teamAssign[g.peerId] ?? 1
                          return (
                            <div key={g.peerId} className="flex items-center justify-between gap-2 rounded-lg border border-white/12 bg-wk-bg2/60 px-3 py-1.5">
                              <span className="truncate font-mono text-[11px] text-wk-soft">{g.name || 'Speler'}</span>
                              <div className="flex gap-1">
                                <button onClick={() => setTeamAssign((m) => ({ ...m, [g.peerId]: 0 }))} className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${t === 0 ? 'bg-wk-gold/20 text-wk-gold ring-1 ring-wk-gold/40' : 'text-wk-muted hover:text-wk-soft'}`}>Team A</button>
                                <button onClick={() => setTeamAssign((m) => ({ ...m, [g.peerId]: 1 }))} className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${t === 1 ? 'bg-white/15 text-wk-text ring-1 ring-white/25' : 'text-wk-muted hover:text-wk-soft'}`}>Team B</button>
                              </div>
                            </div>
                          )
                        })}
                        {guests.length < 3 && <p className="font-mono text-[10px] uppercase tracking-wide text-wk-muted">Wachten op {3 - guests.length} speler(s)…</p>}
                      </div>
                      {guests.length === 3 && !ready && <p className="font-mono text-[10px] uppercase tracking-wide text-wk-red">Zet 1 speler in Team A en 2 in Team B.</p>}
                      <button onClick={start2v2Online} disabled={!ready} className={`${btnCool} w-full py-3 text-2xl ${ready ? '' : 'opacity-40'}`}>Start 2v2 →</button>
                    </>
                  )
                })() : lobby === 'joining2v2' ? (
                  <>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-wk-muted">2v2-kamer</p>
                    {myTeam == null
                      ? <p className="text-sm text-wk-soft">Verbonden — wachten op de indeling van de host…</p>
                      : <p className="text-sm text-wk-soft">Jij zit in <span className="font-bold text-wk-gold">Team {myTeam === 0 ? 'A' : 'B'}</span> · wachten op de aftrap…</p>}
                  </>
                ) : lobby === 'hosting' ? (
                  <>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-wk-muted">Deel deze code met je tegenstander</p>
                    <p className="font-score text-7xl tracking-[0.15em] text-wk-gold">{roomCode}</p>
                  </>
                ) : (
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-wk-muted">Verbinden met host…</p>
                )}
                <p className="text-sm text-wk-soft">{netMsg || 'Verbinden…'}</p>
                <button onClick={cancelLobby} className={btnGhost}>Annuleren</button>
              </div>
            </div>
          ) : (
            <main className="relative flex-1 overflow-y-auto scrollbar-none px-6 pb-6">
              <div className="mx-auto grid h-full max-w-[1220px] grid-cols-[290px_minmax(380px,1fr)_290px] gap-5">

                {/* LINKS — team-identiteit */}
                <Panel title="Jouw team" className="animate-fade-up">
                  <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto scrollbar-none pr-0.5">
                    <Field label="Teamnaam">
                      <input value={teamName} onChange={(e) => setTeamName(e.target.value.slice(0, 18))} placeholder="bijv. Padel Kings"
                        className="w-full rounded-xl border border-white/15 bg-wk-bg2 px-4 py-2.5 font-score text-2xl uppercase tracking-[0.08em] text-wk-text outline-none placeholder:font-mono placeholder:text-sm placeholder:tracking-normal placeholder:normal-case placeholder:text-wk-muted focus:border-wk-gold" />
                    </Field>
                    <Field label="Tenue">
                      <div className="flex flex-wrap gap-2.5">
                        {KITS.map((k) => (
                          <button key={k.id} onClick={() => setKit({ shirt: k.shirt, trim: k.trim, keeper: k.keeper })} aria-label={k.label}
                            className={`h-10 w-10 rounded-full border-2 transition ${kit.shirt === k.shirt ? 'scale-110 ring-2 ring-white/85' : 'border-white/20 hover:scale-105'}`}
                            style={{ background: k.shirt, borderColor: k.trim }} />
                        ))}
                      </div>
                    </Field>
                    <Field label="Of kies een land">
                      <div className="grid max-h-[188px] grid-cols-2 gap-1.5 overflow-y-auto scrollbar-none rounded-xl border border-white/10 bg-wk-bg2/40 p-2">
                        {COUNTRIES.map((c) => (
                          <button key={c.short} onClick={() => { setTeamName(c.name); setKit({ shirt: c.shirt, trim: c.trim, keeper: c.keeper }) }}
                            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${teamName === c.name ? 'border-wk-gold bg-wk-gold/10 text-wk-gold' : 'border-transparent text-wk-soft hover:border-white/20 hover:bg-white/5'}`}>
                            <span className="text-base leading-none">{c.flag}</span>
                            <span className="truncate font-mono text-[10px] uppercase tracking-wide">{c.short}</span>
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                </Panel>

                {/* MIDDEN — opstelling (formatie + veld + spelers) */}
                <Panel title="Opstelling" className="animate-fade-up" style={{ animationDelay: '60ms' }}>
                  <div className="mb-4 grid grid-cols-4 gap-2">
                    {FORMATIONS.map((f) => {
                      const pattern = f.label.split(' (')[0]
                      const two = f.label.includes('2 spitsen')
                      return (
                        <button key={f.id} onClick={() => setFormationId(f.id)} title={f.label}
                          className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors ${formationId === f.id ? 'border-wk-gold bg-wk-gold/10 text-wk-gold' : 'border-white/10 text-wk-soft hover:border-white/30'}`}>
                          <span className="font-score text-base leading-none tracking-wide">{pattern}</span>
                          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-wk-muted">{two ? '2 spits' : '1 spits'}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <FormationPitch formationId={formationId} lineup={lineup} kitShirt={kit.shirt} picked={!!picked}
                      onSlot={(i) => {
                        if (!picked) { setPicked(lineup[i] ? { player: lineup[i]!, from: i } : null); return }
                        setLineup((l) => {
                          const n = [...l]
                          if (picked.from === null) {
                            // Uit de pool: plaats hier; stond deze speler al ergens, dan verhuist-ie (geen dubbele).
                            const j = n.findIndex((p) => p?.face === picked.player.face)
                            if (j >= 0 && j !== i) n[j] = null
                            n[i] = picked.player
                          } else {
                            // Van een andere veldplek: wissel de twee posities om.
                            const tmp = n[i]
                            n[i] = picked.player
                            n[picked.from] = tmp
                          }
                          return n
                        })
                        setPicked(null)
                      }} />
                  </div>

                  {/* spelerspool */}
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">Spelers</p>
                        <button type="button" onClick={() => setShowTraits(true)}
                          className="rounded-md border border-white/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-wk-soft transition hover:border-white/35 hover:text-wk-text">
                          ⚙ Traits
                        </button>
                      </div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-wk-soft">
                        {picked ? <span className="text-wk-gold">{picked.player.name} → {picked.from === null ? 'klik een plek' : 'klik een plek om te wisselen'}</span> : 'Klik een speler of veldplek'}
                      </p>
                    </div>
                    <div className="grid grid-cols-6 justify-items-center gap-2">
                      {PLAYER_POOL.map((p) => {
                        const inTeam = lineup.some((l) => l?.face === p.face)
                        const isPicked = picked?.player.face === p.face && picked.from === null
                        return (
                          <button key={p.face} onClick={() => setPicked(isPicked ? null : { player: p, from: null })}
                            className="group relative flex flex-col items-center">
                            <span className={`relative block h-12 w-12 overflow-hidden rounded-full border-2 transition ${isPicked ? 'scale-110 border-wk-gold ring-2 ring-wk-gold/50' : inTeam ? 'border-wk-gold/60' : 'border-white/15 opacity-80 group-hover:opacity-100'}`}>
                              <Image src={`/spelers/${p.face}`} alt={p.name} width={48} height={48} className="h-full w-full object-cover" />
                              {inTeam && !isPicked && (
                                <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-wk-gold text-[9px] font-bold text-wk-bg ring-1 ring-wk-bg">✓</span>
                              )}
                            </span>
                            <span className="mt-1 max-w-[52px] truncate font-mono text-[9px] uppercase tracking-wide text-wk-soft">{p.name}</span>
                            <span className="max-w-[52px] truncate font-mono text-[8px] uppercase tracking-wide text-wk-gold/70">{p.tag}</span>
                            {/* Hover-kaart met de traits (pijl onderaan naar de speler) */}
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 hidden w-44 -translate-x-1/2 group-hover:block">
                              <span className="block rounded-xl border border-white/15 bg-wk-bg/95 p-3 text-left shadow-2xl backdrop-blur-sm">
                                <span className="mb-0.5 block font-display text-sm uppercase leading-none tracking-wide text-white">{p.name}</span>
                                <span className="mb-2 block font-mono text-[9px] uppercase tracking-[0.14em] text-wk-gold/80">{p.tag}</span>
                                <TraitRow label="Snelheid" v={traitsFor(p.face).pace} color="#4FA8E0" />
                                <TraitRow label="Schot" v={traitsFor(p.face).shot} color="#F4B92E" />
                                <TraitRow label="Tackle" v={traitsFor(p.face).tackle} color="#E63946" />
                              </span>
                              <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-white/15 bg-wk-bg/95" />
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </Panel>

                {/* RECHTS — modus-keuze + wedstrijd-instellingen + start */}
                <div className="flex min-h-0 flex-col gap-3 animate-fade-up" style={{ animationDelay: '120ms' }}>
                  <div className="shrink-0 space-y-2">
                    <Segmented options={['Computer', 'Multiplayer']} value={mode === 'local' ? 0 : 1} onChange={(i) => { setMode(i === 0 ? 'local' : 'local2p'); cancelLobby() }} />
                    {mode !== 'local' && mode !== 'penalty' && (
                      <div className="grid grid-cols-2 gap-2">
                        {MP_MODES.map((m) => {
                          const active = mode === m.id
                          return (
                            <button key={m.id} type="button" onClick={() => { setMode(m.id); cancelLobby() }}
                              className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-wk-gold bg-wk-gold/15' : 'border-white/12 hover:border-white/35'}`}>
                              <span className={`block font-display text-sm uppercase tracking-wide ${active ? 'text-wk-gold' : 'text-wk-text'}`}>{m.label}</span>
                              <span className="block font-mono text-[9px] uppercase tracking-wide text-wk-muted">{m.desc}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <Panel title="Wedstrijd" className="flex-1">
                    <div className="flex flex-1 flex-col gap-5">
                      <button type="button" onClick={() => setShowMatchSettings(true)}
                        className="flex w-full items-center justify-between rounded-lg border border-white/15 px-3 py-2.5 font-mono text-[11px] uppercase tracking-wide text-wk-soft transition hover:border-white/35 hover:text-wk-text">
                        <span>⚙ Instellingen</span>
                        <span className="text-wk-muted">
                          {[giantBall && '⚽', bigHeads && '🗿', slippery && '⛸️'].filter(Boolean).join(' ') || 'standaard'}
                        </span>
                      </button>

                      <div className="mt-auto space-y-3 pt-4">
                        {mode === 'penalty' ? (
                          <>
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-wk-muted">Serie strafschoppen vs. de computer</p>
                            <button onClick={startPenalties} className={`${btnCool} w-full py-4 text-3xl`}>Penalty&apos;s 🧤</button>
                          </>
                        ) : mode === 'local' ? (
                          <>
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-wk-muted">Tegenstander: willekeurig land</p>
                            <button onClick={startLocal} className={`${btnCool} w-full py-4 text-3xl`}>Aftrap →</button>
                          </>
                        ) : mode === 'local2p' || mode === 'coop' || mode === 'local2v2' ? (() => {
                          const is2v2 = mode === 'local2v2'
                          const devs: InputDevice[] = is2v2 ? [p1Device, p2Device, p3Device, p4Device] : [p1Device, p2Device]
                          const dup = new Set(devs).size !== devs.length
                          const hint = mode === 'coop' ? 'Samen op één team tegen de computer' : is2v2 ? '2 tegen 2 op dezelfde PC' : 'Speler 1 tegen speler 2, zelfde PC'
                          return (
                            <>
                              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-wk-muted">{hint} · apparaten via ⚙ instellingen</p>
                              {dup && <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-wk-red">Kies voor elke speler een ander apparaat (⚙ instellingen).</p>}
                              <button onClick={mode === 'coop' ? startCoop : is2v2 ? start2v2 : startLocal2p} disabled={dup} className={`${btnCool} w-full py-4 text-3xl ${dup ? 'opacity-50' : ''}`}>
                                {mode === 'coop' ? 'Aftrap → co-op' : is2v2 ? 'Aftrap → 2v2' : 'Aftrap → 2 spelers'}
                              </button>
                            </>
                          )
                        })() : (
                          <>
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-wk-muted">Kamer: {onlineSize === 4 ? '2 vs 2' : '1 vs 1'} · wijzig via ⚙ instellingen</p>
                            <button onClick={onlineSize === 4 ? hostGame2v2 : hostGame} className={`${btn} w-full !py-3.5`}>Nieuwe wedstrijd</button>
                            <div className="flex items-center gap-2">
                              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="CODE"
                                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-wk-bg2 px-3 py-3 text-center font-mono text-lg uppercase tracking-[0.25em] text-wk-text outline-none focus:border-wk-gold" />
                              <button onClick={onlineSize === 4 ? joinGame2v2 : joinGame} className={btnGhost}>Join</button>
                            </div>
                            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-wk-muted">
                              {onlineSize === 4 ? '2v2: host maakt de kamer en wijst de teams toe zodra 3 spelers joinen.' : 'Host een wedstrijd en deel je code, of vul de code van je tegenstander in.'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </Panel>
                </div>

              </div>
            </main>
          )}
        </div>
      ) : stage === 'penalty' ? (
        <div className="fixed inset-0 bg-wk-bg">
          {matchTeams && !penaltyResult && (
            <Shootout teams={matchTeams} humanTeam={0} onDone={(winner, score) => setPenaltyResult({ winner, score })} />
          )}
          {penaltyResult && matchTeams && (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 42%, ${penaltyResult.winner === 0 ? 'rgba(46,168,75,0.35)' : 'rgba(230,57,70,0.3)'}, rgba(5,7,12,0.94) 66%)` }} />
              <div className="relative z-10 flex flex-col items-center gap-5 px-8 text-center">
                <h2 className="font-score text-6xl uppercase tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
                  {penaltyResult.winner === 0 ? 'Gewonnen! 🏆' : 'Verloren'}
                </h2>
                <p className="font-score text-5xl leading-none text-white">
                  {matchTeams[0].short} {penaltyResult.score[0]} <span className="text-white/50">:</span> {penaltyResult.score[1]} {matchTeams[1].short}
                </p>
                <div className="flex gap-2 pt-1">
                  <button onClick={startPenalties} className={btn}>Opnieuw</button>
                  <button onClick={() => { setStage('menu'); setPenaltyResult(null) }} className={btnGhost}>Menu</button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div ref={wrapRef} className="fixed inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" />

          {/* Laadscherm i.p.v. zwart beeld: toont alvast de opstellingen terwijl WebGL laadt */}
          {!ready && matchTeams && <LoadingScreen teams={matchTeams} />}

          {/* Broadcast-scoreboard: [tijd] [vlag stip CODE] score (embleem) score [CODE stip vlag] */}
          {matchTeams && (
            <div className="pointer-events-none absolute left-4 top-3 flex items-stretch overflow-hidden rounded-md font-display shadow-xl ring-1 ring-black/30">
              {/* tijdbox */}
              <div className="flex items-center bg-white px-3">
                <span ref={clockElRef} className="inline-block w-[3.2em] text-center font-score text-lg leading-none text-[#12151c] tabular-nums">00:00</span>
              </div>
              {/* donkere balk */}
              <div className="relative flex items-center gap-2 bg-[#12151c] px-3 py-2">
                {matchTeams[0].flag && <span className="text-base leading-none">{matchTeams[0].flag}</span>}
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: matchTeams[0].shirt }} />
                <span className="font-score text-base uppercase leading-none tracking-[0.02em] text-white">{matchTeams[0].short}</span>
                <span ref={score0Ref} className="ml-1 inline-block min-w-[0.85em] text-center font-score text-xl leading-none text-white tabular-nums">0</span>
                <span className="mx-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-wk-gold text-[13px] leading-none shadow-inner">⚽</span>
                <span ref={score1Ref} className="mr-1 inline-block min-w-[0.85em] text-center font-score text-xl leading-none text-white tabular-nums">0</span>
                <span className="font-score text-base uppercase leading-none tracking-[0.02em] text-white">{matchTeams[1].short}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: matchTeams[1].shirt }} />
                {matchTeams[1].flag && <span className="text-base leading-none">{matchTeams[1].flag}</span>}
                {/* team-gekleurde accentlijn onderaan */}
                <div className="absolute inset-x-0 bottom-0 flex h-[3px]">
                  <div className="flex-1" style={{ background: matchTeams[0].shirt }} />
                  <div className="flex-1" style={{ background: matchTeams[1].shirt }} />
                </div>
              </div>
            </div>
          )}

          <div ref={powerWrapRef} className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 h-3 w-64 overflow-hidden rounded-full bg-wk-bg/75 opacity-0 transition-opacity" style={{ opacity: 0 }}>
            <div ref={powerFillRef} className="h-full w-0 rounded-full" style={{ background: '#2EA84B' }} />
          </div>

          {/* Stamina van de bestuurde speler (sprint) — linksonder */}
          {overlay === null && (
            <div className="pointer-events-none absolute bottom-5 left-4 flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/60">Sprint</span>
              <div className="h-2 w-28 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
                <div ref={staminaFillRef} className="h-full w-full rounded-full transition-[width] duration-100" style={{ background: '#2EA84B' }} />
              </div>
            </div>
          )}

          {overlay === null && !scoreFlash && !hintDone && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
              {controlHint}
            </div>
          )}

          {/* Na de goal-animatie kort de tussenstand groot onderin */}
          {overlay === null && scoreFlash && matchTeams && (
            <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-fade-up">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-wk-muted">Tussenstand</p>
              <p className="font-score text-6xl leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)]">
                <span style={{ color: matchTeams[0].shirt }}>{matchTeams[0].short}</span> {scoreFlash[0]} <span className="text-wk-muted">–</span> {scoreFlash[1]} <span style={{ color: matchTeams[1].shirt }}>{matchTeams[1].short}</span>
              </p>
            </div>
          )}

          {/* Set-piece-melding (ingooi/hoekschop/doeltrap/vrije trap) */}
          {overlay === null && setpieceLabel && (
            <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 animate-fade-up rounded-full bg-black/55 px-6 py-2 font-mono text-sm uppercase tracking-[0.22em] text-white shadow-lg ring-1 ring-white/10">
              {setpieceLabel}
            </div>
          )}

          {/* Commentaar-popup (bijv. "Wat een redding!") */}
          {overlay === null && !setpieceLabel && toast && (
            <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2" style={{ animation: 'goal-pop 0.4s cubic-bezier(0.2,1.5,0.4,1) both' }}>
              <span className="block font-score text-5xl sm:text-6xl uppercase tracking-[0.04em] text-wk-gold text-center drop-shadow-[0_3px_0_rgba(0,0,0,0.55)] [text-shadow:0_0_22px_rgba(244,185,46,0.55)]">{toast}</span>
            </div>
          )}

          {/* Commentaar-feed: laatste 3 quips, oplopend, links onderin */}
          {commentary.length > 0 && (
            <div className="pointer-events-none absolute bottom-20 left-4 flex max-w-[62%] flex-col gap-1.5 sm:max-w-sm">
              {commentary.map((c) => (
                <span key={c.id} className="w-fit rounded-lg border border-white/10 bg-black/65 px-3 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
                  style={{ animation: 'goal-pop 0.35s cubic-bezier(0.2,1.4,0.4,1) both' }}>
                  {c.text}
                </span>
              ))}
            </div>
          )}

          {/* Overtredings-animatie (spel ligt stil) — duidelijk zichtbaar, daarna vrije trap */}
          {foulFlash && !cardFlash && (
            <div className="pointer-events-none absolute inset-0 z-[68] flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(228,97,15,0.42), rgba(5,7,12,0.86) 66%)', animation: 'goal-in 0.25s ease-out both' }} />
              <div className="absolute left-1/2 top-1/2 h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 opacity-20" style={{ background: 'repeating-conic-gradient(from 0deg, #E4610F00 0deg, #E4610F99 6deg, #E4610F00 13deg)', animation: 'goal-rays 9s linear infinite' }} />
              <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: '5px solid #E4610F', animation: 'goal-ring 0.7s ease-out both' }} />
              <div className="relative flex flex-col items-center gap-2" style={{ animation: 'goal-pop 0.45s cubic-bezier(0.2,1.4,0.4,1) both' }}>
                <span className="text-5xl drop-shadow">🟠🎽</span>
                <h1 className="font-display text-6xl uppercase tracking-wider text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)]">Overtreding!</h1>
                <p className="font-mono text-sm uppercase tracking-[0.24em] text-wk-gold">Vrije trap</p>
              </div>
            </div>
          )}

          {/* Kaart-animatie (langer + cooler dan een normale overtreding) */}
          {cardFlash && <CardCelebration key={`${cardFlash.red ? 'red' : 'yellow'}-${cardFlash.n}`} card={cardFlash} />}

          {/* Aftellen 3-2-1-GO voor de aftrap */}
          {countdown !== null && <Countdown value={countdown} />}

          {/* Pauzemenu (Esc) */}
          {paused && (
            <div className="absolute inset-0 z-[78] flex items-center justify-center bg-wk-bg/85 backdrop-blur-[3px]">
              <div className="flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl border border-white/10 bg-wk-surface/70 px-8 py-9 text-center animate-fade-up">
                <h2 className="font-score text-5xl uppercase tracking-tight text-wk-gold">Pauze</h2>
                <div className="flex w-full flex-col gap-2.5">
                  <button onClick={() => { setPaused(false); pausedRef.current = false }} className={`${btn} w-full`}>Hervatten</button>
                  <button onClick={() => { setPaused(false); rematch() }} className={`${btnGhost} w-full`}>Opnieuw</button>
                  <button onClick={() => { setPaused(false); backToMenu() }} className={`${btnGhost} w-full`}>Naar menu</button>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">Esc = hervatten</p>
              </div>
            </div>
          )}

          {overlay === 'goal' && <GoalCelebration info={goalInfo} />}

          {/* Strafschoppenserie bij gelijkspel (lokaal) — vóór het eindscherm */}
          {overlay === 'fulltime' && shootout && !shootoutResult && matchTeams && (
            <Shootout
              teams={matchTeams}
              humanTeam={role === 'guest' ? 1 : 0}
              onDone={(winner, score) => {
                setShootoutResult({ winner, score })
                setShootout(false)
                setPanelInfo((pi) => pi ? {
                  ...pi,
                  result: winner === humanTeamRef.current ? 'win' : 'loss',
                  note: `na strafschoppen ${score[0]}–${score[1]}`,
                } : pi)
                // De zojuist vastgelegde (gelijkspel-)uitslag aanvullen met de penalty-winnaar.
                setResults((prev) => {
                  if (!prev.length) return prev
                  const next = [{ ...prev[0], pens: winner }, ...prev.slice(1)]
                  try { localStorage.setItem(RESULTS_KEY, JSON.stringify(next)) } catch { /* quota */ }
                  return next
                })
              }}
            />
          )}

          {(overlay === 'halftime' || (overlay === 'fulltime' && !(shootout && !shootoutResult))) && panelInfo && matchTeams && (
            <BreakPanel info={panelInfo} teams={matchTeams}>
              {overlay === 'halftime' ? (
                role === 'guest'
                  ? <p className="font-mono text-xs uppercase tracking-[0.16em] text-wk-muted">Wachten op host…</p>
                  : <button onClick={resumeSecondHalf} className={btn}>Tweede helft →</button>
              ) : role === 'guest' ? (
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-wk-muted">Wachten op host…</p>
              ) : (
                <div className="flex gap-2">
                  <button onClick={rematch} className={btn}>Opnieuw</button>
                  <button onClick={backToMenu} className={btnGhost}>Menu</button>
                </div>
              )}
            </BreakPanel>
          )}
        </div>
      )}
    </div>
  )
}

// ── UI-fragmenten ────────────────────────────────────────────────────────────
const btn = 'font-display text-base uppercase tracking-wide px-7 py-2.5 rounded-full bg-wk-gold text-wk-bg hover:brightness-110 active:scale-95 transition cursor-pointer'
const btnGhost = 'font-display text-base uppercase tracking-wide px-6 py-2.5 rounded-full border border-white/20 text-wk-soft hover:text-wk-text hover:border-white/40 transition cursor-pointer'
// Stoere primaire CTA (aftrap/penalty): scorebord-font, groter, met lichte gloed.
const btnCool = 'font-score uppercase tracking-[0.1em] rounded-full bg-wk-gold text-wk-bg shadow-[0_6px_24px_rgba(244,185,46,0.35)] hover:brightness-110 active:scale-95 transition cursor-pointer'

// Veld met de opstelling: klikbare posities uit de gekozen formatie (jouw kant).
function FormationPitch({
  formationId, lineup, kitShirt, picked, onSlot,
}: {
  formationId: string
  lineup: (PoolPlayer | null)[]
  kitShirt: string
  picked: boolean
  onSlot: (i: number) => void
}) {
  const slots = formationById(formationId).slots
  return (
    <div className="relative aspect-[16/8] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 shadow-2xl ring-1 ring-black/30"
      style={{ background: 'repeating-linear-gradient(90deg,#1f7a37 0 8%,#237e3b 8% 16%)' }}>
      {/* lichtval + vignette voor diepte */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 30% 20%, rgba(255,255,255,0.10), transparent 55%)' }} />
      {/* veldlijnen: doel links (jouw kant), midlijn rechts */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-white/55" />
      <div className="pointer-events-none absolute inset-y-[30%] left-0 w-11 rounded-r border-2 border-l-0 border-white/45" />
      <div className="pointer-events-none absolute inset-y-[40%] left-0 w-4 rounded-r border-2 border-l-0 border-white/35" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/30" />
      <div className="pointer-events-none absolute right-0 top-1/2 h-24 w-24 -translate-y-1/2 translate-x-1/2 rounded-full border border-white/25" />
      <span className="pointer-events-none absolute right-3 top-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">aanval →</span>
      {slots.map((s, i) => {
        const p = lineup[i]
        const left = (s.anchor.x / 0.8) * 90 // 0..0.72 → mooi over de linkerhelft spreiden
        const placeable = picked // met een opgepakte speler: elke plek (incl. keeper) is klikbaar
        return (
          <button key={i} onClick={() => onSlot(i)} title={s.role}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${left}%`, top: `${s.anchor.y * 100}%` }}>
            <span className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-wk-bg2/90 shadow-md transition group-hover:scale-105 ${placeable ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-transparent' : ''}`} style={{ borderColor: kitShirt }}>
              {p ? <Image src={`/spelers/${p.face}`} alt={p.name} width={56} height={56} className="h-full w-full object-cover" /> : <span className="text-2xl font-light text-white/60">+</span>}
            </span>
            <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white">{p?.name ?? s.role}</span>
          </button>
        )
      })}
    </div>
  )
}

// Eén team op het mini-veld, geplaatst op z'n formatie-posities (side 0 = links, 1 = rechts/gespiegeld).
function PitchTeam({ meta, side }: { meta: TeamMeta; side: 0 | 1 }) {
  const slots = formationById(meta.formation).slots
  return (
    <>
      {slots.map((s, i) => {
        const p = meta.players[i]
        const xPct = (s.anchor.x / 0.8) * 46 // eigen helft = 0..46% van de breedte
        const left = side === 0 ? xPct : 100 - xPct
        return (
          <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${left}%`, top: `${s.anchor.y * 100}%` }}>
            <span className="block h-12 w-12 overflow-hidden rounded-full border-2 bg-wk-bg2 shadow-lg sm:h-14 sm:w-14" style={{ borderColor: meta.shirt }}>
              {p?.face && <Image src={`/spelers/${p.face}`} alt={p?.name ?? ''} width={56} height={56} className="h-full w-full object-cover" />}
            </span>
            <span className="max-w-[72px] truncate rounded bg-black/60 px-1.5 py-px font-score text-[9px] uppercase tracking-wide text-white sm:text-[11px]">{p?.name ?? s.role}</span>
          </div>
        )
      })}
    </>
  )
}

// Laadscherm terwijl de WebGL-renderer initialiseert: mini-veld met beide opstellingen tegenover elkaar.
function LoadingScreen({ teams }: { teams: [TeamMeta, TeamMeta] }) {
  return (
    <div className="absolute inset-0 z-[75] flex flex-col items-center justify-center gap-6 bg-wk-bg px-6">
      <div className="flex w-full max-w-3xl items-center justify-center gap-4 sm:gap-7">
        <div className="flex flex-1 items-center justify-end gap-3 text-right">
          <div className="flex flex-col items-end gap-1">
            <span className="font-score text-2xl uppercase leading-none tracking-tight text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.7)] sm:text-4xl">{teams[0].name}{teams[0].flag && <span className="ml-2">{teams[0].flag}</span>}</span>
            <span className="h-1 w-14 rounded-full sm:w-20" style={{ background: teams[0].shirt }} />
          </div>
          <TeamCrest short={teams[0].short} shirt={teams[0].shirt} trim={teams[0].trim} size={62} />
        </div>
        <span className="font-score text-3xl uppercase italic tracking-widest text-wk-gold drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-4xl">vs</span>
        <div className="flex flex-1 items-center gap-3 text-left">
          <TeamCrest short={teams[1].short} shirt={teams[1].shirt} trim={teams[1].trim} size={62} />
          <div className="flex flex-col items-start gap-1">
            <span className="font-score text-2xl uppercase leading-none tracking-tight text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.7)] sm:text-4xl">{teams[1].flag && <span className="mr-2">{teams[1].flag}</span>}{teams[1].name}</span>
            <span className="h-1 w-14 rounded-full sm:w-20" style={{ background: teams[1].shirt }} />
          </div>
        </div>
      </div>
      {/* mini-veld: opstellingen op positie, tegenover elkaar */}
      <div className="relative aspect-[16/9] w-full max-w-3xl overflow-hidden rounded-xl border border-white/15 shadow-2xl ring-1 ring-black/30"
        style={{ background: 'repeating-linear-gradient(90deg,#1f7a37 0 8%,#237e3b 8% 16%)' }}>
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/30" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <PitchTeam meta={teams[0]} side={0} />
        <PitchTeam meta={teams[1]} side={1} />
      </div>
      <div className="flex items-center gap-3 text-wk-muted">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-wk-gold" />
        <span className="font-mono text-xs uppercase tracking-[0.24em]">Veld klaarmaken…</span>
      </div>
    </div>
  )
}

// Aftel-animatie 3-2-1-GO vóór de aftrap (in de stijl van de goal-viering).
function Countdown({ value }: { value: number | 'GO' }) {
  const isGo = value === 'GO'
  return (
    <div className="pointer-events-none absolute inset-0 z-[72] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(244,185,46,0.16), rgba(5,7,12,0.55) 62%)' }} />
      <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: '5px solid rgba(255,255,255,0.18)', animation: 'goal-ring 0.7s ease-out both' }} />
      <span
        key={String(value)}
        className={`font-score uppercase drop-shadow-[0_6px_28px_rgba(0,0,0,0.85)] ${isGo ? 'text-wk-green text-[10rem]' : 'text-white text-[12rem]'}`}
        style={{ animation: 'goal-pop 0.45s cubic-bezier(0.2,1.5,0.4,1) both', lineHeight: 1 }}
      >
        {isGo ? 'GO!' : value}
      </span>
    </div>
  )
}

// Kaart-animatie — full-screen, langer/coole dan een normale overtreding.
function CardCelebration({ card }: { card: { red: boolean; secondYellow: boolean; name: string; teamName: string; n: number } }) {
  const col = card.red ? '#E11D2E' : '#F5C518'
  // Optionele scheids-afbeelding (kaart omhoog); valt terug op een getekende kaart als 't bestand ontbreekt.
  const [imgFailed, setImgFailed] = useState(false)
  const refSrc = card.red ? '/spelers/ref-red.png' : '/spelers/ref-yellow.png'
  return (
    <div className="pointer-events-none absolute inset-0 z-[71] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 44%, ${col}cc, rgba(5,7,12,0.94) 66%)`, animation: 'goal-in 0.3s ease-out both' }} />
      <div className="absolute left-1/2 top-[44%] h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 opacity-20" style={{ background: `repeating-conic-gradient(from 0deg, ${col}00 0deg, ${col}99 6deg, ${col}00 13deg)`, animation: 'goal-rays 9s linear infinite' }} />
      <div className="absolute left-1/2 top-[44%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: `6px solid ${col}`, animation: 'goal-ring 0.7s ease-out both' }} />
      <div className="relative flex flex-col items-center gap-4 px-6 text-center">
        {!imgFailed ? (
          <Image
            src={refSrc}
            alt=""
            width={360}
            height={480}
            onError={() => setImgFailed(true)}
            className="h-56 w-auto object-contain drop-shadow-2xl sm:h-64"
            style={{ animation: 'goal-pop 0.5s cubic-bezier(0.2,1.4,0.4,1) both' }}
          />
        ) : (
          <div
            className="h-40 w-28 rounded-lg shadow-[0_12px_50px_rgba(0,0,0,0.7)]"
            style={{ background: col, transform: 'rotate(-8deg)', animation: 'goal-pop 0.5s cubic-bezier(0.2,1.4,0.4,1) both' }}
          />
        )}
        <h1 className="font-display text-6xl sm:text-7xl uppercase tracking-wider text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ animation: 'goal-pop 0.45s cubic-bezier(0.2,1.5,0.4,1) both' }}>
          {card.red ? 'Rode kaart' : 'Gele kaart'}
        </h1>
        {card.secondYellow && (
          <p className="font-score text-2xl sm:text-3xl uppercase tracking-[0.14em] text-[#F5C518] drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]" style={{ animation: 'goal-pop 0.45s cubic-bezier(0.2,1.5,0.4,1) 0.1s both' }}>
            🟨🟨 Tweede geel
          </p>
        )}
        {card.name && (
          <p className="font-score text-3xl sm:text-4xl uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]" style={{ animation: 'goal-rise 0.5s ease-out 0.12s both' }}>
            {card.name}
          </p>
        )}
        {card.teamName && (
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-white/70 drop-shadow" style={{ animation: 'goal-rise 0.5s ease-out 0.2s both' }}>
            {card.teamName}
          </p>
        )}
      </div>
    </div>
  )
}

// Beslist of de strafschoppenserie klaar is (winnaar-team of null = doorgaan).
function decideShootout(tally: { team: TeamId; scored: boolean }[]): TeamId | null {
  const a = tally.filter((t) => t.team === 0 && t.scored).length
  const b = tally.filter((t) => t.team === 1 && t.scored).length
  const ka = tally.filter((t) => t.team === 0).length
  const kb = tally.filter((t) => t.team === 1).length
  const BEST = 5
  if (ka < BEST || kb < BEST) {
    const remA = BEST - ka, remB = BEST - kb
    if (a > b + remB) return 0
    if (b > a + remA) return 1
    return null
  }
  if (ka === kb && a !== b) return a > b ? 0 : 1 // sudden death: na een volledige ronde
  return null
}

// Strafschoppenserie (lokaal): sweep de reticle en druk Spatie/klik om te richten (jij schiet)
// of te duiken (jij bent keeper). Tegenstander/keeper mikt willekeurig.
const ZONE_X = [30, 50, 70] // % positie van de 3 hoeken (links/midden/rechts), binnen de doelmond
function Shootout({ teams, humanTeam, onDone }: { teams: [TeamMeta, TeamMeta]; humanTeam: TeamId; onDone: (winner: TeamId, score: [number, number]) => void }) {
  const [tally, setTally] = useState<{ team: TeamId; scored: boolean }[]>([])
  const [sel, setSel] = useState(1) // gekozen hoek (schieten) of duik (keepen)
  const [result, setResult] = useState<null | { scored: boolean; shot: number; keeper: number; team: TeamId }>(null)

  const scoreH = tally.filter((t) => t.team === 0 && t.scored).length
  const scoreA = tally.filter((t) => t.team === 1 && t.scored).length
  const kicksH = tally.filter((t) => t.team === 0).length
  const kicksA = tally.filter((t) => t.team === 1).length
  const turn: TeamId = kicksH === kicksA ? 0 : 1
  const humanShooting = turn === humanTeam
  const kickerTeam = teams[turn]

  const commit = useCallback((zone: number) => {
    if (result) return
    const rand = () => Math.floor(Math.random() * 3)
    const shot = humanShooting ? zone : rand()
    const keeper = humanShooting ? rand() : zone
    // Keeper goed gegokt → meestal gestopt (soms er nét langs); mis → meestal goal (soms gemist/gered).
    const scored = shot === keeper ? Math.random() < 0.2 : Math.random() < 0.9
    playSound(scored ? GOAL_SOUNDS : KICK_SOUNDS, scored ? 0.7 : 0.5)
    setResult({ scored, shot, keeper, team: turn })
  }, [result, humanShooting, turn])

  // Toetsen: ← → kiezen, spatie/enter bevestigen (alleen tijdens richten).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result) return
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); setSel((z) => Math.max(0, z - 1)) }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); setSel((z) => Math.min(2, z + 1)) }
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); commit(sel) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commit, sel, result])

  // Na de animatie: uitslag verwerken en door naar de volgende (of einde).
  useEffect(() => {
    if (!result) return
    const id = window.setTimeout(() => {
      const next = [...tally, { team: result.team, scored: result.scored }]
      const winner = decideShootout(next)
      setResult(null)
      setSel(1)
      if (winner !== null) onDone(winner, [next.filter((t) => t.team === 0 && t.scored).length, next.filter((t) => t.team === 1 && t.scored).length])
      else setTally(next)
    }, 1700)
    return () => clearTimeout(id)
  }, [result, tally, onDone])

  const dots = (team: TeamId) => {
    const rounds = Math.max(5, kicksH, kicksA)
    return Array.from({ length: rounds }, (_, i) => {
      const k = tally.filter((t) => t.team === team)[i]
      return k ? (k.scored ? 'goal' : 'miss') : 'todo'
    })
  }

  // Posities voor de animatie (% van de scène): keeper duikt naar z'n hoek, bal vliegt naar de schot-hoek.
  const keeperX = result ? ZONE_X[result.keeper] : 50
  const keeperY = result ? 40 : 47
  const keeperTilt = result ? (result.keeper === 0 ? -72 : result.keeper === 2 ? 72 : 0) : 0
  const ballX = result ? ZONE_X[result.shot] : 50
  const ballY = result ? 24 : 84
  const defTeam = teams[turn === 0 ? 1 : 0] // keeper hoort bij de verdedigende ploeg
  const kColor = defTeam.keeper
  const kFace = defTeam.players[0]?.face ? `/spelers/${defTeam.players[0].face}` : '/spelers/default.png'

  return (
    <div className="absolute inset-0 z-[74] flex items-center justify-center bg-wk-bg/92 backdrop-blur-[3px]">
      <div className="flex w-full max-w-2xl flex-col items-center gap-3 px-6 text-center">
        <h2 className="font-score text-4xl uppercase tracking-tight text-wk-gold">Strafschoppen</h2>
        <p className="font-score text-5xl leading-none text-white">
          {teams[0].short} {scoreH} <span className="text-white/50">:</span> {scoreA} {teams[1].short}
        </p>
        {([0, 1] as TeamId[]).map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span className="w-10 text-right font-mono text-[10px] uppercase tracking-widest text-white/80">{teams[t].short}</span>
            <div className="flex gap-1.5">
              {dots(t).map((d, i) => (
                <span key={i} className={`h-3 w-3 rounded-full ${d === 'goal' ? 'bg-wk-green' : d === 'miss' ? 'bg-wk-red' : 'bg-white/15'}`} />
              ))}
            </div>
          </div>
        ))}

        {/* Scène: gras + doel (SVG) + keeper (met spelergezicht) + bal */}
        <div className="relative aspect-[16/10] w-full select-none overflow-hidden rounded-xl ring-1 ring-black/30">
          <div className="absolute inset-0 bg-wk-green/30" style={{ backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.05) 0 2px,transparent 2px 34px)' }} />
          {/* doel: palen + lat + net */}
          <svg viewBox="0 0 100 62.5" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <g stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.4">
              {[20, 30, 40, 50, 60, 70, 80].map((x) => <line key={x} x1={x} y1="8" x2={x} y2="46" />)}
              {[14, 22, 30, 38].map((y) => <line key={y} x1="16" y1={y} x2="84" y2={y} />)}
            </g>
            <g fill="none" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.4" strokeLinecap="round">
              <line x1="16" y1="8" x2="16" y2="46" />
              <line x1="84" y1="8" x2="84" y2="46" />
              <line x1="15" y1="8" x2="85" y2="8" />
            </g>
            <line x1="0" y1="46" x2="100" y2="46" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.6" />
          </svg>
          {/* klikbare hoek-zones (alleen tijdens richten) */}
          {!result && [0, 1, 2].map((z) => (
            <button key={z} onClick={() => commit(z)} onMouseEnter={() => setSel(z)}
              className="absolute top-0" style={{ left: `${16 + z * 22.66}%`, width: '22.66%', height: '61%' }} aria-label={`hoek ${z + 1}`}>
              <span className={`absolute left-1/2 top-1/3 h-10 w-10 -translate-x-1/2 rounded-full border-2 transition ${sel === z ? 'scale-110 border-wk-gold bg-wk-gold/25' : 'border-white/30'}`} />
            </button>
          ))}
          {/* keeper: gehandschoende armen + shirt + spelergezicht */}
          <div className="absolute h-[34%] w-[16%] transition-all duration-500" style={{ left: `${keeperX}%`, top: `${keeperY}%`, transform: `translate(-50%,-50%) rotate(${keeperTilt}deg)` }}>
            <span className="absolute left-[-14%] top-[34%] h-[26%] w-[26%] rounded-full bg-white ring-2 ring-black/25" />
            <span className="absolute right-[-14%] top-[34%] h-[26%] w-[26%] rounded-full bg-white ring-2 ring-black/25" />
            <span className="absolute bottom-0 left-1/2 h-[62%] w-[62%] -translate-x-1/2 rounded-lg" style={{ background: kColor }} />
            <span className="absolute left-1/2 top-0 h-[46%] w-[46%] -translate-x-1/2 overflow-hidden rounded-full border-2 bg-wk-bg2" style={{ borderColor: kColor }}>
              <Image src={kFace} alt="" width={40} height={40} className="h-full w-full object-cover" />
            </span>
          </div>
          {/* bal (schaduw + witte voetbal met panelen) */}
          <div className={`absolute h-[13%] w-[8%] -translate-x-1/2 -translate-y-1/2 ${result ? 'transition-all duration-500 ease-out' : ''}`} style={{ left: `${ballX}%`, top: `${ballY}%` }}>
            <svg viewBox="0 0 24 24" className="h-full w-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              <circle cx="12" cy="12" r="11" fill="#ffffff" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
              <polygon points="12,6 16,9 14.5,14 9.5,14 8,9" fill="#15161a" />
              <path d="M12 1.5 L12 6 M16 9 L21.5 8 M14.5 14 L17 19 M9.5 14 L7 19 M8 9 L2.5 8" stroke="#15161a" strokeWidth="0.9" fill="none" />
            </svg>
          </div>
        </div>

        {result ? (
          <p className={`font-score text-4xl uppercase tracking-wide ${result.scored ? 'text-wk-green' : 'text-wk-red'}`}>
            {result.scored ? 'Goal!' : 'Gestopt! 🧤'}
          </p>
        ) : (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/80">
            {humanShooting ? `${kickerTeam.name} schiet` : `${kickerTeam.name} schiet — jij keept 🧤`} · ← → kies, spatie/klik
          </p>
        )}
      </div>
    </div>
  )
}

// Full-screen goal-viering — kleurrijke, geanimeerde achtergrond; naam altijd wit.
function GoalCelebration({ info }: { info: GoalInfo | null }) {
  const color = info?.color ?? '#F4B92E'
  const [imgErr, setImgErr] = useState(false)
  const faceSrc = !imgErr && info?.face ? `/spelers/${info.face}` : '/spelers/default.png'
  return (
    <div className="pointer-events-none absolute inset-0 z-[70] overflow-hidden">
      {/* leesbare, teamgetinte radial-basis */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 42%, ${color}cc, rgba(5,7,12,0.95) 68%)`, animation: 'goal-in 0.3s ease-out both' }} />
      {/* twee draaiende stralen-lagen (tegengesteld) → shimmerende starburst */}
      <div className="absolute left-1/2 top-[42%] h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 opacity-25" style={{ background: `repeating-conic-gradient(from 0deg, ${color}00 0deg, ${color}88 6deg, ${color}00 13deg)`, animation: 'goal-rays 9s linear infinite' }} />
      <div className="absolute left-1/2 top-[42%] h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 opacity-15" style={{ background: `repeating-conic-gradient(from 0deg, #ffffff00 0deg, #ffffff55 4deg, #ffffff00 10deg)`, animation: 'goal-rays-rev 14s linear infinite' }} />
      {/* shockwave-ring bij binnenkomst */}
      <div className="absolute left-1/2 top-[42%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ border: `6px solid ${color}`, animation: 'goal-ring 0.7s ease-out both' }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        {/* scorer-foto: altijd iets tonen (val terug op default.png bij ontbrekend/kapot gezicht) */}
        <Image
          src={faceSrc}
          alt=""
          width={240}
          height={240}
          onError={() => setImgErr(true)}
          className="h-56 w-auto object-contain drop-shadow-2xl"
          style={{ animation: 'goal-pop 0.5s cubic-bezier(0.2,1.4,0.4,1) both' }}
        />
        <h1 className="font-score text-8xl sm:text-9xl uppercase tracking-wider text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]" style={{ animation: 'goal-pop 0.45s cubic-bezier(0.2,1.5,0.4,1) both' }}>
          Goal!
        </h1>
        {info?.kind === 'screamer' && (
          <p className="font-display text-3xl sm:text-4xl uppercase tracking-[0.2em] text-wk-gold drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]" style={{ animation: 'goal-rise 0.45s ease-out 0.1s both' }}>
            ⚡ Screamer! ⚡
          </p>
        )}
        {info?.name && (
          <p className="font-score text-4xl sm:text-5xl uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]" style={{ animation: 'goal-rise 0.5s ease-out 0.12s both' }}>
            {info.name}
            {info.ownGoal && <span className="text-white/70 text-2xl"> (e.o.)</span>}
          </p>
        )}
        {info?.teamName && (
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-white/70 drop-shadow" style={{ animation: 'goal-rise 0.5s ease-out 0.2s both' }}>
            {info.teamName}
          </p>
        )}
      </div>
    </div>
  )
}


// Freeze-scherm bij rust/einde.
function BreakPanel({ info, teams, children }: { info: PanelInfo; teams: [TeamMeta, TeamMeta]; children: ReactNode }) {
  // Alle wedstrijd-events (goals + kaarten) chronologisch voor de horizontale tijdlijn.
  const matchMin = (half: number, clock: number) => Math.max(0, Math.round((half - 1) * info.halfLen + clock / 60))
  const timelineEvents = [
    ...info.scorers.map((g) => ({ min: matchMin(g.half, g.clock), team: g.team, name: g.name, face: g.face ?? null, icon: g.ownGoal ? '⚽' : '⚽' })),
    ...info.cards.map((c) => ({ min: matchMin(c.half, c.clock), team: c.team, name: c.name, face: c.face, icon: c.red ? '🟥' : '🟨' })),
  ].sort((a, b) => a.min - b.min)
  const resultTxt = info.result === 'win' ? '🏆 Gewonnen!' : info.result === 'loss' ? 'Verloren' : info.result === 'draw' ? 'Gelijkspel' : null
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden backdrop-blur-[3px]">
      {/* goal-stijl geanimeerde achtergrond */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(244,185,46,0.35), rgba(5,7,12,0.92) 66%)', animation: 'goal-in 0.3s ease-out both' }} />
      <div className="absolute left-1/2 top-[42%] h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.12]" style={{ background: 'repeating-conic-gradient(from 0deg, #F4B92E00 0deg, #F4B92E88 6deg, #F4B92E00 13deg)', animation: 'goal-rays 13s linear infinite' }} />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-6 px-8 text-center">
        <div className="flex flex-col items-center" style={{ animation: 'goal-pop 0.5s cubic-bezier(0.2,1.5,0.4,1) both' }}>
          <span className="font-mono text-[11px] uppercase tracking-[0.42em] text-wk-gold/80">{info.title === 'HALF TIME' ? 'Rust' : 'Eindsignaal'}</span>
          <h2 className="font-score text-7xl uppercase leading-[0.9] tracking-tight text-white drop-shadow-[0_4px_28px_rgba(0,0,0,0.85)] sm:text-8xl">{info.title}</h2>
        </div>
        {/* strakke score-strip — team-codes wit (kleur zit in de stip) voor leesbaarheid */}
        <div className="flex items-center gap-4 rounded-2xl bg-black/45 px-6 py-4 ring-1 ring-white/15">
          <span className="flex items-center gap-2 font-score text-2xl uppercase leading-none tracking-[0.02em] text-white">
            <TeamCrest short={teams[0].short} shirt={teams[0].shirt} trim={teams[0].trim} size={30} />{teams[0].short}
          </span>
          <span className="font-score text-5xl leading-none tracking-tight text-white tabular-nums">{info.score[0]}<span className="mx-2 text-white/60">:</span>{info.score[1]}</span>
          <span className="flex items-center gap-2 font-score text-2xl uppercase leading-none tracking-[0.02em] text-white">
            {teams[1].short}<TeamCrest short={teams[1].short} shirt={teams[1].shirt} trim={teams[1].trim} size={30} />
          </span>
        </div>
        {(resultTxt || info.note) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {resultTxt && <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-wk-soft">{resultTxt}</span>}
            {info.note && <span className="rounded-full bg-wk-gold/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-wk-gold">{info.note}</span>}
          </div>
        )}
        {/* MVP-kaart: topscorer met foto + speels lijntje */}
        {info.motm && (
          <div className="flex items-center gap-4 rounded-2xl bg-black/45 px-5 py-3 ring-1 ring-wk-gold/40"
            style={{ animation: 'goal-pop 0.5s cubic-bezier(0.2,1.5,0.4,1) both' }}>
            <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2" style={{ boxShadow: `0 0 0 2px ${teams[info.motm.team].shirt}` }}>
              <Image src={`/spelers/${info.motm.face ?? 'default.png'}`} alt={info.motm.name} width={56} height={56} className="h-full w-full object-cover" />
            </span>
            <div className="text-left">
              <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-wk-gold/90">★ Man of the Match</span>
              <p className="font-display text-xl uppercase leading-tight text-white">{info.motm.name}</p>
              <p className="font-mono text-[11px] uppercase tracking-wide text-wk-soft">{info.motm.line}</p>
            </div>
          </div>
        )}
        {/* Horizontale tijdlijn: goals + kaarten chronologisch, met spelerfoto's */}
        <div className="w-full">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
            <span>0&apos;</span><span>Rust</span><span>{info.halfLen * 2}&apos;</span>
          </div>
          <div className="h-px w-full bg-white/15" />
          {timelineEvents.length === 0 ? (
            <p className="pt-3 text-center font-mono text-[11px] text-white/40">Nog geen goals of kaarten</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pt-3 pb-1">
              {timelineEvents.map((e, i) => (
                <div key={i} className="flex shrink-0 flex-col items-center gap-1">
                  <span className="font-mono text-[10px] tabular-nums text-white/60">{e.min}&apos;</span>
                  <span className="relative block h-11 w-11 overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 2px ${teams[e.team].shirt}` }}>
                    <Image src={`/spelers/${e.face ?? 'default.png'}`} alt={e.name} width={44} height={44} className="h-full w-full object-cover" />
                    <span className="absolute -bottom-1 -right-1 text-[13px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{e.icon}</span>
                  </span>
                  <span className="max-w-[64px] truncate font-mono text-[9px] uppercase tracking-wide text-white/80">{e.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {info.stats && (
          <div className="w-full max-w-sm space-y-1.5 rounded-xl bg-black/25 px-4 py-3 ring-1 ring-white/10">
            {([
              ['Balbezit', `${info.stats.possPct[0]}%`, `${info.stats.possPct[1]}%`],
              ['Schoten', info.stats.shots[0], info.stats.shots[1]],
              ['Tackles', info.stats.tackles[0], info.stats.tackles[1]],
              ["Panna's", info.stats.pannas[0], info.stats.pannas[1]],
            ] as [string, string | number, string | number][]).map(([label, a, b]) => (
              <div key={label} className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.1em]">
                <span className="w-10 text-left font-bold tabular-nums text-white">{a}</span>
                <span className="flex-1 text-center text-white/70">{label}</span>
                <span className="w-10 text-right font-bold tabular-nums text-white">{b}</span>
              </div>
            ))}
          </div>
        )}
        <div className="pt-2">{children}</div>
      </div>
    </div>
  )
}

// Contrast-kleur (wit/donker) op basis van de helderheid van een hex-kleur.
function contrastOn(hex: string): string {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(s || '000000', 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111418' : '#ffffff'
}

// Procedureel teamwapen: schild in de shirtkleur met de teamcode. Geeft elk team een identiteit.
function TeamCrest({ short, shirt, trim, size = 40 }: { short: string; shirt: string; trim: string; size?: number }) {
  const txt = contrastOn(shirt)
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 40 44" aria-hidden className="shrink-0 drop-shadow">
      <path d="M20 2 L37 8 V21 C37 33 29 40 20 43 C11 40 3 33 3 21 V8 Z" fill={shirt} stroke={trim} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M3 15 H37" stroke={trim} strokeWidth="1.4" opacity="0.55" />
      <text x="20" y="29" textAnchor="middle" fontSize="12" fontWeight="900" fontFamily="Arial, sans-serif" fill={txt} letterSpacing="0.5">{short.slice(0, 3)}</text>
    </svg>
  )
}

// ── Besturing aanpassen (toetsenbord + controller) ───────────────────────────
const ACTION_META: { id: ActionId; label: string }[] = [
  { id: 'kick', label: 'Schot / pass' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'slide', label: 'Sliding / omhaal' },
  { id: 'switch', label: 'Speler wisselen' },
  { id: 'chip', label: 'Voorzet / lange bal' },
  { id: 'feint', label: 'Schijnbeweging' },
]
const KEY_LABELS: Record<string, string> = {
  Space: 'Spatie', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift R', ControlLeft: 'Ctrl', ControlRight: 'Ctrl R',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Tab: 'Tab', Backspace: '⌫',
}
function keyLabel(code: string | undefined): string {
  if (!code) return '—'
  if (KEY_LABELS[code]) return KEY_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}
// PS5 / DualSense-knopnamen (Gamepad-standaardmapping: index → fysieke knop).
const PAD_LABELS: Record<number, string> = {
  0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→',
}
function padLabel(i: number | undefined): string {
  return i == null ? '—' : (PAD_LABELS[i] ?? `Knop ${i}`)
}

function ControlsModal({ onClose, onApply }: { onClose: () => void; onApply: (b: Bindings) => void }) {
  const [bindings, setBindings] = useState<Bindings>(() => loadBindings())
  const [capture, setCapture] = useState<{ action: ActionId; kind: 'key' | 'pad' } | null>(null)

  // Toets vastleggen: eerstvolgende toetsaanslag wordt de nieuwe binding (Esc annuleert).
  useEffect(() => {
    if (capture?.kind !== 'key') return
    const h = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code === 'Escape') { setCapture(null); return }
      setBindings((b) => ({ ...b, keys: { ...b.keys, [capture.action]: [e.code] } }))
      setCapture(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [capture])

  // Controllerknop vastleggen: pollt de gamepad tot er een knop wordt ingedrukt.
  useEffect(() => {
    if (capture?.kind !== 'pad') return
    let raf = 0
    const poll = () => {
      const gp = activeGamepad()
      if (gp) {
        for (let i = 0; i < gp.buttons.length; i++) {
          const btn = gp.buttons[i]
          if (btn && (btn.pressed || btn.value > 0.6)) {
            setBindings((b) => ({ ...b, pad: { ...b.pad, [capture.action]: [i] } }))
            setCapture(null)
            return
          }
        }
      }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    const esc = (e: KeyboardEvent) => { if (e.code === 'Escape') setCapture(null) }
    window.addEventListener('keydown', esc)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', esc) }
  }, [capture])

  const save = () => { saveBindings(bindings); onApply(bindings); onClose() }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/12 bg-wk-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-lg uppercase tracking-[0.14em] text-wk-text">Besturing</h2>
          <button onClick={onClose} className="font-mono text-[11px] uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</button>
        </div>
        <p className="mb-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-wk-muted">
          Bewegen: WASD / pijltjes / linkerstick. Klik een knop om te wijzigen.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5">
            <span />
            <span className="text-center font-mono text-[9px] uppercase tracking-[0.14em] text-wk-muted">Toets</span>
            <span className="text-center font-mono text-[9px] uppercase tracking-[0.14em] text-wk-muted">🎮 Knop</span>
            {ACTION_META.map((a) => (
              <Fragment key={a.id}>
                <span className="font-mono text-[11px] uppercase tracking-wide text-wk-soft">{a.label}</span>
                <button
                  onClick={() => setCapture({ action: a.id, kind: 'key' })}
                  className={`min-w-[64px] rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${capture?.action === a.id && capture.kind === 'key' ? 'border-wk-gold bg-wk-gold/15 text-wk-gold animate-pulse' : 'border-white/15 text-wk-text hover:border-white/35'}`}>
                  {capture?.action === a.id && capture.kind === 'key' ? '…' : keyLabel(bindings.keys[a.id]?.[0])}
                </button>
                <button
                  onClick={() => setCapture({ action: a.id, kind: 'pad' })}
                  className={`min-w-[64px] rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${capture?.action === a.id && capture.kind === 'pad' ? 'border-wk-gold bg-wk-gold/15 text-wk-gold animate-pulse' : 'border-white/15 text-wk-text hover:border-white/35'}`}>
                  {capture?.action === a.id && capture.kind === 'pad' ? '…' : padLabel(bindings.pad[a.id]?.[0])}
                </button>
              </Fragment>
            ))}
          </div>
        </div>

        {capture && (
          <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-wk-gold">
            {capture.kind === 'key' ? 'Druk een toets…' : 'Druk een controllerknop…'} <span className="text-wk-muted">(Esc = annuleren)</span>
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={() => setBindings(DEFAULT_BINDINGS)} className="font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted hover:text-wk-soft">Standaard herstellen</button>
          <button onClick={save} className="rounded-lg border border-wk-green/50 bg-wk-green/15 px-5 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-wk-green hover:bg-wk-green/25">Opslaan</button>
        </div>
      </div>
    </div>
  )
}

// Traits per speler zelf verdelen (vaste som = TRAIT_BUDGET → eerlijk). Wordt lokaal bewaard
// en meegestuurd in de team-config (dus ook online).
function TraitsModal({ current, onClose, onSave }: { current: Record<string, PlayerTraits>; onClose: () => void; onSave: (t: Record<string, PlayerTraits>) => void }) {
  const build = (from: (p: (typeof PLAYER_POOL)[number]) => PlayerTraits) => {
    const d: Record<string, PlayerTraits> = {}
    for (const p of PLAYER_POOL) d[p.face] = from(p)
    return d
  }
  const [draft, setDraft] = useState<Record<string, PlayerTraits>>(() => build((p) => ({ ...(current[p.face] ?? p.traits) })))
  const KEYS: { k: keyof PlayerTraits; label: string; color: string }[] = [
    { k: 'pace', label: 'Snelheid', color: '#4FA8E0' },
    { k: 'shot', label: 'Schot', color: '#F4B92E' },
    { k: 'tackle', label: 'Tackle', color: '#E63946' },
  ]
  const sumOf = (t: PlayerTraits) => t.pace + t.shot + t.tackle
  const adjust = (face: string, k: keyof PlayerTraits, delta: number) => setDraft((d) => {
    const t = d[face]
    const nv = t[k] + delta
    if (nv < 1 || nv > 5) return d
    if (delta > 0 && sumOf(t) >= TRAIT_BUDGET) return d // budget op
    return { ...d, [face]: { ...t, [k]: nv } }
  })

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6" onClick={onClose}>
      <div className="flex max-h-[86vh] w-full max-w-lg flex-col rounded-2xl border border-white/12 bg-wk-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-lg uppercase tracking-[0.14em] text-wk-text">Traits verdelen</h2>
          <button onClick={onClose} className="font-mono text-[11px] uppercase tracking-widest text-wk-muted hover:text-wk-text">Sluiten ✕</button>
        </div>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-wk-muted">Elke speler heeft {TRAIT_BUDGET} punten (1–5 per trait). Eerlijk: de som blijft gelijk.</p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {PLAYER_POOL.map((p) => {
            const t = draft[p.face]
            const left = TRAIT_BUDGET - sumOf(t)
            return (
              <div key={p.face} className="rounded-xl border border-white/10 bg-wk-bg2/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="relative block h-8 w-8 overflow-hidden rounded-full border border-white/15">
                    <Image src={`/spelers/${p.face}`} alt={p.name} width={32} height={32} className="h-full w-full object-cover" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] uppercase tracking-wide text-wk-text">{p.name}</p>
                    <p className="truncate font-mono text-[8px] uppercase tracking-wide text-wk-gold/70">{p.tag}</p>
                  </div>
                  <span className={`ml-auto font-mono text-[10px] uppercase tracking-wide ${left > 0 ? 'text-wk-gold' : 'text-wk-muted'}`}>{left > 0 ? `${left} over` : 'vol'}</span>
                </div>
                {KEYS.map(({ k, label, color }) => (
                  <div key={k} className="mb-1 flex items-center gap-2 last:mb-0">
                    <span className="w-16 font-mono text-[9px] uppercase tracking-wide text-wk-soft">{label}</span>
                    <button onClick={() => adjust(p.face, k, -1)} disabled={t[k] <= 1}
                      className="flex h-5 w-5 items-center justify-center rounded border border-white/15 font-mono text-xs text-wk-soft transition hover:border-white/35 disabled:opacity-30">−</button>
                    <span className="flex flex-1 gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => <span key={i} className="h-2 flex-1 rounded-[1px]" style={{ background: i <= t[k] ? color : 'rgba(255,255,255,0.12)' }} />)}
                    </span>
                    <button onClick={() => adjust(p.face, k, 1)} disabled={t[k] >= 5 || left <= 0}
                      className="flex h-5 w-5 items-center justify-center rounded border border-white/15 font-mono text-xs text-wk-soft transition hover:border-white/35 disabled:opacity-30">+</button>
                    <span className="w-3 text-right font-mono text-[10px] tabular-nums text-wk-text">{t[k]}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={() => setDraft(build((p) => ({ ...p.traits })))} className="font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted hover:text-wk-soft">Standaard herstellen</button>
          <button onClick={() => { onSave(draft); onClose() }} className="rounded-lg border border-wk-green/50 bg-wk-green/15 px-5 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-wk-green hover:bg-wk-green/25">Opslaan</button>
        </div>
      </div>
    </div>
  )
}

// Trait-regel voor de hover-kaart: label + 5 pips (gevuld t/m de rating).
function TraitRow({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <span className="mb-1 flex items-center justify-between gap-2 last:mb-0">
      <span className="font-mono text-[9px] uppercase tracking-wide text-wk-soft">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="h-1.5 w-3 rounded-[1px]" style={{ background: i <= v ? color : 'rgba(255,255,255,0.14)' }} />
        ))}
      </span>
    </span>
  )
}

// Apparaat-kiezer: icoon-kaartjes i.p.v. een propvolle segment-balk. Toont beide toetsenbord-helften
// altijd, en alleen de controllers die écht verbonden zijn (+ de al gekozen, mocht die net wegvallen).
function DevicePicker({ value, onChange, padCount }: { value: InputDevice; onChange: (d: InputDevice) => void; padCount: number }) {
  const shown = DEVICE_META.filter((d) => d.pad == null || d.pad < padCount || d.id === value)
  return (
    <div className="grid grid-cols-2 gap-2">
      {shown.map((d) => {
        const active = d.id === value
        return (
          <button key={d.id} type="button" onClick={() => onChange(d.id)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${active ? 'border-wk-gold bg-wk-gold/15' : 'border-white/12 hover:border-white/35'}`}>
            <span className="text-lg leading-none">{d.icon}</span>
            <span className="min-w-0">
              <span className={`block truncate font-mono text-[11px] uppercase tracking-wide ${active ? 'text-wk-gold' : 'text-wk-text'}`}>{d.label}</span>
              <span className="block truncate font-mono text-[9px] uppercase tracking-wide text-wk-muted">{d.sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StatCell({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-wk-bg2/60 px-2 py-2">
      <span className={`font-score text-xl leading-none tabular-nums ${tone ?? 'text-wk-text'}`}>{value}</span>
      <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-wk-muted">{label}</span>
    </div>
  )
}

function Panel({ title, children, className, style }: { title: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section style={style} className={`flex min-h-0 flex-col rounded-2xl border border-white/10 bg-wk-surface/55 p-5 shadow-xl backdrop-blur-sm ${className ?? ''}`}>
      <h2 className="mb-4 shrink-0 font-display text-sm uppercase tracking-[0.16em] text-wk-text">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-wk-muted">{label}</p>
      {children}
    </div>
  )
}

function Segmented({ options, value, onChange, vertical }: { options: string[]; value: number; onChange: (i: number) => void; vertical?: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: vertical ? '1fr' : `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(i)} className={`rounded-xl border px-3 py-2.5 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${value === i ? 'border-wk-gold bg-wk-gold/10 text-wk-gold' : 'border-white/10 text-wk-soft hover:border-white/30'}`}>
          {o}
        </button>
      ))}
    </div>
  )
}
