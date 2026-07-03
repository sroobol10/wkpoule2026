// Online 1v1 over Supabase Realtime — host-authoritative met snapshots.
//
// Rolverdeling:
//   • host  = team 0 (Goud). Draait de ENIGE sim, past eigen + gast-input toe,
//             broadcast ~20×/s een compacte snapshot van de state.
//   • gast  = team 1 (Blauw). Simuleert niet; stuurt z'n input en rendert de
//             (geïnterpoleerde) snapshots.
//
// Alleen de host simuleert → geen cross-machine determinisme nodig. De GameState is
// platte JSON, dus (de-)serialiseren is triviaal.

import { createClient } from '@supabase/supabase-js'
import { PLAYERS_PER_TEAM } from './constants'
import type { GameState, InputCommand, MatchPhase, TeamMeta } from './types'

export type NetRole = 'host' | 'guest'

// De host stuurt bij de start beide team-configs + matchlengte naar de gast.
export type StartPayload = {
  teams: [TeamMeta, TeamMeta]
  halfSec: number
  venue?: 'stadion' | 'zaal' | 'strand' | 'sneeuw'
  weather?: 'clear' | 'rain' | 'snow'
  ballScale?: number
  bigHeads?: boolean
  slippery?: boolean
}

// Compacte snapshot (afgeronde ints om bandbreedte te sparen).
export type Snapshot = {
  t: number // host-tick
  p: number[] // per speler: x, y, fx, fy  (lengte = 2*PLAYERS_PER_TEAM * 4)
  b: number[] // bal: x, y, z, vx, vy
  s: [number, number] // stand
  ph: MatchPhase // fase
  ck: number // klok (s)
  hf: number // helft
  cg: number // bestuurde speler van de GAST (voor highlight)
  cc: number // laadstand (charge, s) van die gast-speler (voor de power-balk)
  g: number[] // doelpunten, plat: [team, scorer, ownGoal?1:0, clockInt, half] per goal
  rx: number // scheids x
  ry: number // scheids y
  rt: number // scheids-tumble (getackeld, fun)
  so: number // sent-off bitmask (bit i = speler i van het veld)
  rk: string // restart-type ('throwin'|'corner'|'goalkick'|'freekick'|'')
  cd: number[] // kaarten, plat: [player, red?1:0, clockInt, half] per kaart (voor de flash)
  fc: number // overtredingen-teller (voor de foul-pauze/animatie bij de gast)
  tk: number // tackle-teller (voor het tackle-geluidje bij de gast)
  sv: number // reddingen-teller (voor "WAT EEN REDDING!" bij de gast)
  pn: number // panna-teller (voor "PANNA!" bij de gast)
  gk: number // laatste doelpunt-soort: 0 normal, 1 screamer, 2 owngoal
  st: number[] // stats: [shots0,shots1,tackles0,tackles1,pannas0,pannas1,possSec0,possSec1]
  sk: number[] // veldbestormer: [x, y, variant, tumble] als actief, anders lege array
  sk2: number[] // extra bestormers: [x, y, variant, tumble] per stuk (plat), anders leeg
  se: number[] // beveiliger: [x, y] als actief, anders lege array
}

type Handlers = {
  onGuestJoined?: () => void
  onPeerLeft?: () => void
  onInput?: (cmd: InputCommand) => void // host ontvangt gast-input
  onTeam?: (meta: TeamMeta) => void // host ontvangt de team-config van de gast
  onSnapshot?: (snap: Snapshot) => void // gast ontvangt snapshot
  onStart?: (payload: StartPayload) => void // gast: host is begonnen (met beide teams)
  onSubscribed?: () => void
}

const N = PLAYERS_PER_TEAM * 2
const r0 = (n: number) => Math.round(n) // 1 decimaal is niet nodig voor rendering

