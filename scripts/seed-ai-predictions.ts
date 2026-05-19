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
    match_analyse: 'Mexico geniet als gastland een enorm thuisvoordeel in het iconische Azteca-stadion. Zuid-Afrika heeft weinig ervaring op dit niveau en mist de individuele kwaliteit om Mexico te bedreigen. Een vlotte overwinning voor El Tri lijkt onvermijdelijk.',
    sleutelspelerThuis: 'Hirving Lozano – explosieve buitenspeler die de ZA-defensie bij elke aanval in problemen brengt.',
    sleutelspelerUit: 'Percy Tau – creatieve aanvaller die met snelheid onverwachte momenten kan creëren.',
    kansThuis: 66, kansGelijkspel: 20, kansUit: 14,
  },
  'South Korea vs Czech Republic': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Zuid-Korea en Tsjechië zijn aan elkaar gewaagd; beide ploegen scoren doorgaans met regelmaat maar defensief zijn ze ook kwetsbaar. Son Heung-min is het gevaarlijkste wapen, maar Tsjechië heeft met Schick evenveel kwaliteit voorin. Een gelijkspel is het meest logische resultaat.',
    sleutelspelerThuis: 'Son Heung-min – aanvoerder en topscorer met Tottenham-klasse die het verschil kan maken.',
    sleutelspelerUit: 'Tomáš Souček – kolossale middenvelder met enorm doelgevaar vanuit de tweede linie.',
    kansThuis: 40, kansGelijkspel: 35, kansUit: 25,
  },
  'Czech Republic vs South Africa': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Tsjechië heeft op alle linies een duidelijk hogere kwaliteit dan Zuid-Afrika. De Tsjechen moeten hier vol voor de drie punten gaan om groepswinst te kunnen pakken. Zuid-Afrika ontbreekt het aan aanvalskracht om Tsjechische doelman te bedreigen.',
    sleutelspelerThuis: 'Patrik Schick – trefzekere spits die bij elke gelegenheid gevaarlijk is voor de goal.',
    sleutelspelerUit: 'Bongani Zungu – verdedigende middenvelder die ZA zo lang mogelijk bij elkaar houdt.',
    kansThuis: 62, kansGelijkspel: 22, kansUit: 16,
  },
  'Mexico vs South Korea': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Mexico heeft het thuisvoordeel maar Zuid-Korea is met Son Heung-min gevaarlijk. Beide ploegen hebben punten nodig om door te gaan, wat een aanvallend en open duel belooft. Een gelijkspel helpt beide ploegen afhankelijk van de andere resultaten.',
    sleutelspelerThuis: 'Raúl Jiménez – ervaren spits die Mexico de lead kan geven wanneer het erop aankomt.',
    sleutelspelerUit: 'Son Heung-min – Premier League-sterspeler die op elk moment kan beslissen.',
    kansThuis: 40, kansGelijkspel: 35, kansUit: 25,
  },
  'Czech Republic vs Mexico': {
    homeScore: 0, awayScore: 1,
    match_analyse: 'Mexico heeft in de ranking een streepje voor en zal in dit cruciale groepsduel vol voor de winst gaan. Tsjechië speelt gedisciplineerd maar mist de explosiviteit van Mexico. Een nipte Mexicaanse zege is de meest waarschijnlijke uitkomst.',
    sleutelspelerThuis: 'Tomáš Souček – zal proberen het Mexicaanse spel te ontregelen vanuit het middenveld.',
    sleutelspelerUit: 'Hirving Lozano – snelheid en techniek die Tsjechische verdedigers pijn doen.',
    kansThuis: 28, kansGelijkspel: 32, kansUit: 40,
  },
  'South Africa vs South Korea': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Zuid-Korea is duidelijk de betere ploeg en heeft kwaliteit in alle linies om Zuid-Afrika te overspelen. ZA heeft zelden gescoord op grote toernooien en Son Heung-min c.s. zullen dit duel domineren. Een comfortabele ZK-overwinning lijkt onvermijdelijk.',
    sleutelspelerThuis: 'Percy Tau – meest creatieve speler van ZA die iets kan proberen te forceren.',
    sleutelspelerUit: 'Son Heung-min – verwacht meerdere bijdragen, van assist tot doelpunt.',
    kansThuis: 18, kansGelijkspel: 28, kansUit: 54,
  },

  // ── Groep B ──────────────────────────────────────────────────────────────────
  'Canada vs Bosnia': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Canada speelt voor eigen publiek en heeft met Alphonso Davies een absolute wereldklasse-speler op de linksback. Bosnië is niet te onderschatten dankzij de ervaring van Džeko, maar Canada\'s thuisvoordeel en snelheid geven de doorslag.',
    sleutelspelerThuis: 'Alphonso Davies – een van de snelste spelers ter wereld die elke aanval langs de flanken gevaarlijk maakt.',
    sleutelspelerUit: 'Edin Džeko – veteraan-spits die altijd gevaarlijk is binnen de zestien meter.',
    kansThuis: 52, kansGelijkspel: 25, kansUit: 23,
  },
  'Qatar vs Switzerland': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Qatar kwalificeerde zich als gastland en mist de nodige internationale kwaliteit om Zwitserland te bedreigen. De Zwitsers zijn compact, snel en technisch sterk — exact de eigenschappen waartegen Qatar het zwaar krijgt. Een comfortabele Zwitserse zege ligt in de lijn der verwachting.',
    sleutelspelerThuis: 'Almoez Ali – topscorer van Qatar die iets kan proberen te forceren in de zestien.',
    sleutelspelerUit: 'Granit Xhaka – aanvoerder en spelmaker die Qatar onder druk zet.',
    kansThuis: 15, kansGelijkspel: 20, kansUit: 65,
  },
  'Switzerland vs Bosnia': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Zwitserland is als nummer 21 van de wereld een maatje te groot voor Bosnië. De Zwitsers hebben de groepsfase al vaker overleefd en zijn routineuze toernooigangers. Bosnië mist de kwaliteitsdiepte om een volwaardig antwoord te bieden.',
    sleutelspelerThuis: 'Xherdan Shaqiri – flamboyante aanvaller met ervaring op de grootste podia.',
    sleutelspelerUit: 'Edin Džeko – veteraan die Bosnië in zijn eentje overeind probeert te houden.',
    kansThuis: 65, kansGelijkspel: 20, kansUit: 15,
  },
  'Canada vs Qatar': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Voor eigen Canadees publiek heeft Qatar amper een antwoord op de snelheid en het enthousiasme van de Rode Esdoorns. Canada wil graag doorstoten en Qatar is de ideale tegenstander om vertrouwen op te doen. Een verdiende Canadese overwinning is de verwachting.',
    sleutelspelerThuis: 'Alphonso Davies – gevaarlijkste speler op het veld met zijn snelheid en techniek.',
    sleutelspelerUit: 'Hassan Al-Haydos – aanvoerder en beste technische speler van Qatar.',
    kansThuis: 66, kansGelijkspel: 20, kansUit: 14,
  },
  'Switzerland vs Canada': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Dit wordt een aantrekkelijk duel tussen twee evenwaardige ploegen die allebei door willen. Zwitserland is behoedzaam en efficiënt; Canada is snel en vol energie. Een gelijkspel is voor beide ploegen een acceptabel resultaat als ze verder zijn.',
    sleutelspelerThuis: 'Granit Xhaka – de onbetwiste leider die Zwitserland in moeilijke momenten overeind houdt.',
    sleutelspelerUit: 'Jonathan David – doelpuntenmachine die Zwitserland verrast kan worden.',
    kansThuis: 42, kansGelijkspel: 35, kansUit: 23,
  },
  'Bosnia vs Qatar': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Beide ploegen strijden om punten maar Bosnië heeft met Džeko een stuk meer kwaliteit voorin. Qatar toonde al op het WK 2022 dat ze mee kunnen, maar het niveauverschil is te groot voor een volledig punt. Bosnië wint nipt.',
    sleutelspelerThuis: 'Edin Džeko – veteraan spits die Bosnië naar de zege leidt.',
    sleutelspelerUit: 'Akram Afif – dribbelkoning van Qatar die voor spanning zorgt.',
    kansThuis: 42, kansGelijkspel: 30, kansUit: 28,
  },

  // ── Groep C ──────────────────────────────────────────────────────────────────
  'Brazil vs Morocco': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Brazilië en Marokko is een topduel van de groepsfase. Brazilië heeft met Vinícius Júnior de gevaarlijkste aanvaller ter wereld, maar Marokko verraste op het WK 2022 door alle verwachtingen te overtreffen. Een spannende wedstrijd met Brazilië als lichte favoriet.',
    sleutelspelerThuis: 'Vinícius Júnior – ongrijpbaar op zijn best, kan een heel team kapotspelen.',
    sleutelspelerUit: 'Achraf Hakimi – een van de beste rechtsbacks ter wereld die aanvallend én verdedigend uitblinkt.',
    kansThuis: 50, kansGelijkspel: 27, kansUit: 23,
  },
  'Haiti vs Scotland': {
    homeScore: 0, awayScore: 3,
    match_analyse: 'Schotland is verre superieur aan Haïti, dat als kleine natie zelden op grote toernooien schittert. Met McTominay als doelpuntenmachine heeft Schotland genoeg kwaliteit om comfortabel te winnen. Haïti hoopt de schade te beperken.',
    sleutelspelerThuis: 'Duckens Nazon – aanvaller die Haïti\'s enige echte dreiging vormt.',
    sleutelspelerUit: 'Scott McTominay – de Schot die zijn doelpuntenrecord voor de nationale ploeg wil aanscherpen.',
    kansThuis: 8, kansGelijkspel: 15, kansUit: 77,
  },
  'Scotland vs Morocco': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Dit wordt een aantrekkelijk potje tussen twee ploegen die vol voor de doorgang gaan. Schotland heeft de energie en McTominay\'s doelgevaar; Marokko heeft de organisatie en Ziyech\'s klasse. Een gelijkspel doet recht aan de verhoudingen.',
    sleutelspelerThuis: 'Scott McTominay – offensieve middenvelder die vanuit de tweede linie scoort.',
    sleutelspelerUit: 'Hakim Ziyech – creatieve spelmaker die op elk moment gevaarlijk is.',
    kansThuis: 35, kansGelijkspel: 35, kansUit: 30,
  },
  'Brazil vs Haiti': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Dit wordt een non-wedstrijd: Brazilië speelt in een compleet andere wereld dan Haïti. De Brazilianen zullen dit gebruiken om fris en zelfverzekerd de groepsfase door te komen. Haïti doet zijn best maar staat voor een onmogelijke opgave.',
    sleutelspelerThuis: 'Vinícius Júnior – zal meerdere kansen creëren en benutten in dit eenvoudige duel.',
    sleutelspelerUit: 'Duckens Nazon – de man die Haïti voor het doel zo dreigend mogelijk moet zijn.',
    kansThuis: 93, kansGelijkspel: 5, kansUit: 2,
  },
  'Scotland vs Brazil': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Schotland geeft alles maar Brazilië is van een hoger niveau. De Brazilianen zullen hun snelheid en techniek gebruiken om door Schotse rijen te breken. McTominay kan voor dreiging zorgen, maar Brazilië controleert dit duel.',
    sleutelspelerThuis: 'Scott McTominay – werkt keihard maar staat voor een schier onmogelijke taak.',
    sleutelspelerUit: 'Rodrygo – gevaarlijk als invaller of basisspeler naast Vinícius.',
    kansThuis: 20, kansGelijkspel: 25, kansUit: 55,
  },
  'Morocco vs Haiti': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Marokko heeft in alle opzichten meer kwaliteit dan Haïti en zal dit benutten voor een grote overwinning. De Marokkanen zijn georganiseerd en sterk in de omschakeling. Haïti kan simpelweg het tempo niet bijhouden.',
    sleutelspelerThuis: 'Youssef En-Nesyri – trefzekere spits die Haïti\'s defensie opslokt.',
    sleutelspelerUit: 'Duckens Nazon – zal zich niet laten kisten maar staat voor een titanenklus.',
    kansThuis: 88, kansGelijkspel: 8, kansUit: 4,
  },

  // ── Groep D ──────────────────────────────────────────────────────────────────
  'United States vs Paraguay': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'De VS speelt voor eigen publiek en wil graag indruk maken. Paraguay is echter een volwaardige tegenstander met gevaarlijke aanvallers. Pulisic en zijn ploeggenoten hebben thuis het voordeel, maar moeten echt hun best doen voor de zege.',
    sleutelspelerThuis: 'Christian Pulisic – aanvoerder en sterspeler die de VS\'s aanval aanstuurt.',
    sleutelspelerUit: 'Miguel Almirón – creatieve middenvelder die de VS-defensie kan verrassen.',
    kansThuis: 55, kansGelijkspel: 25, kansUit: 20,
  },
  'Australia vs Turkey': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Australië en Turkije zijn min of meer gelijkwaardig op papier en zullen allebei voorzichtig beginnen. Arda Güler kan Turkije naar voren brengen, terwijl Australië\'s collectief sterk is. Een gelijkspel weerspiegelt de evenwichtige verhoudingen.',
    sleutelspelerThuis: 'Mat Ryan – doelman die Australië op de been houdt in cruciale momenten.',
    sleutelspelerUit: 'Arda Güler – jonge ster van Real Madrid die Turkije aanstuurt.',
    kansThuis: 32, kansGelijkspel: 35, kansUit: 33,
  },
  'United States vs Australia': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'De VS heeft de thuisvoordeel en de betere individuele kwaliteit in dit duel. Australië speelt compact maar mist de aanvalskracht om de VS te bedreigen. Pulisic zal dit duel naar zijn hand zetten voor een verdiende Amerikaanse overwinning.',
    sleutelspelerThuis: 'Christian Pulisic – aanvoerder die gevaarlijk is met zijn dribbels en schoten.',
    sleutelspelerUit: 'Mitchell Duke – spits die onverwacht voor de verrassing kan zorgen.',
    kansThuis: 60, kansGelijkspel: 22, kansUit: 18,
  },
  'Turkey vs Paraguay': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Turkije is iets beter geplaatst op de FIFA-ranking en heeft in Arda Güler een sterspeler van wereldformaat. Paraguay kan verrassen met hun aanvallende spelers, maar Turkije heeft net iets meer kwaliteit in alle linies.',
    sleutelspelerThuis: 'Arda Güler – jong fenomeen van Real Madrid dat elke wedstrijd kan beslissen.',
    sleutelspelerUit: 'Miguel Almirón – bewegelijke middenvelder die overal opduikt.',
    kansThuis: 52, kansGelijkspel: 28, kansUit: 20,
  },
  'Turkey vs United States': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Dit wordt een spannend duel waarbij de VS licht favoriet is. Turkije zal vol voor de winst gaan na eerdere resultaten, maar de VS heeft de kwaliteit om dit te beantwoorden. Pulisic\'s klasse geeft de Amerikanen net dat extra voordeel.',
    sleutelspelerThuis: 'Arda Güler – zal alles geven in dit cruciale duel voor Turkije.',
    sleutelspelerUit: 'Christian Pulisic – topervaren speler in grote duels voor de nationale ploeg.',
    kansThuis: 30, kansGelijkspel: 28, kansUit: 42,
  },
  'Paraguay vs Australia': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Een gelijkopgaand duel tussen twee ploegen die punten hard nodig hebben. Beide landen hebben vergelijkbare kwaliteit en zullen tactisch voorzichtig beginnen. Een gelijkspel lijkt voor beide partijen een acceptabel eindresultaat.',
    sleutelspelerThuis: 'Julio Enciso – jonge aanvaller die Paraguay met zijn snelheid kan aansturen.',
    sleutelspelerUit: 'Mathew Leckie – veteraan rechtsbuiten die altijd aanwezig is op de grote momenten.',
    kansThuis: 30, kansGelijkspel: 40, kansUit: 30,
  },

  // ── Groep E ──────────────────────────────────────────────────────────────────
  'Germany vs Curacao': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Dit is geen wedstrijd op papier: Duitsland hoort bij de wereldtop en Curaçao is een kleine eilandnatie. De Duitsers zullen dit gebruiken om ritme te vinden en doelpuntensaldo op te bouwen. Curaçao hoopt de schade te beperken.',
    sleutelspelerThuis: 'Florian Wirtz – dribbelende spelmaker die Curaçao simpelweg niet kan stoppen.',
    sleutelspelerUit: 'Cuco Martina – ervaren aanvoerder die zijn ploeg bij elkaar houdt.',
    kansThuis: 93, kansGelijkspel: 5, kansUit: 2,
  },
  'Ivory Coast vs Ecuador': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Twee gelijkwaardige ploegen die allebei durven te voetballen. Ecuador heeft met Caicedo een sleutelspeler in het middenveld, terwijl Ivoorkust offensieve kwaliteit heeft met Haller. Een gelijkspel is het meest logische resultaat in dit evenwichtige duel.',
    sleutelspelerThuis: 'Sébastien Haller – doelgevaarlijke spits die op ieder moment kan scoren.',
    sleutelspelerUit: 'Moisés Caicedo – sterke middenvelder van Chelsea die het spel controleert.',
    kansThuis: 33, kansGelijkspel: 38, kansUit: 29,
  },
  'Germany vs Ivory Coast': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Duitsland is favoriet maar Ivoorkust is geen makkelijke tegenstander. De Afrikanen hebben technisch vaardige spelers en zijn gevaarlijk in de omschakeling. Duitsland wint nipt dankzij hun superieure organisatie en individuele klasse.',
    sleutelspelerThuis: 'Jamal Musiala – ongrijpbaar in kleine ruimtes, creativiteit ten top.',
    sleutelspelerUit: 'Sébastien Haller – kan altijd scoren en is de grote dreiging voor Duitsland.',
    kansThuis: 58, kansGelijkspel: 25, kansUit: 17,
  },
  'Ecuador vs Curacao': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Ecuador is in alle opzichten beter dan Curaçao en zal dit duidelijk laten zien. Met Valencia voorin en Caicedo op het middenveld heeft Ecuador te veel kwaliteit. Curaçao kan weinig meer doen dan hopen dat de uitslag beperkt blijft.',
    sleutelspelerThuis: 'Enner Valencia – ervaren spits die Ecuador al jaren draagt en groot doelpuntenrecord heeft.',
    sleutelspelerUit: 'Cuco Martina – aanvoerder die Curaçao bij elkaar houdt.',
    kansThuis: 82, kansGelijkspel: 12, kansUit: 6,
  },
  'Curacao vs Ivory Coast': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Ivoorkust heeft te veel kwaliteit voor Curaçao en zal dit duel gecontroleerd winnen. De Ivorianen zijn snel en technisch sterk — precies de eigenschappen waar Curaçao moeite mee heeft. Een overtuigende overwinning voor de Olifanten.',
    sleutelspelerThuis: 'Cuco Martina – meest ervaren speler die Curaçao zo lang mogelijk overeind houdt.',
    sleutelspelerUit: 'Franck Kessié – sterke middenvelder die Ivoorkust dicteert.',
    kansThuis: 12, kansGelijkspel: 20, kansUit: 68,
  },
  'Ecuador vs Germany': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Ecuador geeft Duitsland echt een gevecht en kan hen pijn doen via Caicedo en Valencia. Maar Duitsland heeft de klasse in het middenveld en aanvallend genoeg om dit te winnen. Een spannend duel waarbij Duitsland nipt beter is.',
    sleutelspelerThuis: 'Moisés Caicedo – zal proberen Duitslands middenveld te ontregelen en ze te bestelen.',
    sleutelspelerUit: 'Florian Wirtz – creatief genie dat Ecuador\'s verdediging in de war brengt.',
    kansThuis: 22, kansGelijkspel: 27, kansUit: 51,
  },

  // ── Groep F ──────────────────────────────────────────────────────────────────
  'Netherlands vs Japan': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Nederland is favoriet maar Japan heeft bewezen op WK\'s te kunnen verrassen (2022 won Japan van Duitsland en Spanje). Oranje heeft met Van Dijk en Gakpo voldoende kwaliteit maar moet op hun hoede zijn voor het Japanse collectief.',
    sleutelspelerThuis: 'Virgil van Dijk – de imposante aanvoerder die Nederland stabiliteit geeft achterin.',
    sleutelspelerUit: 'Takefusa Kubo – creatieve aanvaller die Nederland enorm pijn kan doen.',
    kansThuis: 53, kansGelijkspel: 27, kansUit: 20,
  },
  'Sweden vs Tunisia': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Zweden en Tunesië zijn redelijk aan elkaar gewaagd. Gyökeres is momenteel in topvorm bij Sporting, maar Tunesië is verdedigend sterk en moeilijk te spelen. Een gelijkspel doet recht aan het niveau van beide ploegen.',
    sleutelspelerThuis: 'Viktor Gyökeres – doelpuntenmachine die ook op het WK zijn stempel wil drukken.',
    sleutelspelerUit: 'Youssef Msakni – veteraan aanvoerder van Tunesië met vele WK-ervaringen.',
    kansThuis: 38, kansGelijkspel: 38, kansUit: 24,
  },
  'Netherlands vs Sweden': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Nederland is de duidelijke favoriet in dit duel. Oranje heeft meer kwaliteit op elke positie en Zweden zal het lastig krijgen om het te verdedigen. Gakpo en Memphis kunnen het verschil maken in dit directe treffen voor groepswinst.',
    sleutelspelerThuis: 'Cody Gakpo – gevaarlijk in de diepte en doelpuntengericht.',
    sleutelspelerUit: 'Viktor Gyökeres – Zweden\'s beste kans op een doelpunt in dit zware duel.',
    kansThuis: 60, kansGelijkspel: 25, kansUit: 15,
  },
  'Tunisia vs Japan': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Japan is iets beter ingeschat dan Tunesië en heeft laten zien op WK\'s te kunnen presteren. Tunesië is verdedigend sterk maar Japan is goed georganiseerd én heeft aanvallers die verschil kunnen maken. Japan wint dit duel.',
    sleutelspelerThuis: 'Yassine Meriah – centrale verdediger die Tunesië zo lang mogelijk bij elkaar houdt.',
    sleutelspelerUit: 'Ritsu Doan – snel en gevaarlijk, maakt het verschil voor Japan.',
    kansThuis: 28, kansGelijkspel: 32, kansUit: 40,
  },
  'Japan vs Sweden': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Japan en Zweden in een spannend direct duel. Japan is technisch fijn en snel, maar Zweden heeft met Gyökeres de beste speler op het veld. Japan wint nipt dankzij hun betere organisatie en aanvalstransities.',
    sleutelspelerThuis: 'Takehiro Tomiyasu – veelzijdige speler die zowel verdedigend als aanvallend bijdraagt.',
    sleutelspelerUit: 'Viktor Gyökeres – moet voor de goals zorgen en Zweden bij de les houden.',
    kansThuis: 42, kansGelijkspel: 30, kansUit: 28,
  },
  'Tunisia vs Netherlands': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Nederland is hier de overduidelijke favoriet. Tunesië zal compact spelen maar mist de kwaliteit om Oranje echt te bedreigen. Memphis Depay en Gakpo zullen de ruimte vinden om te scoren in een gecontroleerde Nederlandse zege.',
    sleutelspelerThuis: 'Wahbi Khazri – ervaren aanvaller die Tunesie iets gevaarlijker maakt.',
    sleutelspelerUit: 'Memphis Depay – aanvaller met groot doelgevaar die dit duel naar zijn hand zet.',
    kansThuis: 14, kansGelijkspel: 20, kansUit: 66,
  },

  // ── Groep G ──────────────────────────────────────────────────────────────────
  'Belgium vs Egypt': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'België is een van de topfavorieten van de groep en heeft in Lukaku, De Bruyne en Doku absolute wereldklasse. Egypte heeft Mohamed Salah, maar de rest van het team kan het Belgische niveau niet bijbenen. Een vlotte Belgische zege is de verwachting.',
    sleutelspelerThuis: 'Romelu Lukaku – de meest dominante spits van de groep met zijn fysiek en doelgevaar.',
    sleutelspelerUit: 'Mohamed Salah – enige echte dreiging van Egypte die België op scherp houdt.',
    kansThuis: 68, kansGelijkspel: 20, kansUit: 12,
  },
  'Iran vs New Zealand': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Iran is duidelijk de sterkere ploeg en heeft in Taremi een van de beste spitsen buiten de topcompetities. Nieuw-Zeeland speelt zelden op dit niveau en mist de kwaliteit om Iran te bedreigen. Een comfortabele Iraanse overwinning.',
    sleutelspelerThuis: 'Mehdi Taremi – topspits die ook op het WK zijn klasse wil tonen.',
    sleutelspelerUit: 'Chris Wood – ervaren spits die NZ iets gevaarlijker maakt.',
    kansThuis: 62, kansGelijkspel: 22, kansUit: 16,
  },
  'Belgium vs Iran': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'België is meerdere niveaus beter dan Iran. Met De Bruyne als spelmaker en Lukaku als spits heeft België een aanval die Iran simpelweg niet kan bijhouden. De Belgen winnen comfortabel in een duel zonder echte spanning.',
    sleutelspelerThuis: 'Kevin De Bruyne – spelmaker van absolute wereldklasse die het tempo dicteert.',
    sleutelspelerUit: 'Mehdi Taremi – gevaarlijkste man van Iran, maar staat voor een titanenklus.',
    kansThuis: 73, kansGelijkspel: 17, kansUit: 10,
  },
  'New Zealand vs Egypt': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Egypte heeft met Salah een speler van absolute topklasse en dat is te veel voor Nieuw-Zeeland. De All Whites zijn compact maar ontberen de aanvalskwaliteit om Egypte echt te bedreigen. Salah bepaalt dit duel bijna eigenhandig.',
    sleutelspelerThuis: 'Chris Wood – weinig kan hij doen maar probeert zijn best.',
    sleutelspelerUit: 'Mohamed Salah – enige onbetwiste sterspeler in de groep, maakt het verschil.',
    kansThuis: 18, kansGelijkspel: 27, kansUit: 55,
  },
  'Egypt vs Iran': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Dit is een evenwichtig duel tussen twee ploegen die allebei strijden voor de tweede plek in de groep. Salah tegenover Taremi: twee aanvallers van hoog niveau. Een gelijkspel lijkt het meest rechtvaardige resultaat.',
    sleutelspelerThuis: 'Mohamed Salah – de man die alles bij Egypte opbouwen en beslissen.',
    sleutelspelerUit: 'Mehdi Taremi – topspits die Iran in leven houdt.',
    kansThuis: 38, kansGelijkspel: 38, kansUit: 24,
  },
  'New Zealand vs Belgium': {
    homeScore: 0, awayScore: 4,
    match_analyse: 'België is in alle opzichten te groot voor Nieuw-Zeeland. De Rode Duivels zullen dit gebruiken om hun doelpuntensaldo te verbeteren. NZ doet zijn best maar staat tegenover een team dat voor het toptoernooi klaarstaat.',
    sleutelspelerThuis: 'Ryan Thomas – NZ-middenvelder die zijn ploeg in de wedstrijd probeert te houden.',
    sleutelspelerUit: 'Romelu Lukaku – verwacht meerdere doelpunten te scoren in dit oefenmatch-achtige duel.',
    kansThuis: 5, kansGelijkspel: 8, kansUit: 87,
  },

  // ── Groep H ──────────────────────────────────────────────────────────────────
  'Spain vs Cape Verde': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Spanje is een van de toplanden en speelt technisch verfijnd voetbal. Kaapverdië is een sympathieke outsider maar mist simpelweg de klasse om La Roja echt te bedreigen. Een comfortabele overwinning voor de Spanjaarden.',
    sleutelspelerThuis: 'Pedri – middenvelder van Barcelona met uitzonderlijk balgevoel en creativiteit.',
    sleutelspelerUit: 'Ryan Mendes – meest gevaarlijke aanvaller van Kaapverdië die druk zet.',
    kansThuis: 87, kansGelijkspel: 9, kansUit: 4,
  },
  'Saudi Arabia vs Uruguay': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Uruguay heeft meer kwaliteit en ervaring en zal dit laten zien. Saudi-Arabië verraste op het WK 2022 maar Uruguay met Núñez en Valverde is te sterk. Een overtuigende Uruguayaanse overwinning ligt in de verwachting.',
    sleutelspelerThuis: 'Saleh Al-Shehri – topspits van Saudi-Arabië die mogelijk voor de treffer zorgt.',
    sleutelspelerUit: 'Darwin Núñez – explosieve spits die de KSA-defensie verscheurt.',
    kansThuis: 12, kansGelijkspel: 20, kansUit: 68,
  },
  'Spain vs Saudi Arabia': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Spanje domineert dit duel volledig. Met Yamal, Pedri en Morata heeft Spanje aanvalskracht genoeg om Saudi-Arabië te verschroeien. De Saudiërs proberen het compact te spelen, maar de Spaanse korte passing is niet te stoppen.',
    sleutelspelerThuis: 'Lamine Yamal – jong fenomeen van Barcelona dat zijn ploeg naar voren drijft.',
    sleutelspelerUit: 'Mohammed Al-Burayk – links­back die verdedigend de KSA overeind houdt.',
    kansThuis: 88, kansGelijkspel: 8, kansUit: 4,
  },
  'Uruguay vs Cape Verde': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Uruguay is in een compleet andere klasse dan Kaapverdië. De Uruguayanen zijn taai, ervaren en gevaarlijk via Núñez en Valverde. Kaapverdië speelt moedig maar zal volledig worden overspeeld.',
    sleutelspelerThuis: 'Federico Valverde – complete middenvelder van Real Madrid die alles doet.',
    sleutelspelerUit: 'Ryan Mendes – meest creatieve Kaapverdische speler die iets probeert.',
    kansThuis: 83, kansGelijkspel: 12, kansUit: 5,
  },
  'Cape Verde vs Saudi Arabia': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Beide landen strijden om een derde plek en punten zijn goud waard. Kaapverdië en Saudi-Arabië zijn redelijk aan elkaar gewaagd; beide landen verdedigen compact en zoeken de counter. Een gelijkspel is realistisch.',
    sleutelspelerThuis: 'Garry Rodrigues – creatieve aanvaller die het verschil probeert te maken voor KV.',
    sleutelspelerUit: 'Firas Al-Buraikan – snelle aanvaller die vanuit de counter kan scoren.',
    kansThuis: 35, kansGelijkspel: 40, kansUit: 25,
  },
  'Uruguay vs Spain': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Dit is het topduel van de groep. Spanje speelt beter voetbal maar Uruguay is taai en kan via Núñez gevaarlijk zijn. Spanje wint nipt dankzij hun technische superioriteit maar Uruguay laat zeker van zich horen.',
    sleutelspelerThuis: 'Darwin Núñez – explosieve aanvaller die Spanje op scherp houdt.',
    sleutelspelerUit: 'Álvaro Morata – aanvoerder en spits die grote duels wint voor Spanje.',
    kansThuis: 30, kansGelijkspel: 28, kansUit: 42,
  },

  // ── Groep I ──────────────────────────────────────────────────────────────────
  'France vs Senegal': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Frankrijk is als nummer 2 van de wereld een klasse apart. Mbappé tegen de Senegalese defensie is een oneerlijk gevecht. Senegal heeft kwaliteit met Mané, maar het verschil in totaalcollectief is te groot voor een gelijkspel.',
    sleutelspelerThuis: 'Kylian Mbappé – snelste speler op het toernooi die niemand kan bijhouden.',
    sleutelspelerUit: 'Sadio Mané – veteraan die Senegal aanvoert en overeind houdt.',
    kansThuis: 65, kansGelijkspel: 22, kansUit: 13,
  },
  'Iraq vs Norway': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Noorwegen heeft in Haaland de beste spits ter wereld en dat is simpelweg te veel voor Irak. De Noren zijn fysiek sterk en hebben met Haaland het ultieme wapen voorin. Irak speelt gedisciplineerd maar kan de Noren niet tegenhouden.',
    sleutelspelerThuis: 'Aymen Hussein – aanvaller die Irak iets dreigender maakt maar weinig kansen krijgt.',
    sleutelspelerUit: 'Erling Haaland – meest gevreesde spits ter wereld, hij maakt dit simpel.',
    kansThuis: 18, kansGelijkspel: 22, kansUit: 60,
  },
  'France vs Iraq': {
    homeScore: 4, awayScore: 0,
    match_analyse: 'Dit is een non-wedstrijd in termen van kwaliteit. Frankrijk zal dit benutten om hun aanvallende kwaliteiten te tonen en doelpuntensaldo op te bouwen. Irak kan simpelweg niets beginnen tegen de individuele kwaliteit van Mbappé en co.',
    sleutelspelerThuis: 'Kylian Mbappé – gaat zijn klasse tonen in dit makkelijke duel.',
    sleutelspelerUit: 'Aymen Hussein – staat voor een onmogelijke opgave maar vecht voor elk moment.',
    kansThuis: 92, kansGelijkspel: 6, kansUit: 2,
  },
  'Norway vs Senegal': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Noorwegen heeft Haaland maar Senegal heeft een gevaarlijk aanvallend collectief met Mané. Beide ploegen willen de tweede plek in de groep pakken en dit wordt een evenwichtig duel. Een gelijkspel doet recht aan de verhoudingen.',
    sleutelspelerThuis: 'Erling Haaland – wil scoren en zijn ploeg naar een zege leiden.',
    sleutelspelerUit: 'Sadio Mané – aanvoerder die Senegal naar hogere sferen tilt.',
    kansThuis: 33, kansGelijkspel: 37, kansUit: 30,
  },
  'Norway vs France': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Noorwegen heeft Haaland maar France heeft gewoon een beter totaalteam. Haaland kan Noorwegen gevaarlijk maken, maar Mbappé, Griezmann en Dembélé zijn collectief te sterk voor de Noren. Frankrijk wint dit comfortabel.',
    sleutelspelerThuis: 'Erling Haaland – grote ster die alles geeft maar staat voor een klasse beter team.',
    sleutelspelerUit: 'Kylian Mbappé – superster die dit duel met enkele acties beslist.',
    kansThuis: 18, kansGelijkspel: 22, kansUit: 60,
  },
  'Senegal vs Iraq': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Senegal is een klasse beter dan Irak en heeft genoeg kwaliteit om dit comfortabel te winnen. Mané zal zijn team aanvoeren in dit duel waarbij de Senegalezen vol voor de drie punten gaan voor hun verdere kansen in de groep.',
    sleutelspelerThuis: 'Sadio Mané – leider van Senegal die zijn ploeg naar voren leidt.',
    sleutelspelerUit: 'Aymen Hussein – beste aanvaller van Irak die iets probeert te forceren.',
    kansThuis: 68, kansGelijkspel: 20, kansUit: 12,
  },

  // ── Groep J ──────────────────────────────────────────────────────────────────
  'Argentina vs Algeria': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Argentinië is als nummer 1 van de wereld een klas apart. Messi en zijn ploeggenoten zullen Algerije volledig overspelen in een duel zonder twijfel. Mahrez kan voor een gevaarlijk moment zorgen, maar Argentina is simpelweg te goed.',
    sleutelspelerThuis: 'Lionel Messi – de beste speler aller tijden die hier zijn klasse toont.',
    sleutelspelerUit: 'Riyad Mahrez – creatieve aanvaller die Algerije gevaarlijker maakt.',
    kansThuis: 82, kansGelijkspel: 12, kansUit: 6,
  },
  'Austria vs Jordan': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Oostenrijk is duidelijk beter dan Jordanië en zal dit tonen in een gecontroleerde overwinning. Sabitzer en zijn ploeggenoten zijn tactisch sterk en hebben genoeg kwaliteit om Jordanië te verschroeien. Jordanië hoopt de schade te beperken.',
    sleutelspelerThuis: 'Marcel Sabitzer – motor van het Oostenrijkse middenveld met doelgevaar.',
    sleutelspelerUit: 'Ahmad Hayel – aanvaller die Jordanië gevaarlijker maakt voor de goal.',
    kansThuis: 62, kansGelijkspel: 23, kansUit: 15,
  },
  'Argentina vs Austria': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Argentinië is een klasse beter dan Oostenrijk en zal dit duel gecontroleerd domineren. Met Messi als spelmaker en Di María of Lautaro als aanvallers heeft Argentinië te veel kwaliteit. Oostenrijk zal weinig ruimte krijgen.',
    sleutelspelerThuis: 'Lionel Messi – absolute sterspeler die dit duel naar zijn hand zet.',
    sleutelspelerUit: 'Marcel Sabitzer – aanvoerder die Oostenrijk zo lang mogelijk overeind houdt.',
    kansThuis: 72, kansGelijkspel: 18, kansUit: 10,
  },
  'Jordan vs Algeria': {
    homeScore: 0, awayScore: 1,
    match_analyse: 'Algerije is iets beter geplaatst op de FIFA-ranking en heeft met Mahrez een speler van hogere klasse. Jordanië speelt compact maar mist de kwaliteit om Algerije over 90 minuten te weerstaan. Algerije wint nipt.',
    sleutelspelerThuis: 'Ahmad Hayel – gevaarlijkste aanvaller van Jordanië die verrassingsmoment zoekt.',
    sleutelspelerUit: 'Riyad Mahrez – verschilmakende kwaliteit die Algerije over de streep trekt.',
    kansThuis: 25, kansGelijkspel: 35, kansUit: 40,
  },
  'Algeria vs Austria': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Oostenrijk en Algerije zijn min of meer gelijkwaardig en dit belooft een spannend duel. Beide ploegen hebben punten nodig om verder te gaan en dat zal leiden tot een aantrekkelijke wedstrijd met kansen aan beide kanten.',
    sleutelspelerThuis: 'Riyad Mahrez – zal Algerije dragen in dit cruciale duel.',
    sleutelspelerUit: 'David Alaba – aanvoerder en topverdediger van Oostenrijk die de boel stabiel houdt.',
    kansThuis: 30, kansGelijkspel: 38, kansUit: 32,
  },
  'Jordan vs Argentina': {
    homeScore: 0, awayScore: 3,
    match_analyse: 'Argentinië gaat hier gewoon door en Jordanië heeft simpelweg geen antwoord. Messi en zijn ploeggenoten zijn op een ander niveau en zullen dit tonen in een dominante overwinning. Jordanië hoopt het enigszins beschaafd te houden.',
    sleutelspelerThuis: 'Ahmad Hayel – enige speler die verrassingsmoment voor Jordanië kan brengen.',
    sleutelspelerUit: 'Lionel Messi – klasse boven klasse, gaat dit duel domineren.',
    kansThuis: 5, kansGelijkspel: 8, kansUit: 87,
  },

  // ── Groep K ──────────────────────────────────────────────────────────────────
  'Portugal vs DR Congo': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Portugal heeft naast Ronaldo ook Bruno Fernandes, Bernardo Silva en Rafael Leão — te veel klasse voor DR Congo. De Kongolezen zullen compact verdedigen maar worden toch door Portugal\'s aanvalsgeweld overmand.',
    sleutelspelerThuis: 'Cristiano Ronaldo – recordscorer die ook op dit WK zijn stempel wil drukken.',
    sleutelspelerUit: 'Yoane Wissa – aanvaller van Brentford die DR Congo gevaarlijker maakt.',
    kansThuis: 83, kansGelijkspel: 11, kansUit: 6,
  },
  'Uzbekistan vs Colombia': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Colombia heeft met Díaz, Rodríguez en Arias zoveel meer kwaliteit dan Oezbekistan. Los Cafeteros zijn de klare favoriet en zullen dit tonen. Oezbekistan speelt hard maar mist de klasse voor een punt.',
    sleutelspelerThuis: 'Eldor Shomurodov – topspits van Oezbekistan die Colombia kan verrassen.',
    sleutelspelerUit: 'Luis Díaz – razendsnel aanvaller van Liverpool die de Oezbeekse defensie verscheurt.',
    kansThuis: 14, kansGelijkspel: 21, kansUit: 65,
  },
  'Portugal vs Uzbekistan': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Portugal heeft te veel klasse voor Oezbekistan op elk vlak. Ronaldo en Fernandes zullen dit duel controleren en Oezbekistan kan weinig beginnen. Een comfortabele en vlotte overwinning voor de Portugezen.',
    sleutelspelerThuis: 'Bruno Fernandes – spelmaker en aanvoerder die de Portugese aanval aanstuurt.',
    sleutelspelerUit: 'Eldor Shomurodov – beste aanvaller van Oezbekistan die een treffer probeert te maken.',
    kansThuis: 83, kansGelijkspel: 12, kansUit: 5,
  },
  'Colombia vs DR Congo': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Colombia is duidelijk favoriet en heeft genoeg kwaliteit in de aanval om DR Congo te overklassen. Díaz en Rodríguez zullen samen gevaarlijk zijn. DR Congo zal het compact proberen maar ontbreekt het aan aanvalskracht.',
    sleutelspelerThuis: 'James Rodríguez – creatieve spelmaker die Colombia aanvoert.',
    sleutelspelerUit: 'Yoane Wissa – snelheid die Colombia\'s defensie kan testen.',
    kansThuis: 72, kansGelijkspel: 18, kansUit: 10,
  },
  'Colombia vs Portugal': {
    homeScore: 1, awayScore: 2,
    match_analyse: 'Dit wordt het topduel van de groep. Colombia is technisch sterk maar Portugal heeft met Ronaldo en Fernandes net dat extra kwaliteitsniveau. Een spannend duel waarbij Portugal nipt beter is, maar Colombia zeker niet onderdoet.',
    sleutelspelerThuis: 'Luis Díaz – razendsnel en gevaarlijk, Colombia\'s beste wapen.',
    sleutelspelerUit: 'Cristiano Ronaldo – grote duels zijn zijn specialiteit, weet hoe je wint.',
    kansThuis: 30, kansGelijkspel: 28, kansUit: 42,
  },
  'DR Congo vs Uzbekistan': {
    homeScore: 1, awayScore: 1,
    match_analyse: 'Dit is een evenwichtig duel tussen twee vergelijkbare landen. DR Congo heeft atletisch talent, Oezbekistan heeft techniek. Beide teams strijden voor de eer en een gelijkspel is het meest logische resultaat.',
    sleutelspelerThuis: 'Yoane Wissa – aanvaller met talent die DR Congo gevaarlijker maakt.',
    sleutelspelerUit: 'Eldor Shomurodov – zal zijn doelpuntenrecord proberen aan te scherpen.',
    kansThuis: 30, kansGelijkspel: 38, kansUit: 32,
  },

  // ── Groep L ──────────────────────────────────────────────────────────────────
  'England vs Croatia': {
    homeScore: 2, awayScore: 0,
    match_analyse: 'Engeland heeft enorme kwaliteitsdiepte met Kane, Bellingham en Saka. Kroatië heeft Modrić maar is in de nadagen van de gouden generatie. Engeland wint dit duel comfortabel en zet een heldere boodschap aan de groep.',
    sleutelspelerThuis: 'Jude Bellingham – complete middenvelder die aanvallend en verdedigend het verschil maakt.',
    sleutelspelerUit: 'Luka Modrić – geniaal spelmaker maar is dit nog op topniveau in 2026?',
    kansThuis: 65, kansGelijkspel: 22, kansUit: 13,
  },
  'Ghana vs Panama': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Ghana is duidelijk beter dan Panama en heeft met Kudus een speler die op elk moment kan beslissen. Panama speelt hard en fysiek, maar Ghana heeft genoeg kwaliteit om dit te winnen. Een spannende wedstrijd met Ghana als winnaar.',
    sleutelspelerThuis: 'Mohammed Kudus – jong talent van Ajax/West Ham die Ghana aanstuurt.',
    sleutelspelerUit: 'Rolando Blackburn – spits die Panama in de wedstrijd houdt.',
    kansThuis: 50, kansGelijkspel: 28, kansUit: 22,
  },
  'England vs Ghana': {
    homeScore: 3, awayScore: 0,
    match_analyse: 'Engeland is een klasse apart ten opzichte van Ghana. Kane en Bellingham zullen dit duel domineren. Ghana heeft talent maar mist het collectief om Engeland echt te bedreigen. Een comfortabele Engelse overwinning.',
    sleutelspelerThuis: 'Harry Kane – wereldklasse spits die elke verdediging gevaarlijk is.',
    sleutelspelerUit: 'Mohammed Kudus – beste kans voor Ghana om gevaarlijk te zijn.',
    kansThuis: 76, kansGelijkspel: 16, kansUit: 8,
  },
  'Panama vs Croatia': {
    homeScore: 0, awayScore: 2,
    match_analyse: 'Kroatië heeft met Modrić en Perisić veel meer ervaring op groot toneel dan Panama. De Kroaten zijn tactisch sterk en zullen dit duel gecontroleerd winnen. Panama speelt vol hart maar ontbreekt het aan de nodige kwaliteit.',
    sleutelspelerThuis: 'Rolando Blackburn – zal Panama\'s aanval proberen aan te sturen.',
    sleutelspelerUit: 'Ivan Perišić – gevaarlijk op de flanken en brengt Kroatië vooruit.',
    kansThuis: 14, kansGelijkspel: 22, kansUit: 64,
  },
  'Panama vs England': {
    homeScore: 0, awayScore: 3,
    match_analyse: 'Engeland heeft al genoeg punten en zal dit duel toch serieus nemen. Panama is simpelweg niet in staat Engeland te bedreigen op dit niveau. Kane, Bellingham en Saka zorgen voor een comfortabele English overwinning.',
    sleutelspelerThuis: 'Rolando Blackburn – weinig kansen maar vecht voor elk moment voor Panama.',
    sleutelspelerUit: 'Harry Kane – topscorer die ook hier zijn stempel drukt.',
    kansThuis: 7, kansGelijkspel: 12, kansUit: 81,
  },
  'Croatia vs Ghana': {
    homeScore: 2, awayScore: 1,
    match_analyse: 'Kroatië is iets beter maar Ghana is gevaarlijk via Kudus. Modrić en de Kroatische ervaring geven de doorslag in dit directe duel om de tweede plek. Ghana geeft niet op maar Kroatië wint nipt.',
    sleutelspelerThuis: 'Luka Modrić – geniale spelmaker die ook op dit WK zijn klasse toont.',
    sleutelspelerUit: 'Mohammed Kudus – creatief en technisch, Ghana\'s geheime wapen.',
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
