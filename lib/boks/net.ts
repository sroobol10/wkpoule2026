// Online 1v1 voor Knokstukken — host-authoritative over Supabase Realtime.
//
// Rolverdeling:
//   • host  = bokser 0 (rode hoek). Draait de ENIGE sim, past eigen + gast-input toe, en
//             broadcast ~30×/s de volledige Match + de tick-events (voor geluid/deeltjes).
//   • gast  = bokser 1 (gele hoek). Simuleert niet; stuurt z'n input en rendert de snapshots.
//
// De Match is klein en platte JSON, dus we sturen 'm in z'n geheel — geen compacte encoding nodig.

import { createClient } from '@supabase/supabase-js'
import type { BoksEvent, BoksInput, Match, PlayerTraits } from './types'

export type NetRole = 'host' | 'guest'

export type FighterPick = { face: string; name: string; traits: PlayerTraits }
export type BoksStart = { picks: [FighterPick, FighterPick]; rounds: number }
export type BoksSnap = { m: Match; ev: BoksEvent[] }

type Handlers = {
  onGuestJoined?: () => void
  onPeerLeft?: () => void
  onInput?: (cmd: BoksInput) => void // host ontvangt gast-input
  onJoin?: (pick: FighterPick, name: string) => void // host ontvangt de bokser-keuze van de gast
  onSnapshot?: (snap: BoksSnap) => void // gast ontvangt snapshot
  onStart?: (payload: BoksStart) => void // gast: host is begonnen
  onSubscribed?: () => void
}

// Eigen client met hogere broadcast-rate (default 10/s is te traag voor ~30 snaps/s).
function realtimeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 45 } },
    },
  )
}

export class BoksNet {
  readonly role: NetRole
  readonly code: string
  private sb = realtimeClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null
  private h: Handlers
  private peerSeen = false
  readonly peerId = `p${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
  private name: string

  constructor(role: NetRole, code: string, handlers: Handlers, name = '') {
    this.role = role
    this.code = code
    this.h = handlers
    this.name = name
  }

  connect() {
    const ch = this.sb.channel(`boks:${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: this.peerId } },
    })
    this.channel = ch

    if (this.role === 'host') {
      ch.on('broadcast', { event: 'input' }, (m: { payload: BoksInput }) => this.h.onInput?.(m.payload))
      ch.on('broadcast', { event: 'join' }, (m: { payload: { pick: FighterPick; name: string } }) => this.h.onJoin?.(m.payload.pick, m.payload.name))
    } else {
      ch.on('broadcast', { event: 'snap' }, (m: { payload: BoksSnap }) => this.h.onSnapshot?.(m.payload))
      ch.on('broadcast', { event: 'start' }, (m: { payload: BoksStart }) => this.h.onStart?.(m.payload))
    }

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, Array<{ peerId?: string }>>
      const peers: string[] = []
      for (const entries of Object.values(state)) if (entries[0]?.peerId) peers.push(entries[0].peerId!)
      const others = peers.filter((p) => p !== this.peerId)
      if (others.length > 0 && !this.peerSeen) { this.peerSeen = true; this.h.onGuestJoined?.() }
      else if (others.length === 0 && this.peerSeen) { this.peerSeen = false; this.h.onPeerLeft?.() }
    })

    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        ch.track({ peerId: this.peerId, role: this.role, name: this.name, at: Date.now() })
        this.h.onSubscribed?.()
      }
    })
  }

  sendInput(cmd: BoksInput) { this.channel?.send({ type: 'broadcast', event: 'input', payload: cmd }) }
  sendJoin(pick: FighterPick, name: string) { this.channel?.send({ type: 'broadcast', event: 'join', payload: { pick, name } }) }
  sendSnapshot(snap: BoksSnap) { this.channel?.send({ type: 'broadcast', event: 'snap', payload: snap }) }
  sendStart(payload: BoksStart) { this.channel?.send({ type: 'broadcast', event: 'start', payload }) }

  leave() {
    try { this.channel?.unsubscribe(); this.sb.removeChannel(this.channel) } catch { /* al weg */ }
    this.channel = null
  }
}

// Korte, makkelijk door te geven roomcode (bijv. "K7Q2"), zonder verwarrende tekens.
export function makeRoomCode(seed: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let n = Math.floor(seed) % (32 * 32 * 32 * 32)
  let out = ''
  for (let i = 0; i < 4; i++) { out = chars[n % 32] + out; n = Math.floor(n / 32) }
  return out
}