// ── Serialisatie ────────────────────────────────────────────────────────────
export function buildSnapshot(state: GameState, tick: number, controlledGuest: number): Snapshot {
  const p: number[] = new Array(N * 5)
  for (let i = 0; i < state.players.length; i++) {
    const pl = state.players[i]
    p[i * 5] = r0(pl.pos.x)
    p[i * 5 + 1] = r0(pl.pos.y)
    p[i * 5 + 2] = Math.round(pl.facing.x * 100) / 100
    p[i * 5 + 3] = Math.round(pl.facing.y * 100) / 100
    // pose: -1 = sliding-tackle, >0 = tuimel-timer (voor de spin), 0 = normaal
    p[i * 5 + 4] = pl.slideTimer > 0 && pl.slideTackle ? -1 : pl.tumbleTimer > 0 ? Math.round(pl.tumbleTimer * 100) / 100 : 0
  }
  const b = [r0(state.ball.pos.x), r0(state.ball.pos.y), r0(state.ball.z), r0(state.ball.vel.x), r0(state.ball.vel.y)]
  return {
    t: tick,
    p,
    b,
    s: [state.score[0], state.score[1]],
    ph: state.phase,
    ck: Math.round(state.clock * 10) / 10,
    hf: state.half,
    cg: controlledGuest,
    cc: Math.round((state.players[controlledGuest]?.charge ?? 0) * 100) / 100,
    g: state.goals.flatMap((x) => [x.team, x.scorer, x.ownGoal ? 1 : 0, Math.round(x.clock), x.half]),
    rx: r0(state.ref.pos.x),
    ry: r0(state.ref.pos.y),
    rt: Math.round(state.ref.tumble * 100) / 100,
    so: state.players.reduce((m, p, i) => (p.sentOff ? m | (1 << i) : m), 0),
    rk: state.restartKind ?? '',
    cd: state.cards.flatMap((c) => [c.player, c.red ? 1 : 0, Math.round(c.clock), c.half, c.secondYellow ? 1 : 0]),
    fc: state.foulCount,
    tk: state.tackleCount,
    sv: state.saveCount,
    pn: state.pannaCount,
    gk: state.lastGoalKind === 'screamer' ? 1 : state.lastGoalKind === 'owngoal' ? 2 : 0,
    st: [
      state.stats.shots[0], state.stats.shots[1],
      state.stats.tackles[0], state.stats.tackles[1],
      state.stats.pannas[0], state.stats.pannas[1],
      r0(state.stats.possMs[0]), r0(state.stats.possMs[1]),
    ],
    sk: state.streaker ? [r0(state.streaker.pos.x), r0(state.streaker.pos.y), state.streaker.variant, Math.round(state.streaker.tumble * 100) / 100] : [],
    sk2: state.extraStreakers.flatMap((e) => [r0(e.pos.x), r0(e.pos.y), e.variant, Math.round(e.tumble * 100) / 100]),
    se: state.security ? [r0(state.security.pos.x), r0(state.security.pos.y), Math.round(state.security.tumble * 100) / 100] : [],
  }
}

