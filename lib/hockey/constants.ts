// Alle wereld-afmetingen in logische eenheden (~decimeters). Renderer schaalt dit
// naar het scherm; niets hierin is scherm- of framerate-afhankelijk.

// ── IJsbaan ─────────────────────────────────────────────────────────────────
// Horizontale rink: doelen links (team 1) en rechts (team 0). Aanval loopt over x.
// Belangrijkste verschil met voetbal: de puck gaat NOOIT uit — de boarding houdt alles binnen.
export const PITCH_LENGTH = 1560 // x: doel-tot-doel (echte rink is ~2:1)
export const PITCH_WIDTH = 800 // y: boarding-tot-boarding
export const GOAL_WIDTH = 130 // y-opening van het doel (hockeygoal is klein)
export const GOAL_DEPTH = 30 // hoe diep de puck achter de lijn moet voor een goal
export const PENALTY_W = 260 // verdedigingszone-diepte (keeper-AI gebruikt dit als gevarenzone)
export const PENALTY_H = 420 // verdedigingszone-breedte
export const CENTER_CIRCLE_R = 130
export const WALL_RESTITUTION = 0.8 // boarding stuitert lekker mee (bandenspel!)

// ── Timing ──────────────────────────────────────────────────────────────────
export const FIXED_DT = 1 / 60 // vaste simulatie-tick (deterministisch)
export const MAX_STEPS_PER_FRAME = 5 // spiraal-van-de-dood-rem in de accumulator-loop

// ── Speler ──────────────────────────────────────────────────────────────────
export const PLAYERS_PER_TEAM = 6 // 5 schaatsers + 1 goalie (2 defense, 3 forwards)
// Speler-eigenschappen (pace/shot/tackle, 1..5): elk punt boven/onder 3 = ±deze fractie.
// 0.06 → een 5 is +12% en een 1 is −12% t.o.v. gemiddeld. Subtiel maar voelbaar over een pot.
export const TRAIT_STEP = 0.06
export const traitMul = (rating: number): number => 1 + (rating - 3) * TRAIT_STEP
export const PLAYER_RADIUS = 12
export const PLAYER_ACCEL = 1050 // schaatsen: langzamer op gang komen dan rennen
export const PLAYER_MAX_SPEED = 205 // maar een hogere topsnelheid (glijden!)
export const KEEPER_MAX_SPEED = 215 // goalie blijft kwiek in z'n crease
export const PLAYER_FRICTION = 4.2 // ijs: veel minder grip → uitglijden in bochten (skate-drift)

// ── Tackelen / afpakken ───────────────────────────────────────────────────────
export const TACKLE_RADIUS = 27 // kom je zó dicht bij de balbezitter, dan pak je de bal af
export const TACKLE_COOLDOWN = 0.6 // seconden dat de afgepakte speler niet meteen terug kan tackelen

// ── Puck ────────────────────────────────────────────────────────────────────
export const BALL_RADIUS = 6.5 // de puck (klein en plat)
export const BALL_FRICTION = 0.2 // glijdt en glijdt — dé hockey-feel (voetbal: 0.72)
export const BALL_MAX_SPEED = 980 // slapshots zoeven
export const CONTROL_RADIUS = 27 // binnen deze straal "voelt" een speler de bal
export const DRIBBLE_PUSH = 60 // ondergrens balsnelheid bij dribbelen (voorkomt wegschieten bij stilstand)
export const DRIBBLE_KEEP = 24 // gewenste bal-afstand vóór de dribbelende speler (kleiner = strakker aan de voet)
export const DRIBBLE_PULL = 4.4 // hoe hard de bal naar dat punt wordt getrokken (hoger = plakt meer)
export const DRIBBLE_MAX_FACTOR = 1.05 // bal mag hooguit ~5% sneller dan de speler → blijft aan de voet
export const TAKE_OVER_SPEED = 460 // boven deze balsnelheid moet je de bal eerst temmen

// Trap: een aankomende (pass/losse) bal wordt bij controle afgeremd → blijft aan de voet.
export const TRAP_DAMPEN = 0.3 // resterende balsnelheid na een trap
export const TRAP_MIN_SPEED = 260 // onder deze snelheid is 't al "aan de voet" (dribbel), niet trappen
export const TRAP_MAX_SPEED = 700 // boven deze snelheid (keiharde knal) kun je 'm niet temmen

