// Computer-bokser. Belangrijk: hij SCHADUWT de speler niet meer (dat voelde als "meebewegen").
// In plaats daarvan houdt-ie z'n eigen stukje ring vast en stapt alleen ín tijdens een
// aanvalsgolf; daarbuiten blijft-ie staan of zakt terug. Blokt getelegrafeerde stoten,
// maakt een versufte tegenstander af, en knalt z'n ultimate als de meter vol is.

import {
  HOOK_RANGE, HOOK_STAM, JAB_RANGE, JAB_STAM, LOW_STAM, RING_MAX_X, RING_MIN_X,
  UPPERCUT_RANGE, UPPERCUT_STAM, ULT_MAX, ULT_RANGE, GRAB_RANGE, GRAB_STAM,
} from './constants'
// idle-input met alle knoppen los
import type { BoksInput, Fighter, Match, Side } from './types'

const isPunching = (f: Fighter) => f.state === 'jab' || f.state === 'hook' || f.state === 'uppercut' || f.state === 'ultimate'

export function aiInput(m: Match, side: Side, difficulty: number): BoksInput {
  const diff = Math.max(0, Math.min(1, difficulty))
  const me = m.f[side]
  const opp = m.f[1 - side]
  const idle: BoksInput = { move: 0, block: false, jab: false, hook: false, uppercut: false, ultimate: false, dodge: false, grab: false }

  // Neergeslagen → rammen om op te staan (betere AI "ramt" sneller).
  if (m.phase === 'count' && m.down === side) return { ...idle, jab: Math.random() < 0.28 + 0.3 * diff }
  if (m.phase !== 'fight' || me.state === 'hit' || me.state === 'down' || isPunching(me)) return idle

  const dir = side === 0 ? 1 : -1 // richting de tegenstander
  const dist = Math.abs(opp.x - me.x)
  const oppPunching = isPunching(opp)
  const oppStunned = opp.state === 'hit'

  // Ultimate klaar? Binnen bereik en de ander haalt niet net uit → knallen (of afmaken op een versufte).
  if (me.ultimate >= ULT_MAX && dist < ULT_RANGE - 6 && !oppPunching && (oppStunned || Math.random() < 0.02 + 0.05 * diff)) {
    return { ...idle, ultimate: true }
  }

  // Clinch (anti-dodge) van de AI zelf: als de speler staat te turtelen (blokken/ontwijken) en
  // dichtbij is, af en toe erdoorheen duwen. Zeldzaam, schaalt met de moeilijkheid.
  if ((opp.state === 'block' || opp.state === 'dodge') && dist < GRAB_RANGE - 6 && me.stamina >= GRAB_STAM && Math.random() < 0.015 + 0.05 * diff) {
    return { ...idle, grab: true }
  }

  // Ontwijken op een aankomende zware stoot (hoek/uppercut/ultimate). Schaalt STERK met de
  // moeilijkheid: op makkelijk wijkt-ie bijna nooit uit, op pittig een echte kunst.
  if (oppPunching && me.dodgeCd <= 0 && dist < UPPERCUT_RANGE + 24) {
    const d = opp.state === 'ultimate' ? 0.02 + 0.45 * diff
      : opp.state === 'uppercut' ? 0.005 + 0.38 * diff
      : opp.state === 'hook' ? 0.14 * diff
      : 0
    if (d > 0 && Math.random() < d) return { ...idle, dodge: true }
  }

  // Blokken op een aankomende stoot — hoe zwaarder de stoot, hoe beter te lezen. Ook dit veel
  // milder op makkelijk (lage basiskans), zodat je stoten er op easy gewoon doorkomen.
  if (oppPunching && dist < HOOK_RANGE + 30 && me.stamina > 12) {
    const p = opp.state === 'ultimate' ? 0.05 + 0.45 * diff
      : opp.state === 'uppercut' ? 0.02 + 0.4 * diff
      : opp.state === 'hook' ? 0.01 + 0.38 * diff
      : 0.005 + 0.3 * diff
    if (Math.random() < p) return { ...idle, block: true }
  }

  // Moe? Terug en bijkomen achter de dekking.
  if (me.stamina < LOW_STAM) return { ...idle, move: -dir * 0.7, block: dist < JAB_RANGE + 30 }

  // Versufte tegenstander in bereik → afmaken: uppercut/hoek/jab.
  if (oppStunned && dist < UPPERCUT_RANGE + 6) {
    if (me.stamina >= UPPERCUT_STAM && Math.random() < 0.35 + 0.4 * diff) return { ...idle, uppercut: true }
    if (me.stamina >= HOOK_STAM && Math.random() < 0.5) return { ...idle, hook: true }
    if (me.stamina >= JAB_STAM) return { ...idle, jab: true }
  }

  // ── Voetenwerk: géén mirroring. Een trage aanvalsgolf (eigen ritme per bokser) bepaalt of
  //    we instappen; anders houden we ons eigen kwart van de ring vast. ──
  const beat = Math.sin(m.clock * 0.62 + side * 3.1) // iets snellere cyclus → actiever
  const jitter = Math.sin(m.clock * 1.9 + side * 1.3)
  const pressing = beat > -0.05 // vaker in de aanval (minder stilstaan)

  if (pressing) {
    if (dist > JAB_RANGE - 4) return { ...idle, move: dir * (0.4 + 0.45 * diff) } // instappen tot slagbereik
    // Op slagafstand: af en toe uithalen (welke stoot wisselt met het ritme), verder stilstaan.
    // De aanvalslust schaalt sterk met de moeilijkheid → op makkelijk gooit-ie veel minder.
    const atk = 0.55 + 0.45 * diff
    if (me.stamina >= HOOK_STAM && jitter > 0.5 && Math.random() < (0.008 + 0.03 * diff) * atk) return { ...idle, hook: true }
    if (me.stamina >= UPPERCUT_STAM && jitter < -0.55 && Math.random() < (0.005 + 0.02 * diff) * atk) return { ...idle, uppercut: true }
    if (me.stamina >= JAB_STAM && Math.random() < (0.012 + 0.06 * diff) * atk) return { ...idle, jab: true }
    return idle // blijf staan op afstand — niet de speler volgen
  }

  // Rust-venster: rustig terug naar het eigen kwart (vaste plek, niet de speler), met een dansje.
  const home = (RING_MIN_X + RING_MAX_X) / 2 - dir * 70
  const toHome = home - me.x
  if (Math.abs(toHome) > 18) return { ...idle, move: Math.sign(toHome) * 0.4 }
  // Te dichtbij terwijl we niet aanvallen? Klein stapje terug (afstand bewaren, geen shadow).
  if (dist < JAB_RANGE - 10) return { ...idle, move: -dir * 0.35, block: oppPunching }
  return { ...idle, move: jitter * 0.12 } // subtiel wiegen op de plek
}