// Interpoleer twee snapshots in `target` (bestaande GameState met dezelfde rosters).
// alpha 0 = a, 1 = b. facing/fase/stand komen van de nieuwste (b).
export function lerpSnapshotInto(target: GameState, a: Snapshot, b: Snapshot, alpha: number) {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  for (let i = 0; i < target.players.length; i++) {
    const pl = target.players[i]
    const ax = a.p[i * 5]
    const ay = a.p[i * 5 + 1]
    const bx = b.p[i * 5]
    const by = b.p[i * 5 + 1]
    pl.pos.x = ax + (bx - ax) * t
    pl.pos.y = ay + (by - ay) * t
    pl.facing.x = b.p[i * 5 + 2]
    pl.facing.y = b.p[i * 5 + 3]
    // pose overnemen (voor slide/tuimel-animatie bij de gast)
    const pose = b.p[i * 5 + 4] ?? 0
    if (pose === -1) { pl.slideTimer = 1; pl.slideTackle = true; pl.tumbleTimer = 0 }
    else if (pose > 0) { pl.tumbleTimer = pose; pl.slideTimer = 0; pl.slideTackle = false }
    else { pl.slideTimer = 0; pl.tumbleTimer = 0; pl.slideTackle = false }
  }
  const ball = target.ball
  ball.pos.x = a.b[0] + (b.b[0] - a.b[0]) * t
  ball.pos.y = a.b[1] + (b.b[1] - a.b[1]) * t
  ball.z = a.b[2] + (b.b[2] - a.b[2]) * t
  ball.vel.x = b.b[3]
  ball.vel.y = b.b[4]
  target.score[0] = b.s[0]
  target.score[1] = b.s[1]
  target.phase = b.ph
  target.clock = b.ck
  target.half = b.hf as 1 | 2
  // Laadstand van de bestuurde gast-speler terugzetten (voor de power-balk).
  if (target.players[b.cg]) target.players[b.cg].charge = b.cc
  // Scheids, sent-off en restart-type overnemen (van de nieuwste snapshot).
  target.ref.pos.x = b.rx
  target.ref.pos.y = b.ry
  target.ref.tumble = b.rt ?? 0
  for (let i = 0; i < target.players.length; i++) target.players[i].sentOff = ((b.so >> i) & 1) === 1
  target.restartKind = (b.rk || null) as GameState['restartKind']
  target.foulCount = b.fc ?? target.foulCount
  target.tackleCount = b.tk ?? target.tackleCount
  target.saveCount = b.sv ?? target.saveCount
  target.pannaCount = b.pn ?? target.pannaCount
  if (b.st && b.st.length >= 8) {
    target.stats.shots = [b.st[0], b.st[1]]
    target.stats.tackles = [b.st[2], b.st[3]]
    target.stats.pannas = [b.st[4], b.st[5]]
    target.stats.possMs = [b.st[6], b.st[7]]
  }
  target.lastGoalKind = b.gk === 1 ? 'screamer' : b.gk === 2 ? 'owngoal' : 'normal'
  // Veldbestormer: positie overnemen/interpoleren (alleen positie telt voor het renderen).
  if (b.sk.length >= 2) {
    const both = a.sk.length >= 2
    const sx = both ? a.sk[0] + (b.sk[0] - a.sk[0]) * t : b.sk[0]
    const sy = both ? a.sk[1] + (b.sk[1] - a.sk[1]) * t : b.sk[1]
    target.streaker = { pos: { x: sx, y: sy }, vel: { x: 0, y: 0 }, target: { x: b.sk[0], y: b.sk[1] }, timer: 0, variant: (b.sk[2] === 2 ? 2 : b.sk[2] === 1 ? 1 : 0), caught: false, tumble: b.sk[3] ?? 0, tackled: true }
  } else {
    target.streaker = null
  }
  // Extra bestormers (positie rechtstreeks van de nieuwste snapshot; geen interpolatie nodig).
  const ex2 = b.sk2 ?? []
  const nEx = Math.floor(ex2.length / 4)
  target.extraStreakers = []
  for (let i = 0; i < nEx; i++) {
    const v = ex2[i * 4 + 2]
    target.extraStreakers.push({ pos: { x: ex2[i * 4], y: ex2[i * 4 + 1] }, vel: { x: 0, y: 0 }, target: { x: ex2[i * 4], y: ex2[i * 4 + 1] }, timer: 99, variant: (v === 2 ? 2 : v === 1 ? 1 : 0), caught: false, tumble: ex2[i * 4 + 3] ?? 0, tackled: true })
  }
  if (b.se && b.se.length >= 2) {
    const both = a.se && a.se.length >= 2
    const ex = both ? a.se[0] + (b.se[0] - a.se[0]) * t : b.se[0]
    const ey = both ? a.se[1] + (b.se[1] - a.se[1]) * t : b.se[1]
    target.security = { pos: { x: ex, y: ey }, vel: { x: 0, y: 0 }, tumble: b.se[2] ?? 0 }
  } else {
    target.security = null
  }
  // Kaartenlog reconstrueren (alleen als het aantal wijzigt → goedkoop; voedt de flash).
  const nCards = Math.floor(b.cd.length / 5)
  if (nCards !== target.cards.length) {
    target.cards = []
    for (let i = 0; i < nCards; i++) {
      const player = b.cd[i * 5]
      target.cards.push({
        player,
        team: target.players[player]?.team ?? 0,
        red: b.cd[i * 5 + 1] === 1,
        clock: b.cd[i * 5 + 2],
        half: b.cd[i * 5 + 3] as 1 | 2,
        secondYellow: b.cd[i * 5 + 4] === 1,
      })
    }
  }
  // Doelpunten-log reconstrueren (alleen als het aantal wijzigt → goedkoop).
  const nGoals = Math.floor(b.g.length / 5)
  if (nGoals !== target.goals.length) {
    target.goals = []
    for (let i = 0; i < nGoals; i++) {
      target.goals.push({
        team: b.g[i * 5] as 0 | 1,
        scorer: b.g[i * 5 + 1],
        ownGoal: b.g[i * 5 + 2] === 1,
        clock: b.g[i * 5 + 3],
        half: (b.g[i * 5 + 4] as 1 | 2),
      })
    }
  }
}

