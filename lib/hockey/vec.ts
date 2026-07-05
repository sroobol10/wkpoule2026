// Minimale 2D-vector-helpers. Bewust plain objecten {x,y} (serialiseerbaar) i.p.v.
// classes, zodat de volledige game-state later over het netwerk kan voor online 1v1.
export type Vec2 = { x: number; y: number }

export const v = (x: number, y: number): Vec2 => ({ x, y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function norm(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y)
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }
}

// Beperk de lengte van een vector tot maximaal `max`.
export function clampLen(a: Vec2, max: number): Vec2 {
  const l = Math.hypot(a.x, a.y)
  return l > max ? { x: (a.x / l) * max, y: (a.y / l) * max } : a
}

export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n)

// Loodrecht (90° tegen de klok in) — gebruikt voor de zijwaartse aftertouch-kracht.
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })
// 2D "kruisproduct" (z-component) — teken bepaalt of aftertouch links/rechts krult.
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
