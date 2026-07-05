// Pijlwerk — dartbord-geometrie en scoring. Standaardbord: 20 sectoren (20 bovenaan),
// dubbele ring buiten, triple ring halverwege, bull (25) en bullseye (50).
// Alle maten in wereld-units; het bord heeft straal BOARD_R.

export const BOARD_R = 200
export const R_BULLSEYE = 9 // 50 punten (dubbel! — telt als finish)
export const R_BULL = 22 // 25 punten
export const R_TRIPLE_IN = 116
export const R_TRIPLE_OUT = 132
export const R_DOUBLE_IN = 184
export const R_DOUBLE_OUT = 200

// Sectorvolgorde met de klok mee, beginnend bóven (20).
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

export type Segment = { points: number; mult: 1 | 2 | 3; label: string; double: boolean }

// Waar landt een pijl op (dx,dy) t.o.v. het bordmidden?
export function scoreAt(dx: number, dy: number): Segment {
  const r = Math.hypot(dx, dy)
  if (r > R_DOUBLE_OUT) return { points: 0, mult: 1, label: 'MIS', double: false }
  if (r <= R_BULLSEYE) return { points: 50, mult: 1, label: 'BULLSEYE', double: true } // 50 = dubbel-bull
  if (r <= R_BULL) return { points: 25, mult: 1, label: '25', double: false }
  // Sector: hoek t.o.v. recht omhoog, met de klok mee; sector-breedte 18°, 20 zit gecentreerd boven.
  let a = Math.atan2(dx, -dy) // 0 = boven, met de klok mee positief
  if (a < 0) a += Math.PI * 2
  const idx = Math.floor(((a + Math.PI / 20) % (Math.PI * 2)) / (Math.PI / 10)) % 20
  const base = SECTORS[idx]
  if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT) return { points: base * 3, mult: 3, label: `T${base}`, double: false }
  if (r >= R_DOUBLE_IN) return { points: base * 2, mult: 2, label: `D${base}`, double: true }
  return { points: base, mult: 1, label: `${base}`, double: false }
}

// Middelpunt (dx,dy) van een doelvak — voor de AI en de checkout-hint.
export function aimPoint(sector: number, ring: 'S' | 'D' | 'T' | 'BULL'): { x: number; y: number } {
  if (ring === 'BULL') return { x: 0, y: 0 }
  const idx = SECTORS.indexOf(sector)
  const a = idx * (Math.PI / 10) // sectormidden, 0 = boven
  const r = ring === 'T' ? (R_TRIPLE_IN + R_TRIPLE_OUT) / 2 : ring === 'D' ? (R_DOUBLE_IN + R_DOUBLE_OUT) / 2 : 158
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

// Simpele checkout-hulp: wat moet je (ongeveer) gooien om te finishen?
// Geen volledige finish-tabel — wél de klassiekers en een bruikbare hint.
export function checkoutHint(score: number, dartsLeft: number): string | null {
  if (score > 170 || score < 2) return null
  if (score === 50) return 'Bullseye!'
  if (score <= 40 && score % 2 === 0) return `D${score / 2}`
  if (dartsLeft >= 2) {
    if (score <= 60) {
      const setup = score - 32 // klassiek: naar dubbel 16
      if (setup >= 1 && setup <= 20) return `${setup} → D16`
      if (score % 2 === 1) return `${score - 40 > 0 ? `${score - 40} → D20` : '1 → D' + ((score - 1) / 2)}`
    }
    if (score === 170) return 'T20 T20 Bull'
    if (score >= 100) return 'T20 → rest'
    return `T${Math.min(20, Math.floor((score - 32) / 3))} → D16`
  }
  return null
}