// ── Realtime-verbinding ──────────────────────────────────────────────────────

// Eigen client met hogere broadcast-rate (default is 10/s → te traag voor 20–30 snaps/s).
function realtimeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 40 } },
    },
  )
}

export class SoccerNet {
  readonly role: NetRole
  readonly code: string
  private sb = realtimeClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null
  private h: Handlers
  private peerSeen = false

  constructor(role: NetRole, code: string, handlers: Handlers) {
    this.role = role
    this.code = code
    this.h = handlers
  }

  connect() {
    const ch = this.sb.channel(`soccer:${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: this.role } },
    })
    this.channel = ch

    if (this.role === 'host') {
      ch.on('broadcast', { event: 'input' }, (m: { payload: InputCommand }) => this.h.onInput?.(m.payload))
      ch.on('broadcast', { event: 'team' }, (m: { payload: TeamMeta }) => this.h.onTeam?.(m.payload))
    } else {
      ch.on('broadcast', { event: 'snap' }, (m: { payload: Snapshot }) => this.h.onSnapshot?.(m.payload))
      ch.on('broadcast', { event: 'start' }, (m: { payload: StartPayload }) => this.h.onStart?.(m.payload))
    }

    // Aanwezigheid: host merkt de gast, beide merken vertrek.
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, unknown[]>
      const others = Object.keys(state).filter((k) => k !== this.role)
      if (others.length > 0 && !this.peerSeen) {
        this.peerSeen = true
        this.h.onGuestJoined?.()
      } else if (others.length === 0 && this.peerSeen) {
        this.peerSeen = false
        this.h.onPeerLeft?.()
      }
    })

    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ role: this.role, at: Date.now() })
        this.h.onSubscribed?.()
      }
    })
  }

  sendInput(cmd: InputCommand) {
    this.channel?.send({ type: 'broadcast', event: 'input', payload: cmd })
  }
  sendTeam(meta: TeamMeta) {
    this.channel?.send({ type: 'broadcast', event: 'team', payload: meta })
  }
  sendSnapshot(snap: Snapshot) {
    this.channel?.send({ type: 'broadcast', event: 'snap', payload: snap })
  }
  sendStart(payload: StartPayload) {
    this.channel?.send({ type: 'broadcast', event: 'start', payload })
  }

  leave() {
    try {
      this.channel?.unsubscribe()
      this.sb.removeChannel(this.channel)
    } catch {
      /* al weg */
    }
    this.channel = null
  }
}

// Korte, makkelijk door te geven roomcode (bijv. "K7Q2").
export function makeRoomCode(seed: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // zonder verwarrende tekens
  let n = Math.floor(seed) % (32 * 32 * 32 * 32)
  let out = ''
  for (let i = 0; i < 4; i++) {
    out = chars[n % 32] + out
    n = Math.floor(n / 32)
  }
  return out
}