// Fysieke bal↔lichaam-botsing: spelers blokkeren/ketsen snelle ballen (schoten, harde passes).
export const BODY_BLOCK_SPEED = 240 // alleen ballen sneller dan dit ketsen af tegen lichamen
export const BODY_RESTITUTION = 0.55 // hoeveel snelheid behouden blijft bij een blok
export const GK_SAVE_RADIUS = 37 // keeper heeft een grotere reikwijdte (redt ballen in de buurt)
export const GK_REACH_HEIGHT = 42 // keeper pakt ook hoge/gelofte ballen tot deze hoogte

// Hoogte: een geladen schot lift een beetje (passes/zachte schoten blijven op de grond).
export const BALL_GRAVITY = 1300 // valversnelling (z)
export const SHOT_LIFT_VZ = 360 // opwaartse snelheid bij een volledig geladen schot
export const LIFT_MIN_CHARGE = 0.42 // onder deze laadfractie geen lift (pass/zacht schot)
export const AIR_CONTROL_HEIGHT = 12 // boven deze hoogte vliegt de bal "over" spelers (geen controle/blok)

// ── Schot & pass (power-balk) ─────────────────────────────────────────────────
// Kracht schaalt met hoe lang je de knop vasthoudt: tik = pass, vol geladen = knal.
export const PASS_POWER = 370 // korte tik → zachte pass
export const KICK_POWER = 820 // volledig geladen → keiharde knal (2026-07: iets harder)
export const MAX_CHARGE_TIME = 0.95 // seconden vasthouden voor volle kracht (langer = meer skill)
export const KICK_COOLDOWN = 0.28 // seconden tussen twee trappen door dezelfde speler
export const PASS_ASSIST_CONE = 0.9 // radialen (~51°): passes binnen deze hoek snappen naar een medespeler
export const PASS_ASSIST_RANGE = 560 // maximale pass-assist-afstand
export const PASS_CHARGE_MAX = 0.34 // onder deze laadtijd geldt de trap als "pass" (assist aan)

// ── Slapshot (E, laadbaar) — dé hockey-knal ────────────────────────────────────
// Vol opladen = windup met de stick → keiharde lage knal over het ijs. Harder dan een
// gewoon schot (Space), maar minder zuiver: de spray groeit mee met de laadtijd.
export const SLAP_MIN_POWER = 500 // korte tik E → toch al stevig
export const SLAP_MAX_POWER = 950 // vol geladen → zoeft (nét onder BALL_MAX_SPEED)
export const SLAP_SPRAY = 0.12 // hoek-afwijking bij vol laden (~7°, ~2,5× het gewone schot)
export const SLAP_FULL_CHARGE = 0.85 // vanaf deze laadfractie telt-ie als "vol" → slow-mo + popup
export const SLOWMO_TIME = 0.75 // seconden slow-motion na een volle slapshot (client vertraagt even)

// ── Curve & spray bij harde schoten (het "je knalt keihard"-gevoel) ────────────
export const SHOT_SPRAY = 0.05 // max. willekeurige hoek-afwijking (rad, ~3°) bij een vol geladen schot
export const SHOT_SPIN = 0.9 // max. curve die een geladen schot meekrijgt (grootte van ball.spin)
export const SPIN_ACCEL = 0.9 // hoe sterk de spin de bal zijwaarts laat krullen (Magnus-factor)
export const SPIN_DECAY = 1.6 // per seconde; de curve dooft geleidelijk uit

// ── Sprint & bodycheck (Q) ────────────────────────────────────────────────────
export const SPRINT_MULT = 1.42 // topsnelheid-boost tijdens sprint
export const SPRINT_DRAIN = 0.55 // stamina/seconde tijdens sprinten
export const STAMINA_REGEN = 0.32 // stamina/seconde herstel in rust
export const SPRINT_MIN = 0.06 // onder deze stamina kun je niet sprinten
// Q = BODYCHECK: korte, felle schouder-dash (geen glijdende voetbal-sliding). Raak je de
// puckdrager → die klapt tegen het ijs en de puck schiet los. Te wild = strafbankje.
export const SLIDE_TIME = 0.3 // duur van de check-dash (kort en explosief)
export const SLIDE_SPEED = 440 // dash-snelheid van de check
export const SLIDE_COOLDOWN = 0.6 // herstel (trager) na een check
export const SLIDE_STEAL_RADIUS = 30 // binnen deze straal tik je de puck los met een check
export const RECOVER_SPEED_MULT = 0.55 // schaatssnelheid tijdens herstel na een check
export const TUMBLE_TIME = 0.65 // duur dat een gechecked speler over het ijs tuimelt
export const TUMBLE_KNOCK = 320 // terugstoot bij een check (harder dan voetbal — ijs glijdt)

