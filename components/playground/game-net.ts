// Generieke online-1v1-laag voor de playground-games — host-authoritative over Supabase Realtime.
//
//   • host  = speler 0. Draait de ENIGE sim, past eigen + gast-input toe, broadcast ~30×/s een
//             snapshot (volledige state + events).
//   • gast  = speler 1. Simuleert niet; stuurt z'n input en rendert de snapshots.
//
// De payload-types verschillen per game (input/snapshot/start/pick), dus die zijn generiek.
// De transport-plumbing (kamer, presence, broadcast) is voor elke game identiek.

import { createClient } from '@supabase/supabase-js'

export type NetRole = 'host' | 'guest'

export type NetHandlers<TInput, TSnap, TStart, TPick> = {
  onGuestJoined?: () => void
  onPeerLeft?: () => void
  onInput?: (cmd: TInput) => void // host ontvangt gast-input (speler 1)
  onJoin?: (pick: TPick, name: string) => void // host ontvangt de speler-keuze van de gast
  onSnapshot?: (snap: TSnap) => void // gast ontvangt snapshot
  onStart?: (payload: TStart) => void // gast: host is begonnen
  onSubscribed?: () => void
}

function realtimeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 45 } } },
  )
}

export class GameNet<TInput, TSnap, TStart, TPick> {
  readonly role: NetRole
  readonly code: string
  private key: string
  private sb = realtimeClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null
  private h: NetHandlers<TInput, TSnap, TStart, TPick>
  private peerSeen = false
  readonly peerId = `p${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
  private name: string

  // gameKey = uniek prefix per game ("volley", "pong", …) zodat kamers elkaar niet kruisen.
  constructor(gameKey: string, role: NetRole, code: string, handlers: NetHandlers<TInput, TSnap, TStart, TPick>, name = '') {
    this.key = gameKey
    this.role = role
    this.code = code
    this.h = handlers
    this.name = name
  }

  connect() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch: any = this.sb.channel(`${this.key}:${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: this.peerId } },
    })
    this.channel = ch

    if (this.role === 'host') {
      ch.on('broadcast', { event: 'input' }, (m: { payload: TInput }) => this.h.onInput?.(m.payload))
      ch.on('broadcast', { event: 'join' }, (m: { payload: { pick: TPick; name: string } }) => this.h.onJoin?.(m.payload.pick, m.payload.name))
    } else {
      ch.on('broadcast', { event: 'snap' }, (m: { payload: TSnap }) => this.h.onSnapshot?.(m.payload))
      ch.on('broadcast', { event: 'start' }, (m: { payload: TStart }) => this.h.onStart?.(m.payload))
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

  sendInput(cmd: TInput) { this.channel?.send({ type: 'broadcast', event: 'input', payload: cmd }) }
  sendJoin(pick: TPick, name: string) { this.channel?.send({ type: 'broadcast', event: 'join', payload: { pick, name } }) }
  sendSnapshot(snap: TSnap) { this.channel?.send({ type: 'broadcast', event: 'snap', payload: snap }) }
  sendStart(payload: TStart) { this.channel?.send({ type: 'broadcast', event: 'start', payload }) }

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
