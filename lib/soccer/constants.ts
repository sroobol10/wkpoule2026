// Alle wereld-afmetingen in logische eenheden (~decimeters). Renderer schaalt dit
// naar het scherm; niets hierin is scherm- of framerate-afhankelijk.

// ── Veld ────────────────────────────────────────────────────────────────────
// Horizontaal veld: doelen links (team 1) en rechts (team 0). Aanval loopt over x.
export const PITCH_LENGTH = 1650 // x: doel-tot-doel
export const PITCH_WIDTH = 960 // y: zijlijn-tot-zijlijn
export const GOAL_WIDTH = 175 // y-opening van het doel
export const GOAL_DEPTH = 38 // hoe diep de bal achter de lijn moet voor een goal
export const PENALTY_W = 300 // strafschopgebied: diepte (langs x)
export const PENALTY_H = 490 // strafschopgebied: breedte (langs y)
export const CENTER_CIRCLE_R = 150
export const WALL_RESTITUTION = 0.55 // demping bij stuiteren tegen zij-/achterlijn (arcade)

// ── Timing ──────────────────────────────────────────────────────────────────
export const FIXED_DT = 1 / 60 // vaste simulatie-tick (deterministisch)
export const MAX_STEPS_PER_FRAME = 5 // spiraal-van-de-dood-rem in de accumulator-loop

// ── Speler ──────────────────────────────────────────────────────────────────
export const PLAYERS_PER_TEAM = 7 // 6 veldspelers + 1 keeper (2-3-1)
// Speler-eigenschappen (pace/shot/tackle, 1..5): elk punt boven/onder 3 = ±deze fractie.
// 0.06 → een 5 is +12% en een 1 is −12% t.o.v. gemiddeld. Subtiel maar voelbaar over een pot.
export const TRAIT_STEP = 0.06
export const traitMul = (rating: number): number => 1 + (rating - 3) * TRAIT_STEP
export const PLAYER_RADIUS = 12
export const PLAYER_ACCEL = 1700 // versnelling richting gewenste snelheid
export const PLAYER_MAX_SPEED = 180 // rustiger tempo (~12% trager, 2026-07-02)
export const KEEPER_MAX_SPEED = 228 // keeper reageert kwiek (komt vlot uit, minder passief)
export const PLAYER_FRICTION = 9 // remt spelers af als er geen input is

// ── Tackelen / afpakken ───────────────────────────────────────────────────────
export const TACKLE_RADIUS = 27 // kom je zó dicht bij de balbezitter, dan pak je de bal af
export const TACKLE_COOLDOWN = 0.6 // seconden dat de afgepakte speler niet meteen terug kan tackelen

// ── Bal ─────────────────────────────────────────────────────────────────────
export const BALL_RADIUS = 8
export const BALL_FRICTION = 0.72 // per seconde; hoger = rolt korter
export const BALL_MAX_SPEED = 900 // wat kopruimte zodat een 5★-knal echt harder is dan de rest
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

// ── Stift/lange bal (E, laadbaar) & omhaal ─────────────────────────────────────
export const CHIP_MIN_POWER = 210 // korte tik E → zacht lobje (bewust traag → goed te timen)
export const CHIP_MAX_POWER = 430 // vol geladen E → langere bal, maar nog steeds rustig
export const BICYCLE_MIN_Z = 9 // bal minimaal zó hoog → een getimede knal wordt een omhaal
export const BICYCLE_POWER = 860 // omhaal knalt hard richting doel
export const BICYCLE_LIFT = 300 // opwaartse boog van de omhaal
export const SLOWMO_TIME = 0.75 // seconden slow-motion na een omhaal (client vertraagt de sim even)

// ── Curve & spray bij harde schoten (het "je knalt keihard"-gevoel) ────────────
export const SHOT_SPRAY = 0.05 // max. willekeurige hoek-afwijking (rad, ~3°) bij een vol geladen schot
export const SHOT_SPIN = 0.9 // max. curve die een geladen schot meekrijgt (grootte van ball.spin)
export const SPIN_ACCEL = 0.9 // hoe sterk de spin de bal zijwaarts laat krullen (Magnus-factor)
export const SPIN_DECAY = 1.6 // per seconde; de curve dooft geleidelijk uit

// ── Sprint & sliding ──────────────────────────────────────────────────────────
export const SPRINT_MULT = 1.42 // topsnelheid-boost tijdens sprint
export const SPRINT_DRAIN = 0.55 // stamina/seconde tijdens sprinten
export const STAMINA_REGEN = 0.32 // stamina/seconde herstel in rust
export const SPRINT_MIN = 0.06 // onder deze stamina kun je niet sprinten
export const SLIDE_TIME = 0.42 // duur van een sliding
export const SLIDE_SPEED = 380 // snelheid van de lunge tijdens de slide
export const SLIDE_COOLDOWN = 0.6 // herstel (trager) na een slide
export const SLIDE_STEAL_RADIUS = 30 // binnen deze straal pak je de bal met een slide
export const RECOVER_SPEED_MULT = 0.55 // loopsnelheid tijdens herstel na een slide
export const TUMBLE_TIME = 0.65 // duur dat een getackelde speler tuimelt (geen controle)
export const TUMBLE_KNOCK = 235 // terugstoot-snelheid bij het omvergelopen worden
export const SLIDE_BURST_MULT = 0.52 // balbezitter met Q: kleinere boost (geen echte tackle)
export const SLIDE_BURST_TIME = 0.26 // kortere duur voor de aanvallers-boost

// ── Schijnbeweging / kap (R) ────────────────────────────────────────────────────
export const FEINT_SPEED = 330 // korte, snelle dash mét de bal om een verdediger te passeren
export const FEINT_TIME = 0.2 // duur van de kap
export const FEINT_COOLDOWN = 0.7 // herstel voor je opnieuw kunt kappen

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
export const FOUL_COOLDOWN = 0.7 // min. sim-tijd tussen twee overtredingen (voorkomt dubbele kaarten in 1 frame)
export const FOUL_ANIM_DELAY = 0.5 // sim-tijd tussen de tackle-inslag (tumble) en het toekennen van de overtreding
// Kaart-kansen bij een slide-overtreding (van achteren is erger). Directe rood is nu zeldzaam;
// de meeste kaarten zijn geel (en 2× geel → rood).
export const FOUL_BEHIND_RED = 0.05
export const FOUL_BEHIND_YELLOW = 0.42
export const FOUL_FRONT_RED = 0.012
export const FOUL_FRONT_YELLOW = 0.2
// Escalatie: bij 3+ overtredingen binnen dit venster (sim-seconden) altijd minimaal geel
// (voorkomt dat het een schoppartij wordt). De timer reset bij elke nieuwe overtreding.
export const FOUL_STREAK_WINDOW = 22
export const FOUL_STREAK_LIMIT = 3

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

// ── Camera ──────────────────────────────────────────────────────────────────
export const CAMERA_LERP = 5 // hoe soepel de camera de bal volgt (hoger = strakker)
export const VIEW_WORLD_H_FALLBACK = 740 // (renderer heeft eigen constante; hier als referentie)