// ── Spin-o-rama (R, mét puck) ──────────────────────────────────────────────────
// 360°-pirouette mét de puck: korte dash waarin je onaantastbaar bent voor checks.
export const FEINT_SPEED = 265 // dash-snelheid tijdens de spin (rustiger dan de kap — je draait)
export const FEINT_TIME = 0.45 // duur van de volledige draai
export const FEINT_COOLDOWN = 0.9 // herstel voor je opnieuw kunt spinnen

// ── Hakje/wip (Q met bal): bal vooruit + omhoog wippen, over een tegenstander heen ─────
export const FLICK_SPEED = 285 // vooruit-snelheid van de wip (rustig → je loopt erop)
export const FLICK_LIFT = 215 // opwaartse snelheid (hop over een sliding heen)

// ── Panna (Q met bal + verdediger recht vooruit): bal door de benen ───────────────────
export const PANNA_RANGE = 60 // verdediger binnen deze afstand recht vooruit → panna-poging
export const PANNA_CHANCE = 0.5 // slaagkans (lukt niet altijd → soms bal kwijt)
export const PANNA_SPEED = 215 // snelheid waarmee de bal door de benen naar voren gaat

// ── Herstart: tegenstander op afstand houden tot de bal genomen is ──────────────
export const RESTART_KEEP_RADIUS = 95 // straal rond de bal bij een vrije trap/set-piece

// ── Scheidsrechter & overtredingen ────────────────────────────────────────────
export const REF_SPEED = 132 // hoe snel de scheids meeloopt
export const REF_LAG = 110 // afstand die de scheids van de bal houdt
export const FOUL_RADIUS = 15 // slide raakt de man binnen deze straal → overtreding (krapper = minder fluitjes)
export const SETPIECE_READY = 0.6 // korte pauze voor een set-piece speelbaar wordt
export const FOUL_COOLDOWN = 1.6 // min. sim-tijd tussen twee overtredingen (ruim → straffen blijven zeldzaam)
// Een bodycheck is in hockey grotendeels LEGAAL — niet elke rake check is een straf. Alleen
// een fractie wordt gefloten; de rest is gewoon een fair charge (tumble blijft, geen strafbankje).
// Van achteren checken is het smerigst → grootste kans; iemand zónder puck raken = interference.
export const FOUL_CHANCE_CLEAN = 0.08 // schone check op de puckdrager (van voren) → zelden een fluit
export const FOUL_CHANCE_INTERFERENCE = 0.3 // check op een man zónder de puck
export const FOUL_CHANCE_BEHIND = 0.45 // check van achteren (boarding/checking from behind)
export const FOUL_ANIM_DELAY = 0.5 // sim-tijd tussen de tackle-inslag (tumble) en het toekennen van de overtreding
// IJshockey kent geen kaarten maar een STRAFBANKJE: elke overtreding = tijdstraf, de speler
// zit z'n tijd uit naast de rink en komt daarna terug (powerplay voor de tegenstander!).
// Van achteren checken is erger → langere straf.
export const PENALTY_BOX_TIME = 20 // sim-seconden "2 minuten" (geschaald op een helft van 2 min)
export const PENALTY_BOX_TIME_BEHIND = 30 // check van achteren → zwaardere straf ("5 minuten")
// Vechtpartij: kleine kans dat een bestrafte wilde check ontaardt in een 1v1-knokpartij.
export const BRAWL_CHANCE = 0.12 // kans per bestrafte check
export const BRAWL_FIGHT_TIME = 3.0 // seconden worstelen/meppen (spel bevriest, iedereen kijkt)
export const BRAWL_KO_TIME = 1.1 // daarna: de verliezer gaat tegen het ijs, dán pas de tijdstraf

// ── Veldbestormer (fun) ─────────────────────────────────────────────────────
export const STREAKER_RADIUS = 11
export const STREAKER_SPEED = 180 // rent vrolijk sneller dan de spelers
export const STREAKER_MIN_GAP = 9 // minimaal aantal seconden tussen twee bestormingen
export const STREAKER_SPAWN_CHANCE = 0.22 // kans/seconde ná de cooldown (alleen tijdens 'playing')
export const STREAKER_KICKOFF_GAP = 5 // korte pauze ná een aftrap (voorkomt streaker meteen bij de aftrap)
export const STREAKER_MAX_LIFE = 16 // veiligheids-timeout (s) mocht hij z'n doel nooit halen
export const STREAKER_BALL_KICK = 320 // snelheid waarmee hij een aangeraakte bal wegketst
// Beveiliger die de bestormer achterna zit:
export const SECURITY_SPEED = 208 // iets sneller dan de streaker → haalt 'm uiteindelijk in
export const SECURITY_SPAWN_AFTER = 1.1 // sec nadat de streaker verschijnt komt de beveiliger 't veld op
export const SECURITY_CATCH_RADIUS = 24 // binnen deze straal grijpt hij de streaker → beiden weg
// Fun-tackle: scheids/streaker/bewaker mag je omver sliden (nooit een kaart) → ze tuimelen extra hard.
export const FUN_TUMBLE_TIME = 0.95
export const FUN_KNOCK = 320

