// Knokstukken — 1v1 arcade-boksen. De ring is 1-dimensionaal (voetenwerk = links/rechts),
// de kunst zit in afstand, timing en stamina. Wereld-units ~ pixels op zoom 1.

// ── Ring ─────────────────────────────────────────────────────────────────────
export const RING_L = 1000 // wereldbreedte
export const RING_MIN_X = 150 // linker touw (verder kun je niet terug)
export const RING_MAX_X = 850 // rechter touw
export const FIGHTER_GAP = 58 // minimale afstand tussen de twee (geen clippen)

// ── Vechter ──────────────────────────────────────────────────────────────────
export const MOVE_SPEED = 300 // voetenwerk (× pace-trait) — kwiek op de benen (dynamischer)
export const BLOCK_MOVE_MULT = 0.4 // al blokkend schuifel je maar langzaam
export const MAX_HP = 100
export const MAX_STAM = 100

// ── Dodge (ontwijken) ──────────────────────────────────────────────────────────
// Snelle uitwijk-beweging: hop naar achteren + duik. Tijdens de i-frames mist elke stóót
// (maar NIET de clinch — dat is de anti-dodge).
export const DODGE_TIME = 0.26 // duur van de uitwijk (i-frames) — snappy
export const DODGE_CD = 0.72 // herstel voor je opnieuw kunt ontwijken (voorkomt eindeloos dodge-spam)
export const DODGE_STEP = 95 // hoe ver je naar achteren wijkt

// ── Clinch (F) — de ANTI-DODGE ─────────────────────────────────────────────────
// Een korte duw/greep die dwars door een dodge én een blok heen raakt: matige schade maar
// een flinke terugduw + stun. Mis = lange recovery (dan sta je open). Kort bereik.
export const GRAB_WINDUP = 0.16
export const GRAB_TOTAL = 0.5
export const GRAB_RANGE = 84
export const GRAB_DMG = 12
export const GRAB_STAM = 14
export const GRAB_PUSHBACK = 76 // duwt de tegenstander flink naar achteren
export const GRAB_STUN = 0.5 // seconden versuft na een clinch (langer dan een gewone treffer)

// ── Stoten ───────────────────────────────────────────────────────────────────
// Alles bliksemsnel: korte windup + kort herstel → rappe, dynamische uitwisselingen.
// Jab (directe): razendsnel, kort bereik, weinig schade — het brood-en-boter-tikje.
export const JAB_WINDUP = 0.08 // seconden tot het raakmoment
export const JAB_TOTAL = 0.17 // totale duur (daarna weer dekking)
export const JAB_RANGE = 96
export const JAB_DMG = 6
export const JAB_STAM = 7
// Hoek: snel, maar nog leesbaar genoeg om te counteren.
export const HOOK_WINDUP = 0.16
export const HOOK_TOTAL = 0.3
export const HOOK_RANGE = 106
export const HOOK_DMG = 15
export const HOOK_STAM = 16
// Uppercut (Q): explosief snel — ramt door de dekking en vloert bijna zeker vol aan.
export const UPPERCUT_WINDUP = 0.12
export const UPPERCUT_TOTAL = 0.27
export const UPPERCUT_RANGE = 92
export const UPPERCUT_DMG = 32
export const UPPERCUT_STAM = 22
export const UPPERCUT_BLOCK_REDUCE = 0.5 // helft komt er dóór het blok (i.p.v. 15%)
export const UPPERCUT_KD = 0.8 // grote kans op een directe knock-down bij een volle raker
// Ultimate (R): de haymaker. Alleen bij een volle meter; een RUSH naar voren met een enorme uithaal,
// vloert gegarandeerd als-ie schoon aankomt (te blokken/ontwijken). Kost geen stamina.
export const ULT_WINDUP = 0.26
export const ULT_TOTAL = 0.54
export const ULT_RANGE = 108
export const ULT_DMG = 70
export const ULT_BLOCK_REDUCE = 0.6
export const ULT_RUSH_SPEED = 460 // hoe snel je tijdens de ultimate naar de tegenstander stormt

// ── Ultimate-meter ─────────────────────────────────────────────────────────────
export const ULT_MAX = 100
export const ULT_GAIN_LAND = 11 // meter-winst per uitgedeelde treffer
export const ULT_GAIN_CLEAN = 6 // extra bij een zuivere
export const ULT_GAIN_TAKE = 7 // ook geraakt worden vult 'm (comeback-mechaniek)

// ── Verdediging & schade ─────────────────────────────────────────────────────
export const BLOCK_REDUCE = 0.15 // geblokte stoot doet nog maar 15% (chip damage)
export const BLOCK_STAM_COST = 5 // blokken kost de verdediger stamina per opgevangen stoot
export const HIT_STUN = 0.24 // seconden versuft na een treffer (combo-venster!)
export const HIT_PUSHBACK = 26 // treffer duwt je naar achteren
export const CLEAN_BASE = 0.04 // basiskans op een "zuivere treffer" (×1.6 schade + sterren)
export const CLEAN_PER_SHOT = 0.025 // + per punt shot-trait
export const CLEAN_MULT = 1.6
export const TRAIT_DMG = 0.09 // tackle: elk punt boven/onder 3 = ±9% uitgedeelde schade
export const TRAIT_CHIN = 0.05 // tackle: elk punt boven/onder 3 = ∓5% ontvangen schade (kin!)
export const TRAIT_SPEED = 0.06 // pace: ±6% loop- en stoot-snelheid per punt

// ── Stamina ──────────────────────────────────────────────────────────────────
export const STAM_REGEN_IDLE = 13 // per seconde in dekking/rust
export const STAM_REGEN_MOVE = 7
export const STAM_REGEN_BLOCK = 3
export const LOW_STAM = 22 // hieronder: armen van beton → −40% schade, −25% tempo

// ── Knockdown & knock-out ────────────────────────────────────────────────────
export const COUNT_MAX = 10 // de teller van de scheids
export const GETUP_BASE = 7 // spatie-taps nodig om op te staan bij de 1e knockdown…
export const GETUP_PER_KD = 5 // …en zoveel taps extra per eerdere knockdown
export const GETUP_HP = 42 // HP waarmee je opstaat (minus 8 per eerdere knockdown, min 26)
export const MAX_KNOCKDOWNS = 3 // derde keer neer = TKO

// ── Wedstrijd ────────────────────────────────────────────────────────────────
export const ROUND_TIME = 60 // seconden per ronde
export const REST_TIME = 4 // pauze tussen de rondes (in de hoek)
export const REST_HEAL = 20 // HP-herstel in de hoek
export const DEFAULT_ROUNDS = 2
export const FIXED_DT = 1 / 120
