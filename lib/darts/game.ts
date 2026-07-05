// Pijlwerk — potje-logica: 301/501, beurten van 3 pijlen, bust-regels en de dubbele finish.

import { aimPoint, scoreAt, type Segment } from './board'

export type DartsPlayer = {
  face: string
  name: string
  isAI: boolean
  score: number
  visitStart: number // score aan het begin van deze beurt (voor de bust-terugdraai)
  dartsThrown: number
}

export type DartsMatch = {
  players: DartsPlayer[]
  current: number
  dartsLeft: number // pijlen over in deze beurt (3 → 0)
  visitLabels: string[] // wat er deze beurt gegooid is ("T20", "5", …)
  winner: number // -1 = bezig
}

export type ThrowResult = { seg: Segment; bust: boolean; finished: boolean; visitTotal: number }

export function makeDartsMatch(players: { face: string; name: string; isAI: boolean }[], startScore: number): DartsMatch {
  return {
    players: players.map((p) => ({ ...p, score: startScore, visitStart: startScore, dartsThrown: 0 })),
    current: 0,
    dartsLeft: 3,
    visitLabels: [],
    winner: -1,
  }
}

// Eén pijl verwerken. Bust = onder nul, precies 1 overhouden, of op 0 eindigen zónder
// dubbel → de hele beurt telt niet (score terug naar visitStart) en de beurt is voorbij.
export function throwDart(m: DartsMatch, dx: number, dy: number, forceZero = false): ThrowResult {
  const p = m.players[m.current]
  // forceZero = bounce-out (op de draad gestuiterd): telt als 0, ongeacht waar-ie prikt.
  const seg = forceZero ? { points: 0, mult: 1 as const, label: 'BOUNCE', double: false } : scoreAt(dx, dy)
  m.visitLabels.push(seg.label)
  p.dartsThrown += 1
  const next = p.score - seg.points
  const visitTotal = p.visitStart - next

  if (next < 0 || next === 1 || (next === 0 && !seg.double)) {
    p.score = p.visitStart
    m.dartsLeft = 0 // beurt meteen voorbij
    return { seg, bust: true, finished: false, visitTotal: 0 }
  }
  p.score = next
  m.dartsLeft -= 1
  if (next === 0) {
    m.winner = m.current
    return { seg, bust: false, finished: true, visitTotal }
  }
  return { seg, bust: false, finished: false, visitTotal }
}

export function nextVisit(m: DartsMatch): void {
  m.current = (m.current + 1) % m.players.length
  const p = m.players[m.current]
  p.visitStart = p.score
  m.dartsLeft = 3
  m.visitLabels = []
}

// ── Computer-gooier ───────────────────────────────────────────────────────────
// Doelkeuze: scoren op T20, finishen op een dubbel, en de klassieke opzet naar D16.
export function aiTarget(score: number): { x: number; y: number } {
  if (score === 50) return aimPoint(0, 'BULL')
  if (score <= 40 && score % 2 === 0) return aimPoint(score / 2, 'D')
  if (score <= 60) {
    const setup = score - 32 // laat dubbel-16 over
    if (setup >= 1 && setup <= 20) return aimPoint(setup, 'S')
    return aimPoint(Math.min(20, score - 2), 'S')
  }
  return aimPoint(20, 'T')
}

// Mik-fout van de computer: normaal-verdeeld, kleiner op hogere moeilijkheid.
export function aiScatter(difficulty: number): number {
  const diff = Math.max(0, Math.min(1, difficulty))
  const sigma = 30 - diff * 19 // makkelijk ~30, pittig ~11 (op een bord met straal 200)
  // Box-Muller
  const u = Math.random() || 1e-9
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma
}
