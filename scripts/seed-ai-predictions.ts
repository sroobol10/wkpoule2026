/**
 * WK Poule 2026 — AI voorspellingen seed script
 *
 * Vult de match_ai_predictions tabel met vooraf gegenereerde voorspellingen
 * voor alle 72 groepswedstrijden (geen Anthropic API nodig na dit script).
 *
 * Vereiste env vars in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Gebruik:
 *   npx tsx --env-file=.env.local scripts/seed-ai-predictions.ts
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient(url, key, {
  realtime: { transport: ws as unknown as typeof WebSocket },
})

// ─── Prediction data ──────────────────────────────────────────────────────────
// Key = "HomeEnglish vs AwayEnglish" (exact match to seed.ts MATCHES array)

type Pred = {
  homeScore: number
  awayScore: number
  match_analyse: string
  sleutelspelerThuis: string
  sleutelspelerUit: string
  kansThuis: number
  kansGelijkspel: number
  kansUit: number
}

const PREDICTIONS: Record<string, Pred> = {
  // ── Groep A ──────────────────────────────────────────────────────────────────
  'Mexico vs South Africa': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Mexico (FIFA #15) speelt voor eigen publiek met intensief pressing en snelle omschakeling. Zuid-Afrika (FIFA #60) leunt op binnenlandse spelers en counters, maar mist individuele kwaliteit om El Tri te bedreigen. Thuisvoordeel en betere organisatie geven Mexico de overwinning.',
    sleutelspelerThuis: 'Raúl Jiménez – spits (Fulham) met composure en link-up play; gevaarlijk als Mexico snel omswitcht.',
    sleutelspelerUit: 'Teboho Mokoena – middenvelder (Mamelodi Sundowns) met pinpoint passing en vrije trappen die de toon zet.',
    kansThuis: 66, kansGelijkspel: 20, kansUit: 14,
  },
  'South Korea vs Czech Republic': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Zuid-Korea (FIFA #25) heeft een hechte ploeggeest en talisman Son, maar wisselde laat naar 3-4-3. Tsjechië (FIFA #41) leunt op fysiek en Schick, die 16 Bundesliga-goals scoorde dit seizoen. Beide defensies zijn kwetsbaar, wat een open en evenwichtig duel oplevert.',
    sleutelspelerThuis: 'Son Heung-min – aanvaller (LAFC) en aanvoerder; Koreaanse talisman die op elk moment beslist.',
    sleutelspelerUit: 'Patrik Schick – spits (Bayer Leverkusen) met 16 Bundesliga-goals; zijn doelgevaar is Tsjechies wapen.',
    kansThuis: 40, kansGelijkspel: 35, kansUit: 25,
  },
  'Czech Republic vs South Africa': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Tsjechië (FIFA #41) heeft met Schick en Soucek ervaren kwaliteit, maar mist technische spelers en leunt op fysiek. Zuid-Afrika (FIFA #60) bestaat hoofdzakelijk uit binnenlandse spelers en zal counteren, wat te weinig is tegen Tsjechische vechtlust en set-piece-kracht.',
    sleutelspelerThuis: 'Patrik Schick – spits (Bayer Leverkusen); scoorde 100 goals voor Leverkusen, gevaarlijk bij elke actie.',
    sleutelspelerUit: 'Teboho Mokoena – middenvelder (Mamelodi Sundowns); vrijschopspecialist en ZA-motor die druk zet.',
    kansThuis: 62, kansGelijkspel: 22, kansUit: 16,
  },
  'Mexico vs South Korea': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Mexico (FIFA #15) pressing en snelle transities botsen op Zuid-Korea (FIFA #25) met hun hechte ploeggeest en gevaarlijk Son. Aguirres pragmatische aanpak wordt getest door Koreaans collectief. Beide ploegen hebben punten nodig; een gelijkspel is realistisch.',
    sleutelspelerThuis: 'Raúl Jiménez – spits (Fulham); composure in de zestien en link-up play bij snelle omschakelingen.',
    sleutelspelerUit: 'Son Heung-min – aanvaller (LAFC); oud Premier League golden boot-winnaar die Mexico-defensie tart.',
    kansThuis: 40, kansGelijkspel: 35, kansUit: 25,
  },
  'Czech Republic vs Mexico': {
    homeScore: 0, awayScore: 1,
    match_analyse: 'Mexico (FIFA #15) is hoger gerangschikt en bouwt op intensief pressing en omschakelingen. Tsjechië (FIFA #41) mist technische spelers om Mexico te counteren en leunt te zwaar op fysiek. Mexico\'s flexibele tactiek en betere ranking geven de doorslag.',
    sleutelspelerThuis: 'Patrik Schick – spits (Bayer Leverkusen); Tsjechische hoop op een goal maar staat voor zware verdediging.',
    sleutelspelerUit: 'Raúl Jiménez – spits (Fulham); bepalend in kleine ruimtes bij Mexicaans countervoetbal.',
    kansThuis: 28, kansGelijkspel: 32, kansUit: 40,
  },
  'South Africa vs South Korea': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Zuid-Afrika (FIFA #60) leunt op counter-aanvallen en teamwork onder Broos, maar mist diepgang buiten het basiseelf. Zuid-Korea (FIFA #25) heeft hechte ploeggeest, Son als talisman en meer squad-diepte. Het Koreaanse collectief wordt te sterk voor Bafana Bafana.',
    sleutelspelerThuis: 'Teboho Mokoena – middenvelder (Mamelodi Sundowns); spil van ZA die de schade probeert te beperken.',
    sleutelspelerUit: 'Son Heung-min – aanvaller (LAFC); aanvoerder en talisman die het verschil maakt voor Korea.',
    kansThuis: 18, kansGelijkspel: 28, kansUit: 54,
  },

  // ── Groep B ──────────────────────────────────────────────────────────────────
  'Canada vs Bosnia': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Canada (FIFA #30) speelt voor eigen publiek met een stabiel 4-4-2 en pressing. Bosnië (FIFA #64) speelt agressief en direct met snelle omschakelingen, maar verliest soms de discipline. Davies\' snelheid en Canadees thuisvoordeel geven de doorslag over Dzeko\'s ervaring.',
    sleutelspelerThuis: 'Alphonso Davies – verdediger (Bayern Munich); explosieve linksback, gevaarlijk langs elke flank.',
    sleutelspelerUit: 'Edin Dzeko – spits (Schalke); 40-jarige veteraan en historisch icoon van Bosnisch voetbal.',
    kansThuis: 52, kansGelijkspel: 25, kansUit: 23,
  },
  'Qatar vs Switzerland': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Qatar (FIFA #55) concedeerde 24 keer in 10 kwalificatieduels en heeft verdedigende problemen. Zwitserland (FIFA #19) won comfortabel zijn kwalificatiegroep met Xhaka als ervaren aanvoerder en een mix van ervaring en vers talent. Een Zwitserse overwinning is logisch.',
    sleutelspelerThuis: 'Akram Afif – aanvaller (Al-Sadd); twee keer Aziatisch speler van het jaar met assists en dribbels.',
    sleutelspelerUit: 'Granit Xhaka – middenvelder (Sunderland); captain met 140+ caps die Qatar onder druk zet.',
    kansThuis: 15, kansGelijkspel: 20, kansUit: 65,
  },
  'Switzerland vs Bosnia': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Zwitserland (FIFA #19) topped zijn kwalificatiegroep met stabiel voetbal en Xhaka als motor. Bosnië (FIFA #64) verraste door Italië uit te schakelen maar kan discipline verliezen. De Zwitserse organisatie en kwaliteitsdiepte zijn te veel voor het Bosnische collectief.',
    sleutelspelerThuis: 'Granit Xhaka – middenvelder (Sunderland); onbetwiste leider op zijn zevende groot toernooi.',
    sleutelspelerUit: 'Edin Dzeko – spits (Schalke); Bosnisch recordscorer die de ploeg overeind moet houden.',
    kansThuis: 65, kansGelijkspel: 20, kansUit: 15,
  },
  'Canada vs Qatar': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Canada (FIFA #30) drukt vol voor eigen publiek met pressing en flankspel. Qatar (FIFA #55) heeft een gebutst defensief en zal moeilijk standhouden tegen Canadees tempo en enthousiasme. Lopetegui\'s counter-recept is onvoldoende voor dit niveau.',
    sleutelspelerThuis: 'Alphonso Davies – verdediger (Bayern Munich); snelste speler op het veld, gevaarlijk bij iedere aanval.',
    sleutelspelerUit: 'Akram Afif – aanvaller (Al-Sadd); Qatar\'s enige echte dreiging met zijn dribbelkunsten.',
    kansThuis: 66, kansGelijkspel: 20, kansUit: 14,
  },
  'Switzerland vs Canada': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Zwitserland (FIFA #19) en Canada (FIFA #30) zijn in kwaliteit dicht bij elkaar. Xhaka stuurt het Zwitserse spel, Davies brengt Canada flankgevaar. Beide ploegen hebben genoeg aan een punt als ze al door zijn; een evenwichtig gelijkspel is het meest logisch.',
    sleutelspelerThuis: 'Granit Xhaka – middenvelder (Sunderland); captain die tactisch het verschil maakt in sleutelmomenten.',
    sleutelspelerUit: 'Alphonso Davies – verdediger (Bayern Munich); aanvallende linksback die Zwitserland verrast.',
    kansThuis: 42, kansGelijkspel: 35, kansUit: 23,
  },
  'Bosnia vs Qatar': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Bosnië (FIFA #64) speelt agressief en direct; Dzeko\'s aanwezigheid en groot Bosnisch talent in Alajbegovic zijn sterk. Qatar (FIFA #55) steunt op Afif\'s creativiteit maar heeft verdedigend tekortkomingen. Bosnische intensiteit geeft de doorslag.',
    sleutelspelerThuis: 'Edin Dzeko – spits (Schalke); referentiepunt van een generatie en gevaarlijk in de zestien.',
    sleutelspelerUit: 'Akram Afif – aanvaller (Al-Sadd); Qatar\'s dribbelkoning die voor spanning en een goal zorgt.',
    kansThuis: 42, kansGelijkspel: 30, kansUit: 28,
  },

  // ── Groep C ──────────────────────────────────────────────────────────────────
  'Brazil vs Morocco': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Brazilië (FIFA #6) bouwt rond Vinícius in een aanvallend 4-2-4. Marokko (FIFA #7) bereikte in 2022 de halve finale en creëert ruimte voor Hakimi, maar worstelde onder druk bij de Afcon. Brazilië is de lichte favoriet maar Marokko kan zeker voor verrassing zorgen.',
    sleutelspelerThuis: 'Vinícius Júnior – aanvaller (Real Madrid); gevaarlijkste man op het veld, ongrijpbaar op zijn best.',
    sleutelspelerUit: 'Achraf Hakimi – verdediger (PSG); beste rechtsback ter wereld, gevaarlijk aanvallend en verdedigend.',
    kansThuis: 50, kansGelijkspel: 27, kansUit: 23,
  },
  'Haiti vs Scotland': {
    homeScore: 0, awayScore: 3,
    match_analyse: 'Haïti (FIFA #82) debuteert na 1974 opnieuw op het WK met een snel counter-collectief. Schotland (FIFA #43) heeft een ervaren basis met McTominay en Robertson, al mist Clarke een betrouwbare spits. Schots organisatie en kwaliteitsdiepte zijn te groot voor Haïtiaans verzet.',
    sleutelspelerThuis: 'Wilson Isidor – spits (Sunderland); Haïti\'s dreiging voorin, snel en gevaarlijk in de lucht.',
    sleutelspelerUit: 'Scott McTominay – middenvelder (Napoli); Scudetto-winnaar die vanuit de tweede linie scoort.',
    kansThuis: 8, kansGelijkspel: 15, kansUit: 77,
  },
  'Scotland vs Morocco': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Schotland (FIFA #43) heeft McTominay en Robertson als steunpilaren maar mist een betrouwbare spits. Marokko (FIFA #7) profiteert van Hakimi\'s klasse en WK-ervaring uit 2022. Beide ploegen kunnen scoren; een gelijkspel weerspiegelt de verhoudingen.',
    sleutelspelerThuis: 'Scott McTominay – middenvelder (Napoli); scoort vanuit de tweede linie en is Schots hart en ziel.',
    sleutelspelerUit: 'Achraf Hakimi – verdediger (PSG); sterspeler die aanvallend vanuit rechts de toon zet.',
    kansThuis: 35, kansGelijkspel: 35, kansUit: 30,
  },
  'Brazil vs Haiti': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Brazilië (FIFA #6) met Ancelotti en Vinícius als speerpunt speelt agressief 4-2-4-voetbal. Haïti (FIFA #82) heeft instabiliteit gekend in de voorbereiding en mist diepgang. Het kwaliteitsverschil is enorm; Brazilië bouwt in dit duel vertrouwen op.',
    sleutelspelerThuis: 'Vinícius Júnior – aanvaller (Real Madrid); scoort en creëert; Haïti kan hem niet stoppen.',
    sleutelspelerUit: 'Wilson Isidor – spits (Sunderland); brengt kwaliteit en pedigree, maar staat voor onmogelijke opgave.',
    kansThuis: 93, kansGelijkspel: 5, kansUit: 2,
  },
  'Scotland vs Brazil': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Schotland (FIFA #43) speelt georganiseerd maar mist een betrouwbare spits en heeft geen Billy Gilmour. Brazilië (FIFA #6) heeft aanvalskwaliteit in 4-2-4 met Vinícius, Rodrygo en Neymar. Het Braziliaanse individuele niveau is te hoog voor Schotse veerkracht.',
    sleutelspelerThuis: 'Scott McTominay – middenvelder (Napoli); Schots hart en ziel, maar staat voor Braziliaanse klasse.',
    sleutelspelerUit: 'Vinícius Júnior – aanvaller (Real Madrid); ongrijpbaar en beslissend voor Brazilië.',
    kansThuis: 20, kansGelijkspel: 25, kansUit: 55,
  },
  'Morocco vs Haiti': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Marokko (FIFA #7) heeft WK-halffinaleervaring en speelt georganiseerd met Hakimi als sterspeler. Haïti (FIFA #82) heeft snelheid en Isidor voorin, maar mist diepgang en grote toernooiervaring. Marokko controleert dit duel comfortabel.',
    sleutelspelerThuis: 'Achraf Hakimi – verdediger (PSG); aanvallende motor langs rechts die kansen creëert en scoort.',
    sleutelspelerUit: 'Wilson Isidor – spits (Sunderland); Haïti\'s beste kans op een treffer via zijn snelheid en instinct.',
    kansThuis: 88, kansGelijkspel: 8, kansUit: 4,
  },

  // ── Groep D ──────────────────────────────────────────────────────────────────
  'United States vs Paraguay': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'De VS (FIFA #16) speelt voor eigen publiek met Pulisic als gezicht en WK-ervaren kern. Paraguay (FIFA #40) bouwt op fysiek spel en de flair van Enciso, maar scoorde nauwelijks in kwalificatie. Thuisvoordeel en Pochettino\'s kennis van knockout-voetbal geven de doorslag.',
    sleutelspelerThuis: 'Christian Pulisic – aanvaller (Milan); gezicht van het programma dat in grote duels voor de VS beslist.',
    sleutelspelerUit: 'Julio Enciso – aanvaller (Racing Strasbourg); Paraguays creatieve motor met flair en scorend vermogen.',
    kansThuis: 55, kansGelijkspel: 25, kansUit: 20,
  },
  'Australia vs Turkey': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Australië (FIFA #27) is onder Popovic taaier geworden met gevaarlijk counteraanvalsvoetbal en Irankunda. Turkije (FIFA #22) heeft met Güler en Yildiz twee van Europa\'s best aanvallende talenten, maar mist een bewezen spits. Een evenwichtig gelijkspel is het logische resultaat.',
    sleutelspelerThuis: 'Jackson Irvine – middenvelder (St Pauli); Australische motor met tactische rust en aanvalsinitiatief.',
    sleutelspelerUit: 'Arda Guler – middenvelder (Real Madrid); 21-jarige die 44% van Turkse goals bij was in kwalificatie.',
    kansThuis: 32, kansGelijkspel: 35, kansUit: 33,
  },
  'United States vs Australia': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'De VS (FIFA #16) heeft thuisvoordeel, WK-ervaren kern en Pulisic als bepalende speler. Australië (FIFA #27) speelt solide maar heeft een transitieskader zonder grote namen. Pochettino\'s ervaring met knock-out voetbal en Pulisic\'s klasse zijn doorslaggevend.',
    sleutelspelerThuis: 'Christian Pulisic – aanvaller (Milan); VS-kapitein die in groot stadion zijn klasse toont.',
    sleutelspelerUit: 'Jackson Irvine – middenvelder (St Pauli); Socceroo-leider die Australië bij de les houdt.',
    kansThuis: 60, kansGelijkspel: 22, kansUit: 18,
  },
  'Turkey vs Paraguay': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Turkije (FIFA #22) heeft Güler en Yildiz als aanvallende toptalenten en een harmonisch team onder Montella. Paraguay (FIFA #40) is fysiek en taai maar scoorde slechts twee goals in kwalificatie en steunt te zwaar op Enciso. Turks aanvallend duo beslist dit duel.',
    sleutelspelerThuis: 'Arda Guler – middenvelder (Real Madrid); ster van het Turkse team die wedstrijden kan beslissen.',
    sleutelspelerUit: 'Julio Enciso – aanvaller (Racing Strasbourg); Paraguays enige echte creatieve dreiging voorin.',
    kansThuis: 52, kansGelijkspel: 28, kansUit: 20,
  },
  'Turkey vs United States': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Turkije (FIFA #22) heeft aanvallend talent maar mist een bewezen spits; de wielen konden al eerder afvallen. De VS (FIFA #16) heeft thuisvoordeel, WK-ervaring en Pulisic als meest bepalende speler. De Amerikanen winnen nipt in dit cruciale groepsduel.',
    sleutelspelerThuis: 'Arda Guler – middenvelder (Real Madrid); Turkije\'s best kans, betrokken bij 44% van goals.',
    sleutelspelerUit: 'Christian Pulisic – aanvaller (Milan); de man voor grote duels, toont zijn klasse op thuisbodem.',
    kansThuis: 30, kansGelijkspel: 28, kansUit: 42,
  },
  'Paraguay vs Australia': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Paraguay (FIFA #40) speelt fysiek en graaft resultaten uit; Enciso is de creatieve uitlaatklep. Australië (FIFA #27) is taaier geworden onder Popovic en heeft gevaarlijk counteraanvalsvoetbal. Beide ploegen hebben vergelijkbare kwaliteit; een gelijkspel is realistisch.',
    sleutelspelerThuis: 'Julio Enciso – aanvaller (Racing Strasbourg); Paraguays flair-speler die kansen creëert vanuit niets.',
    sleutelspelerUit: 'Jackson Irvine – middenvelder (St Pauli); Australische motor die tactische rust brengt.',
    kansThuis: 30, kansGelijkspel: 40, kansUit: 30,
  },

  // ── Groep E ──────────────────────────────────────────────────────────────────
  'Germany vs Curacao': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Duitsland (FIFA #10) heeft een mix van rijzende sterren en betrouwbare krachten; Wirtz is na zijn £100m-transfer naar Liverpool de creatieve motor. Curaçao (FIFA #83), kleinste WK-land ooit, heeft een bezitsgericht stijl maar wordt volledig overspeeld door de Duitse klasse.',
    sleutelspelerThuis: 'Florian Wirtz – middenvelder (Liverpool); creatief genie dat Curaçao simpelweg niet kan stoppen.',
    sleutelspelerUit: 'Leandro Bacuna – middenvelder (Igdir); meest gecapte Curaçaose speler die de ploeg bijeenhoudt.',
    kansThuis: 93, kansGelijkspel: 5, kansUit: 2,
  },
  'Ivory Coast vs Ecuador': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Ivoorkust (FIFA #34) heeft een solide verdediging die in kwalificatie niet scoorde en aanvallend talent via Pépé. Ecuador (FIFA #24) concedeerde slechts vijf goals in 18 kwalificatieduels en Caicedo dicteert het middenveld. Een gelijkspel doet recht aan dit evenwichtige duel.',
    sleutelspelerThuis: 'Nicolas Pépé – aanvaller (Villareal); Ivoriaanse dribbelaar met ervaring op hoogste niveau.',
    sleutelspelerUit: 'Moisés Caicedo – middenvelder (Chelsea); £115m-transfer die het spel controleert en pressing leidt.',
    kansThuis: 33, kansGelijkspel: 38, kansUit: 29,
  },
  'Germany vs Ivory Coast': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Duitsland (FIFA #10) heeft met Wirtz en een blend van talent en routine genoeg klasse, maar is niet vintage. Ivoorkust (FIFA #34) heeft een rijkdom aan aanvalend talent en een gelouterde defensie. Duitsland wint nipt maar Pépé\'s dreiging zorgt voor spanning.',
    sleutelspelerThuis: 'Florian Wirtz – middenvelder (Liverpool); ongrijpbaar in kleine ruimtes, Duitslands creatief brein.',
    sleutelspelerUit: 'Nicolas Pépé – aanvaller (Villareal); gevaarlijke dribbelaar die Duitsland onder druk zet.',
    kansThuis: 58, kansGelijkspel: 25, kansUit: 17,
  },
  'Ecuador vs Curacao': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Ecuador (FIFA #24) heeft onder Beccacece een Bielsa-achtige pressing-mentaliteit met slechts vijf tegengoals in kwalificatie. Curaçao (FIFA #83) heeft een bezitsgerichte stijl die Advocaat nu moet aanpassen. Ecuador\'s defensieve solidideit en Caicedo\'s klasse zijn beslissend.',
    sleutelspelerThuis: 'Moisés Caicedo – middenvelder (Chelsea); £115m-speler die het middenveld dicteert met pressing.',
    sleutelspelerUit: 'Leandro Bacuna – middenvelder (Igdir); Curaçao\'s motor die zo lang mogelijk tegenwicht biedt.',
    kansThuis: 82, kansGelijkspel: 12, kansUit: 6,
  },
  'Curacao vs Ivory Coast': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Curaçao (FIFA #83) is de kleinste WK-deelnemer ooit en heeft zijn bezitsgerichte stijl moeten aanpassen. Ivoorkust (FIFA #34) heeft een gelouterde defensie en rijkdom aan aanvallend talent. De kwaliteitskloof is te groot voor Curaçao om te overbruggen.',
    sleutelspelerThuis: 'Leandro Bacuna – middenvelder (Igdir); meest gecapte Curaçaoaan die maximaal kan geven.',
    sleutelspelerUit: 'Nicolas Pépé – aanvaller (Villareal); zijn "laatste kans op een WK" en hij zal alles geven.',
    kansThuis: 12, kansGelijkspel: 20, kansUit: 68,
  },
  'Ecuador vs Germany': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Ecuador (FIFA #24) heeft een ijzersterke defensie met Pacho en Hincapié maar worstelt met scoren. Duitsland (FIFA #10) heeft inconsistente resultaten maar heeft klasse genoeg met Wirtz. Ecuador kan pijn doen via Caicedo, maar Wirtz\'s creativiteit geeft Duitsland het voordeel.',
    sleutelspelerThuis: 'Moisés Caicedo – middenvelder (Chelsea); probeert Duitslands middenveld te ontregelen en te bestelen.',
    sleutelspelerUit: 'Florian Wirtz – middenvelder (Liverpool); creatief genie dat Ecuador\'s defensie uit evenwicht brengt.',
    kansThuis: 22, kansGelijkspel: 27, kansUit: 51,
  },

  // ── Groep F ──────────────────────────────────────────────────────────────────
  'Netherlands vs Japan': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Nederland (FIFA #8) heeft Van Dijk als indrukwekkende aanvoerder achterin en scoorde 27 goals ongeslagen in kwalificatie. Japan (FIFA #18) is een bewezen WK-verrassing met Kubo als uitblinker, maar heeft blessure van Mitoma. Oranje wint nipt maar heeft alertheid nodig.',
    sleutelspelerThuis: 'Virgil van Dijk – verdediger (Liverpool); Europees voetballer 2019, aanvoerder en rots achterin.',
    sleutelspelerUit: 'Takefusa Kubo – aanvaller (Real Sociedad); "Japanse Messi" met explosieve dribbels en beslissende passes.',
    kansThuis: 53, kansGelijkspel: 27, kansUit: 20,
  },
  'Sweden vs Tunisia': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Zweden (FIFA #38) heeft Potter en elite-spitsen Isak en Gyökeres, maar Isak begon slecht bij Liverpool. Tunesië (FIFA #46) concedeerde geen enkel goal in kwalificatie en speelt tactisch flexibel met Mejbri als creatieve ster. Een gelijkspel doet recht aan de verhoudingen.',
    sleutelspelerThuis: 'Alexander Isak – aanvaller (Liverpool); duurste speler ooit in de Premier League; Zweden\'s geheime wapen.',
    sleutelspelerUit: 'Hannibal Mejbri – middenvelder (Burnley); Tunesies grote ster die het creatieve spel dicteert.',
    kansThuis: 38, kansGelijkspel: 38, kansUit: 24,
  },
  'Netherlands vs Sweden': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Nederland (FIFA #8) heeft een uitstekende achterlinie rond Van Dijk en scoorde 27 goals ongeslagen in kwalificatie. Zweden (FIFA #38) heeft aanvalskwaliteit maar Potter had weinig tijd en Isak had een slopend eerste seizoen bij Liverpool. Oranje is de klare favoriet.',
    sleutelspelerThuis: 'Virgil van Dijk – verdediger (Liverpool); aanvoerder die Nederland stabiliteit en richtinggevoel biedt.',
    sleutelspelerUit: 'Alexander Isak – aanvaller (Liverpool); Zweden\'s beste kans; zijn snelheid kan Oranje verrassen.',
    kansThuis: 60, kansGelijkspel: 25, kansUit: 15,
  },
  'Tunisia vs Japan': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Tunesië (FIFA #46) is verdedigend compact maar Mejbri mist vrijheid in een moeilijke groep. Japan (FIFA #18) speelt als hecht collectief met pressing en heeft squad-diepte om een diepe WK-run te maken. Japanse organisatie en Kubo\'s creativiteit geven de doorslag.',
    sleutelspelerThuis: 'Hannibal Mejbri – middenvelder (Burnley); creatieve ster die Tunesië iets gevaarlijker maakt.',
    sleutelspelerUit: 'Takefusa Kubo – aanvaller (Real Sociedad); drijfveer en aanjager van het Japanse aanvalsspel.',
    kansThuis: 28, kansGelijkspel: 32, kansUit: 40,
  },
  'Japan vs Sweden': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Japan (FIFA #18) is als hecht collectief technisch sterk en heeft genoeg diepte voor een diepere WK-run. Zweden (FIFA #38) heeft met Isak de beste man op het veld maar Potter had pas kort het roer. Japans pressing en Kubo\'s flair bezorgen Zweden problemen.',
    sleutelspelerThuis: 'Takefusa Kubo – aanvaller (Real Sociedad); dribbelt, creëert en scoort; Japans sterspeler.',
    sleutelspelerUit: 'Alexander Isak – aanvaller (Liverpool); gevaarlijkste Zweed die ondanks blessure zijn stempel drukt.',
    kansThuis: 42, kansGelijkspel: 30, kansUit: 28,
  },
  'Tunisia vs Netherlands': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Tunesië (FIFA #46) speelt compact en scoorde niet tegen in kwalificatie, maar Mejbri mist vrijheid in zware duels. Nederland (FIFA #8) heeft een imposante defensie met Van Dijk en scoorde vlot in kwalificatie. Oranje controleert dit duel gecontroleerd.',
    sleutelspelerThuis: 'Hannibal Mejbri – middenvelder (Burnley); meest creatieve Tunesiër, maar staat voor Oranje-klasse.',
    sleutelspelerUit: 'Virgil van Dijk – verdediger (Liverpool); Europees voetballer van het jaar 2019 die achterin regeert.',
    kansThuis: 14, kansGelijkspel: 20, kansUit: 66,
  },

  // ── Groep G ──────────────────────────────────────────────────────────────────
  'Belgium vs Egypt': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'België (FIFA #9) heeft De Bruyne, Doku en Lukaku als aanvallend drieluik, maar de defensie is zwak. Egypte (FIFA #29) bouwt op Salah die vrij speelt na zijn Liverpool-afscheid. Belgische aanvalskracht is echter te veel voor het Egyptische collectief.',
    sleutelspelerThuis: 'Kevin De Bruyne – middenvelder (Napoli); 422 wedstrijden City-legende die het spel dicteert.',
    sleutelspelerUit: 'Mohamed Salah – aanvaller (Liverpool); 65 interlandgoals, speelt vrij na Liverpool-afscheid.',
    kansThuis: 68, kansGelijkspel: 20, kansUit: 12,
  },
  'Iran vs New Zealand': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Iran (FIFA #21) heeft Taremi als topscorer met WK-ervaring en is tactisch flexibel. Nieuw-Zeeland (FIFA #85) heeft Wood als topspits maar hij herstelde pas in april van een knieblessure en de recente resultaten waren wisselvallig. Iran is te sterk.',
    sleutelspelerThuis: 'Mehdi Taremi – spits (Olympiakos); spectaculaire omhaal-scorer, Iran\'s gevierde aanvoerder en ster.',
    sleutelspelerUit: 'Chris Wood – spits (Nottingham Forest); NZ-boegbeeld dat terugkwam van knieblessure.',
    kansThuis: 62, kansGelijkspel: 22, kansUit: 16,
  },
  'Belgium vs Iran': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'België (FIFA #9) heeft met De Bruyne de beste spelmaker en Lukaku als meest dominante spits in de groep. Iran (FIFA #21) is tactisch flexibel maar speelt met logistieke problemen (gebaseerd in Mexico, speelt in de VS). Belgische aanvalskwaliteit is simpelweg te hoog.',
    sleutelspelerThuis: 'Kevin De Bruyne – middenvelder (Napoli); spelmaker van absolute wereldklasse die tempo dicteert.',
    sleutelspelerUit: 'Mehdi Taremi – spits (Olympiakos); Iran\'s gevaarlijkste man maar staat voor titanenklus.',
    kansThuis: 73, kansGelijkspel: 17, kansUit: 10,
  },
  'New Zealand vs Egypt': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Nieuw-Zeeland (FIFA #85) heeft optimisme in de groep maar Wood is herstellende van knieblessure en resultaten waren gemengd. Egypte (FIFA #29) bouwt op Salah als focuspunt en heeft een hechte ploeg. Salah\'s klasse is te veel voor de All Whites.',
    sleutelspelerThuis: 'Chris Wood – spits (Nottingham Forest); NZ-talisman die terugkwam van blessure; vecht voor elk moment.',
    sleutelspelerUit: 'Mohamed Salah – aanvaller (Liverpool); Egypt\'s ster die dit duel eigenhandig beslist.',
    kansThuis: 18, kansGelijkspel: 27, kansUit: 55,
  },
  'Egypt vs Iran': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Egypte (FIFA #29) is verdedigend hecht maar kwetsbaar als Salah wordt dubbel gedekt. Iran (FIFA #21) speelt in 3-6-1 of 4-4-2 afhankelijk van de tegenstander en Taremi is meedogenloos. Beide spitsen zijn van vergelijkbaar niveau; een gelijkspel is het meest logische resultaat.',
    sleutelspelerThuis: 'Mohamed Salah – aanvaller (Liverpool); 277 goal involvements PL-record, alles draait om hem.',
    sleutelspelerUit: 'Mehdi Taremi – spits (Olympiakos); Iran\'s captain en topscorer die Iran overeind houdt.',
    kansThuis: 38, kansGelijkspel: 38, kansUit: 24,
  },
  'New Zealand vs Belgium': {
    homeScore: 0, awayScore: 4,
    match_analyse: 'Nieuw-Zeeland (FIFA #85) is de laagst gerangschikte ploeg van het toernooi met een wisselvallige voorbereiding. België (FIFA #9) heeft De Bruyne, Doku en een zwakke NZ-defensie als prooi. De Rode Duivels bouwen hun doelpuntensaldo op in dit eenzijdig duel.',
    sleutelspelerThuis: 'Chris Wood – spits (Nottingham Forest); All Whites-poster boy die vecht voor zijn land.',
    sleutelspelerUit: 'Kevin De Bruyne – middenvelder (Napoli); City-legende met 422 wedstrijden en 19 trofeeën voor de club.',
    kansThuis: 5, kansGelijkspel: 8, kansUit: 87,
  },

  // ── Groep H ──────────────────────────────────────────────────────────────────
  'Spain vs Cape Verde': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Spanje (FIFA #2) heeft met Yamal en Williams een onstuitbaar aanvallend duo dat niet te verdedigen is. Kaapverdië (FIFA #68) maakt zijn WK-debuut, heeft een gelouterd en compact team maar mist basisverdediger Logan Costa. De technische superioriteit van La Roja is te groot.',
    sleutelspelerThuis: 'Lamine Yamal – aanvaller (Barcelona); 18-jarig fenomeen en Spanje\'s talisman, recordbreker.',
    sleutelspelerUit: 'Dailon Livramento – aanvaller (Casa Pia); scoorde beide kwalificatiedoelpunten die KV naar WK stuurden.',
    kansThuis: 87, kansGelijkspel: 9, kansUit: 4,
  },
  'Saudi Arabia vs Uruguay': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Saudi-Arabië (FIFA #61) heeft maar 7 goals gescoord in 10 kwalificatieduels en heeft een chaotische voorbereiding achter de rug. Uruguay (FIFA #17) drukt hoog onder Bielsa en heeft Valverde als motor. Saudi\'s aanvallende armoede is fataal tegenover Bielsa-bal.',
    sleutelspelerThuis: 'Salem Al-Dawsari – aanvaller (Al-Hilal); Aziatisch speler van het jaar 2025 maar mist recente topvorm.',
    sleutelspelerUit: 'Federico Valverde – middenvelder (Real Madrid); complete motor die alles doet voor Uruguay.',
    kansThuis: 12, kansGelijkspel: 20, kansUit: 68,
  },
  'Spain vs Saudi Arabia': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Spanje (FIFA #2) heeft Yamal, Williams en een hechte ploeg zonder zwakke schakel. Saudi-Arabië (FIFA #61) steunt op defensieve soliditeit maar heeft amper aanvalskracht en een chaotische wissel van coach. De Spaanse korte-passingsstijl overspoelt de Saudiërs volledig.',
    sleutelspelerThuis: 'Lamine Yamal – aanvaller (Barcelona); jongste scorende speler voor Spanje ooit, drijft La Roja vooruit.',
    sleutelspelerUit: 'Salem Al-Dawsari – aanvaller (Al-Hilal); Saoedisch aanspreekpunt, maar de kloof is te groot.',
    kansThuis: 88, kansGelijkspel: 8, kansUit: 4,
  },
  'Uruguay vs Cape Verde': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Uruguay (FIFA #17) perst hoog en heeft Valverde als motor van wereldklasse. Kaapverdië (FIFA #68) debuteert op het WK met een compact en gelouterd team, maar Logan Costa is geblesseerd en de kwaliteitskloof is te groot voor hun aanvallend debuut.',
    sleutelspelerThuis: 'Federico Valverde – middenvelder (Real Madrid); hat-trick tegen Man City in Champions League-vorm.',
    sleutelspelerUit: 'Dailon Livramento – aanvaller (Casa Pia); Kaapverdische debutant die zijn dromen najaagt.',
    kansThuis: 83, kansGelijkspel: 12, kansUit: 5,
  },
  'Cape Verde vs Saudi Arabia': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Kaapverdië (FIFA #68) heeft een gelouterd, hecht team dat al een halve decade samenwerkt en technische aanvallers. Saudi-Arabië (FIFA #61) speelt compact defensief maar scoort amper. Beide landen strijden voor punten in dit direct duel; een gelijkspel is het logische resultaat.',
    sleutelspelerThuis: 'Dailon Livramento – aanvaller (Casa Pia); 7 interlandgoals waarvan 4 cruciaal in kwalificatie.',
    sleutelspelerUit: 'Salem Al-Dawsari – aanvaller (Al-Hilal); KSA\'s beste speler die op een counter-moment loert.',
    kansThuis: 35, kansGelijkspel: 40, kansUit: 25,
  },
  'Uruguay vs Spain': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Het topduel van de groep. Uruguay (FIFA #17) perst hoog met Bielsa en heeft Valverde als wereldklasse-motor, maar Darwin Núñez worstle bij Al-Hilal. Spanje (FIFA #2) heeft Yamal en Williams als onstuitbaar duo; hun technische superioriteit is beslissend maar Uruguay biedt weerstand.',
    sleutelspelerThuis: 'Federico Valverde – middenvelder (Real Madrid); talisman van Uruguay die in grote duels uitblinkt.',
    sleutelspelerUit: 'Lamine Yamal – aanvaller (Barcelona); drijft Spanje naar winst met zijn unieke talent.',
    kansThuis: 30, kansGelijkspel: 28, kansUit: 42,
  },

  // ── Groep I ──────────────────────────────────────────────────────────────────
  'France vs Senegal': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Frankrijk (FIFA #1) heeft Mbappé die 4 goals verwijderd is van Klose\'s WK-record en een bench die de sterkste van het toernooi kan zijn. Senegal (FIFA #14) heeft Mané als gelouterd aanvoerder en een flexibele tactische aanpak, maar het collectieve verschil is te groot.',
    sleutelspelerThuis: 'Kylian Mbappé – aanvaller (Real Madrid); 86 goals in 103 wedstrijden voor Real, WK-topscorer 2022.',
    sleutelspelerUit: 'Sadio Mané – aanvaller (Al-Nassr); tweevoudig Afrikaans speler van het jaar en Senegalees icoon.',
    kansThuis: 65, kansGelijkspel: 22, kansUit: 13,
  },
  'Iraq vs Norway': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Irak (FIFA #57) speelde 21 kwalificatieduels en heeft niets te verliezen, maar scoort moeilijk. Noorwegen (FIFA #31) heeft Haaland die zijn land\'s alltime topscorer werd voor zijn 25e; de Noren scoorden bijna vijf goals per kwalificatieduel. Haaland is te veel voor Irak.',
    sleutelspelerThuis: 'Aymen Hussein – spits (Al-Karma); bijzonder verhaal, scoorde het kwalificatiedoelpunt maar mist kansen.',
    sleutelspelerUit: 'Erling Haaland – spits (Man City); 57 CL-goals in 58 wedstrijden; Noorwegens ultieme wapen.',
    kansThuis: 18, kansGelijkspel: 22, kansUit: 60,
  },
  'France vs Iraq': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Frankrijk (FIFA #1) heeft een aanvallend kwartet dat de beste van het toernooi is en een sterke reservebank. Irak (FIFA #57) heeft niets te verliezen maar scoort amper en mist WK-kaliber individueel. Mbappé en co. bouwen het doelpuntensaldo op in dit eenzijdig duel.',
    sleutelspelerThuis: 'Kylian Mbappé – aanvaller (Real Madrid); recordjager die dit WK de geschiedenisboeken in wil.',
    sleutelspelerUit: 'Aymen Hussein – spits (Al-Karma); groeide op in conflict en vecht tot het einde voor Irak.',
    kansThuis: 92, kansGelijkspel: 6, kansUit: 2,
  },
  'Norway vs Senegal': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Noorwegen (FIFA #31) heeft Haaland als wapen en scoorde bijna vijf goals per kwalificatieduel. Senegal (FIFA #14) heeft een frisse frontlinie, flexibele tactiek en Mané die hen aanvoert. Twee goed geconstrueerde ploegen die een punt verdienen.',
    sleutelspelerThuis: 'Erling Haaland – spits (Man City); drie PL golden boots; wil zijn kans op groot toneel grijpen.',
    sleutelspelerUit: 'Sadio Mané – aanvaller (Al-Nassr); twee keer Afrikaans POY, leider die Senegal naar hogere sferen tilt.',
    kansThuis: 33, kansGelijkspel: 37, kansUit: 30,
  },
  'Norway vs France': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Noorwegen (FIFA #31) heeft Haaland maar Deschamps\' conservatisme zorgt er net voor dat Frankrijk (FIFA #1) effectief en niet overmoedig speelt. Haaland kan gevaarlijk zijn, maar het Franse collectief — aanval tot reservebank — is een klasse hoger dan Noorwegen.',
    sleutelspelerThuis: 'Erling Haaland – spits (Man City); grote ster die alles geeft maar staat voor een superieur collectief.',
    sleutelspelerUit: 'Kylian Mbappé – aanvaller (Real Madrid); superster die dit duel met enkele acties beslist.',
    kansThuis: 18, kansGelijkspel: 22, kansUit: 60,
  },
  'Senegal vs Iraq': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Senegal (FIFA #14) heeft een verse frontlinie en Mané als gelouterde aanvoerder. Irak (FIFA #57) mist scorend vermogen en staat voor drie zware defensies in de groep. Senegalese snelheid en klasse zijn te veel voor het taai maar beperkte Iraakse collectief.',
    sleutelspelerThuis: 'Sadio Mané – aanvaller (Al-Nassr); bouwde ziekenhuizen thuis en draagt Senegal op zijn schouders.',
    sleutelspelerUit: 'Aymen Hussein – spits (Al-Karma); 33 interlandgoals, maar zijn ploeg mist diepgang naast hem.',
    kansThuis: 68, kansGelijkspel: 20, kansUit: 12,
  },

  // ── Groep J ──────────────────────────────────────────────────────────────────
  'Argentina vs Algeria': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Argentinië (FIFA #3) heeft bijna de volledige 2022-kampioensselectie intact, maar sommige spelers arriveren niet in piekconditie. Algerije (FIFA #28) heeft technisch talent en Mahrez als sterspeler, maar de Afcon-kwartfinaleinstorting toont pressure-problemen. Messi\'s klasse is te groot.',
    sleutelspelerThuis: 'Lionel Messi – aanvaller (Inter Miami); 39 jaar, geniet van zijn "last dance" en jaagt op WK-records.',
    sleutelspelerUit: 'Riyad Mahrez – aanvaller (Al-Ahli); 35-jarige met vijf PL-titels op zoek naar zijn WK-moment.',
    kansThuis: 82, kansGelijkspel: 12, kansUit: 6,
  },
  'Austria vs Jordan': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Oostenrijk (FIFA #23) is onder Rangnick stabiel en speelt Gegenpressing met Laimer als ideale leerling. Jordanië (FIFA #63) mist geblesseerde spits Yazan Al-Naimat en heeft weinig groot-toernooiervaring. Oostenrijkse tactische stabiliteit en hoge pressing zijn te veel.',
    sleutelspelerThuis: 'Konrad Laimer – middenvelder (Bayern Munich); fysiek, onaangenaam en perfecte Rangnick-pressing speler.',
    sleutelspelerUit: 'Mousa Al-Tamari – aanvaller (Jordan); snelle vleugelspeler die via counter verrassend gevaarlijk is.',
    kansThuis: 62, kansGelijkspel: 23, kansUit: 15,
  },
  'Argentina vs Austria': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Argentinië (FIFA #3) heeft bijna al zijn 2022-kampioenen intact met Messi als spelmaker. Oostenrijk (FIFA #23) speelt stabiel Gegenpressing maar verliest vorm als de structuur verstoord wordt. Argentijnse klasse en Messi\'s invloed zijn te veel voor Rangnick\'s systeem.',
    sleutelspelerThuis: 'Lionel Messi – aanvaller (Inter Miami); aanvoerder en spelmaker die elk duel naar zijn hand zet.',
    sleutelspelerUit: 'Konrad Laimer – middenvelder (Bayern Munich); Oostenrijkse motor die zo lang mogelijk weerstand biedt.',
    kansThuis: 72, kansGelijkspel: 18, kansUit: 10,
  },
  'Jordan vs Algeria': {
    homeScore: 0, awayScore: 1,
    match_analyse: 'Jordanië (FIFA #63) heeft hun sterspits Al-Naimat niet en mist groot-toernooiervaring. Algerije (FIFA #28) heeft technisch talent en Mahrez als 35-jarige doorgewinterde winnaar. Algerije wint nipt maar hun Afcon-kwartfinaleinstorting zaait twijfel over presteren onder druk.',
    sleutelspelerThuis: 'Mousa Al-Tamari – aanvaller (Jordan); snelheid op de vleugel is Jordanië\'s beste counter-wapen.',
    sleutelspelerUit: 'Riyad Mahrez – aanvaller (Al-Ahli); 35-jaar, bepaalt Algerije in dit WK-moment van zijn carrière.',
    kansThuis: 25, kansGelijkspel: 35, kansUit: 40,
  },
  'Algeria vs Austria': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Algerije (FIFA #28) heeft technisch talent en Mahrez die zijn WK-reputatie wil rechtzetten na 2014. Oostenrijk (FIFA #23) is tactisch stabiel met Rangnick maar mist geblesseerde Baumgartner als creatieve oplossing. Twee gelijkwaardige ploegen die een punt verdienen.',
    sleutelspelerThuis: 'Riyad Mahrez – aanvaller (Al-Ahli); wil Algerije dragen en eindelijk zijn WK-stempel drukken.',
    sleutelspelerUit: 'Konrad Laimer – middenvelder (Bayern Munich); Oostenrijks voetballer v/h jaar 2025, onvermoeibaar.',
    kansThuis: 30, kansGelijkspel: 38, kansUit: 32,
  },
  'Jordan vs Argentina': {
    homeScore: 0, awayScore: 3,
    match_analyse: 'Jordanië (FIFA #63) mist hun sterspits en heeft amper groot-toernooiervaring. Argentinië (FIFA #3) heeft de volledige 2022-kampioensploeg en Messi die in zijn laatste WK de geschiedenisboeken in wil. Dit duel is geen echte wedstrijd op papier.',
    sleutelspelerThuis: 'Mousa Al-Tamari – aanvaller (Jordan); snel en gevaarlijk, Jordanië\'s beste kans op een moment.',
    sleutelspelerUit: 'Lionel Messi – aanvaller (Inter Miami); 39-jaar, geniet van zijn last dance en domineert dit duel.',
    kansThuis: 5, kansGelijkspel: 8, kansUit: 87,
  },

  // ── Groep K ──────────────────────────────────────────────────────────────────
  'Portugal vs DR Congo': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Portugal (FIFA #5) heeft Ronaldo als icoon, een gevestigde kern en een collectieve missie na Diogo Jota\'s tragisch overlijden. DR Congo (FIFA #45) is veerkrachtig en moeilijk te breken maar creëert weinig open spel. Portugees aanvalsgeweld is te groot voor Congolees verzet.',
    sleutelspelerThuis: 'Cristiano Ronaldo – aanvaller (Al-Nassr); 41 jaar, nadert zijn 1000e goal en zijn zesde WK.',
    sleutelspelerUit: 'Yoane Wissa – aanvaller (Newcastle); eerste DR Congo-speler met 10+ PL-goals per seizoen bij Brentford.',
    kansThuis: 83, kansGelijkspel: 11, kansUit: 6,
  },
  'Uzbekistan vs Colombia': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Oezbekistan (FIFA #50) debuteert historisch met Cannavaro als coach en een sterke defensie, maar scoort weinig. Colombia (FIFA #13) heeft Díaz en scoorde meer dan bijna alle Conmebol-landen in kwalificatie. Colombiaans offensief is te sterk voor Oezbeekse defensie.',
    sleutelspelerThuis: 'Abdukodir Khusanov – verdediger (Man City); eerste Oezbeek in PL, ankert de defensie.',
    sleutelspelerUit: 'Luis Díaz – aanvaller (Bayern Munich); razendsnel op de vleugel, Colombia\'s gevaarlijkste man.',
    kansThuis: 14, kansGelijkspel: 21, kansUit: 65,
  },
  'Portugal vs Uzbekistan': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Portugal (FIFA #5) heeft een gevestigde veelzijdige kern en Ronaldo als boegbeeld. Oezbekistan (FIFA #50) heeft een sterke defensie (7 goals tegen in kwalificatie) maar kan weinig aanvallen. Portugees aanvalsgenie en Ronaldo\'s honger zijn te veel voor het debuterende Oezbekistan.',
    sleutelspelerThuis: 'Cristiano Ronaldo – aanvaller (Al-Nassr); record-jagende captain die elk WK-moment aangrijpt.',
    sleutelspelerUit: 'Abdukodir Khusanov – verdediger (Man City); Oezbeekse rots achterin tegenover Portugese aanvalsgolf.',
    kansThuis: 83, kansGelijkspel: 12, kansUit: 5,
  },
  'Colombia vs DR Congo': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Colombia (FIFA #13) heeft scorend vermogen via Díaz en een ploeg die Brazilië en Argentinië versloeg in kwalificatie. DR Congo (FIFA #45) is mentaal taai en moeilijk te breken maar creëert weinig kansen open. Colombiaanse kwaliteitsdiepte is doorslaggevend.',
    sleutelspelerThuis: 'Luis Díaz – aanvaller (Bayern Munich); zijn vader werd ontvoerd in 2023; zijn motivatie is ongeëvenaard.',
    sleutelspelerUit: 'Yoane Wissa – aanvaller (Newcastle); "Kovo" draagt Congo\'s hoop op zijn schouders.',
    kansThuis: 72, kansGelijkspel: 18, kansUit: 10,
  },
  'Colombia vs Portugal': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Het topduel van de groep. Colombia (FIFA #13) heeft inconsistentie als achilleshiel maar versloeg topploegen in kwalificatie. Portugal (FIFA #5) heeft Ronaldo die in grote duels uitblinkt en een gevestigde kern. Portugal wint nipt maar Colombia biedt serieuze weerstand.',
    sleutelspelerThuis: 'Luis Díaz – aanvaller (Bayern Munich); Colombia\'s beste wapen, snel en gevaarlijk op de vleugel.',
    sleutelspelerUit: 'Cristiano Ronaldo – aanvaller (Al-Nassr); grote duels zijn zijn specialiteit, op zijn 41e nog bepalend.',
    kansThuis: 30, kansGelijkspel: 28, kansUit: 42,
  },
  'DR Congo vs Uzbekistan': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'DR Congo (FIFA #45) is veerkrachtig en moeilijk te breken; hun kwalificatie was gebouwd op mentale taaiheid. Oezbekistan (FIFA #50) heeft een sterke defensie en Khusanov als anker. Beide ploegen creëren weinig kansen; een gelijkspel is het logische resultaat.',
    sleutelspelerThuis: 'Yoane Wissa – aanvaller (Newcastle); gevaarlijk en gedreven, DR Congo\'s meest kwalitatieve aanvaller.',
    sleutelspelerUit: 'Abdukodir Khusanov – verdediger (Man City); Oezbeekse defensieve rots op zijn eerste WK.',
    kansThuis: 30, kansGelijkspel: 38, kansUit: 32,
  },

  // ── Groep L ──────────────────────────────────────────────────────────────────
  'England vs Croatia': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Engeland (FIFA #4) heeft Kane, Rice en een enorm aanvalspallet. Kroatië (FIFA #11) heeft Modric als geniale motor op zijn 40e maar de gouden generatie is op leeftijd. Engeland wint comfortabel maar de vraag is hoe Tuchel zijn puzzelstukken combineert.',
    sleutelspelerThuis: 'Harry Kane – spits (Bayern Munich); overtrof Pelé\'s interlandscore, beleefde zijn eerste trofee dit jaar.',
    sleutelspelerUit: 'Luka Modric – middenvelder (Milan); 40 jaar, nadert 200 caps; nog steeds de motor van Kroatië.',
    kansThuis: 65, kansGelijkspel: 22, kansUit: 13,
  },
  'Ghana vs Panama': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Ghana (FIFA #73) heeft set-piece-kracht en Semenyo als een van de meest in-form aanvallers in Europees voetbal. Panama (FIFA #33) heeft een oud en hecht team maar kampt met ouderdom bij sleutelspelers. Ghana\'s aanvallende kwaliteit geeft de doorslag.',
    sleutelspelerThuis: 'Antoine Semenyo – aanvaller (Man City); van afwijzingen door Arsenal tot £64m-transfer; beslist dit duel.',
    sleutelspelerUit: 'Michael Murillo – verdediger (Panama); ervaren speler in een oud team dat maximaal wil geven.',
    kansThuis: 50, kansGelijkspel: 28, kansUit: 22,
  },
  'England vs Ghana': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Engeland (FIFA #4) heeft Kane en Rice als wereld-klasse spelers en een breed aanvalspallet. Ghana (FIFA #73) heeft aanvalskwaliteit maar mist elite-verdedigers en ervaren keepers. Engeland controleert dit duel comfortabel met Kane als doelpuntenmachine.',
    sleutelspelerThuis: 'Harry Kane – spits (Bayern Munich); 34e Bundesliga-titel dit jaar, de man voor grote momenten.',
    sleutelspelerUit: 'Antoine Semenyo – aanvaller (Man City); Ghana\'s beste kans; snelheid en durf zijn zijn troeven.',
    kansThuis: 76, kansGelijkspel: 16, kansUit: 8,
  },
  'Panama vs Croatia': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Panama (FIFA #33) heeft een hecht team dat lang samenwerkt maar sleutelspelers zijn boven de 30. Kroatië (FIFA #11) heeft Modric als geniaal spelmaker en WK-halffinale-ervaring uit 2018 en 2022. Kroatische routine en Modric\'s klasse geven de doorslag.',
    sleutelspelerThuis: 'Michael Murillo – verdediger (Panama); rechtsback die Panama zo lang mogelijk overeind houdt.',
    sleutelspelerUit: 'Luka Modric – middenvelder (Milan); "de motor van dit team" volgens Dalic; beslist op groot toneel.',
    kansThuis: 14, kansGelijkspel: 22, kansUit: 64,
  },
  'Panama vs England': {
    homeScore: 0, awayScore: 3,
    match_analyse: 'Panama (FIFA #33) kan hard en fysiek spelen maar is te beperkt voor Engeland. Engeland (FIFA #4) heeft Kane, Rice en een diep aanvalspallet onder Tuchel. Zelfs zonder vol gas geven domineert Engeland dit duel volledig.',
    sleutelspelerThuis: 'Michael Murillo – verdediger (Panama); vecht voor elk moment voor zijn land op het WK.',
    sleutelspelerUit: 'Harry Kane – spits (Bayern Munich); scoort altijd in eenvoudige duels; maakt het verschil.',
    kansThuis: 7, kansGelijkspel: 12, kansUit: 81,
  },
  'Croatia vs Ghana': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Kroatië (FIFA #11) heeft Modric\'s genie en WK-ervaring die het verschil maken in directe duels. Ghana (FIFA #73) heeft Semenyo en set-piece-kracht maar mist verdedigende zekerheid. Kroatische ervaring en Modric\'s klasse geven de doorslag in dit directe duel om de tweede plek.',
    sleutelspelerThuis: 'Luka Modric – middenvelder (Milan); zelfgeleerde spelmaker, WK-halffinalist x2, puur genie.',
    sleutelspelerUit: 'Antoine Semenyo – aanvaller (Man City); van Palace-afwijzing tot £64m-transfer; Ghana\'s geheime wapen.',
    kansThuis: 52, kansGelijkspel: 28, kansUit: 20,
  },
}

// ─── Dutch→English name map (from seed.ts) ────────────────────────────────────
const NL_TO_EN: Record<string, string> = {
  'Mexico':             'Mexico',
  'Zuid-Afrika':        'South Africa',
  'Zuid-Korea':         'South Korea',
  'Tsjechië':           'Czech Republic',
  'Canada':             'Canada',
  'Bosnië-Herzegovina': 'Bosnia',
  'Qatar':              'Qatar',
  'Zwitserland':        'Switzerland',
  'Brazilië':           'Brazil',
  'Marokko':            'Morocco',
  'Haïti':              'Haiti',
  'Schotland':          'Scotland',
  'Verenigde Staten':   'United States',
  'Paraguay':           'Paraguay',
  'Australië':          'Australia',
  'Turkije':            'Turkey',
  'Duitsland':          'Germany',
  'Curaçao':            'Curacao',
  'Ivoorkust':          'Ivory Coast',
  'Ecuador':            'Ecuador',
  'Nederland':          'Netherlands',
  'Japan':              'Japan',
  'Zweden':             'Sweden',
  'Tunesië':            'Tunisia',
  'België':             'Belgium',
  'Egypte':             'Egypt',
  'Iran':               'Iran',
  'Nieuw-Zeeland':      'New Zealand',
  'Spanje':             'Spain',
  'Kaapverdië':         'Cape Verde',
  'Saudi-Arabië':       'Saudi Arabia',
  'Uruguay':            'Uruguay',
  'Frankrijk':          'France',
  'Senegal':            'Senegal',
  'Irak':               'Iraq',
  'Noorwegen':          'Norway',
  'Argentinië':         'Argentina',
  'Algerije':           'Algeria',
  'Oostenrijk':         'Austria',
  'Jordanië':           'Jordan',
  'Portugal':           'Portugal',
  'DR Congo':           'DR Congo',
  'Oezbekistan':        'Uzbekistan',
  'Colombia':           'Colombia',
  'Engeland':           'England',
  'Kroatië':            'Croatia',
  'Ghana':              'Ghana',
  'Panama':             'Panama',
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seedAiPredictions() {
  console.log('⚡ AI voorspellingen seeden...\n')

  // Fetch all group matches with team names
  const { data: matches, error } = await supabase
    .from('matches')
    .select(`
      id,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq('stage', 'group')

  if (error || !matches) {
    console.error('Fout bij ophalen wedstrijden:', error?.message)
    process.exit(1)
  }

  console.log(`  Gevonden: ${matches.length} groepswedstrijden\n`)

  let inserted = 0
  let skipped = 0
  let missing = 0

  for (const m of matches) {
    const homeNl = (m.home_team as unknown as { name: string } | null)?.name ?? ''
    const awayNl = (m.away_team as unknown as { name: string } | null)?.name ?? ''
    const homeEn = NL_TO_EN[homeNl] ?? homeNl
    const awayEn = NL_TO_EN[awayNl] ?? awayNl
    const key = `${homeEn} vs ${awayEn}`

    const pred = PREDICTIONS[key]
    if (!pred) {
      console.warn(`  ⚠  Geen voorspelling voor: ${key}`)
      missing++
      continue
    }

    const { error: upsertError } = await supabase
      .from('match_ai_predictions' as 'matches') // type cast workaround
      .upsert({
        match_id:            m.id,
        home_score:          pred.homeScore,
        away_score:          pred.awayScore,
        match_analyse:       pred.match_analyse,
        sleutelspeler_thuis: pred.sleutelspelerThuis,
        sleutelspeler_uit:   pred.sleutelspelerUit,
        kans_thuis:          pred.kansThuis,
        kans_gelijkspel:     pred.kansGelijkspel,
        kans_uit:            pred.kansUit,
      }, { onConflict: 'match_id' })

    if (upsertError) {
      console.error(`  ✗ Fout bij ${key}:`, upsertError.message)
    } else {
      console.log(`  ✓ ${key} (${pred.homeScore}–${pred.awayScore})`)
      inserted++
    }
  }

  console.log(`\n✅ Klaar: ${inserted} ingevoerd, ${skipped} overgeslagen, ${missing} niet gevonden`)
}

seedAiPredictions().catch(console.error)