// ── Zamboni-invasie (fun) ────────────────────────────────────────────────────
export const ZAMBONI_W = 104 // lengte van de dweilmachine (world-units)
export const ZAMBONI_H = 58 // breedte
export const ZAMBONI_SPEED = 158 // rijdt rustig maar onverbiddelijk recht over het ijs
export const ZAMBONI_MIN_GAP = 24 // seconden tussen twee invasies (zeldzamer dan een streaker)
export const ZAMBONI_SPAWN_CHANCE = 0.06 // kans/seconde ná de cooldown (alleen tijdens 'playing')
export const ZAMBONI_KNOCK = 470 // wie geraakt wordt vliegt hard opzij

// ── IJs-beest: octopus / pinguïn-mascotte (fun) ──────────────────────────────
export const CRITTER_RADIUS = 15
export const CRITTER_SPEED = 152 // glibbert/waddelt over het ijs
export const CRITTER_MIN_GAP = 18 // seconden tussen twee beesten
export const CRITTER_SPAWN_CHANCE = 0.1 // kans/seconde ná de cooldown (alleen tijdens 'playing')
export const CRITTER_MAX_LIFE = 12 // veiligheids-timeout (s)
export const CRITTER_BALL_KICK = 300 // snelheid waarmee-ie de puck wegketst
export const DINO_RADIUS = 34 // stampende T-rex: grotere botsradius dan een gewoon beest
export const DINO_KNOCK = 440 // spelers die de dino tegenkomt vliegen tuimelend weg

// ── Power-up boosts (fun) ──────────────────────────────────────────────────────
// Zwevende tokens op het ijs; schaats erover → tijdelijk supersnel, reuzegroot, minigroot of magneet.
export const BOOST_DURATION = 7.5 // hoe lang een opgepakte boost werkt (s)
export const BOOST_TOKEN_LIFE = 16 // hoe lang een token op het ijs blijft liggen (s)
export const BOOST_SPAWN_EVERY = 8 // basis-interval tussen nieuwe tokens (s, + wat random)
export const BOOST_MAX_ON_ICE = 2 // max aantal tokens tegelijk op het ijs
export const BOOST_PICKUP_R = 16 // oppak-straal van een token
export const BOOST_SPEED_MULT = 1.8 // ⚡ supersnelheid
export const BOOST_GIANT_SCALE = 2.0 // 🐘 render-schaal reus
export const BOOST_TINY_SCALE = 0.5 // 🐜 render-schaal dwerg
export const BOOST_GIANT_SPEED = 0.9 // reus schaatst iets trager
export const BOOST_TINY_SPEED = 1.35 // dwerg is juist kwiek
export const BOOST_GIANT_REACH = 12 // reus heeft langere stick-reach (puckcontrole)
export const BOOST_TINY_REACH = -4 // dwerg heeft kortere reach
export const BOOST_GIANT_SHOT = 1.4 // reus knalt harder
export const BOOST_MAGNET_RANGE = 78 // 🧲 puck wordt aangetrokken binnen deze straal
export const BOOST_MAGNET_PULL = 900 // versnelling waarmee de puck naar de magneet-speler zuigt

// ── Explosieve TNT-puck (fun) ────────────────────────────────────────────────
export const PUCKBOMB_MIN_GAP = 22 // seconden tussen twee bom-pucks
export const PUCKBOMB_SPAWN_CHANCE = 0.05 // kans/seconde ná de cooldown (alleen tijdens 'playing')
export const PUCKBOMB_FUSE = 3.2 // seconden lont vóór de knal — tik 'm snel weg!
export const PUCKBOMB_RADIUS = 155 // straal waarbinnen spelers wegvliegen bij de explosie
export const PUCKBOMB_KNOCK = 640 // terugstoot van de explosie

// ── Camera ──────────────────────────────────────────────────────────────────
export const CAMERA_LERP = 5 // hoe soepel de camera de bal volgt (hoger = strakker)
export const VIEW_WORLD_H_FALLBACK = 740 // (renderer heeft eigen constante; hier als referentie)
