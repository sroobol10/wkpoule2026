// FIFA/Coca-Cola Men's World Ranking — laatste officiële update: 1 april 2026
// Bron: FIFA / ESPN / Sofascore (april 2026)
// Lager getal = beter gerangschikt
export const FIFA_RANKING: Record<string, number> = {
  // Groep A
  'México': 15,
  'Mexico': 15,          // zonder accent (DB-spelling)
  'Zuid-Korea': 25,
  'Zuid-Afrika': 60,
  'Tsjechië': 41,
  // Groep B
  'Canada': 30,
  'Bosnië-Herzegovina': 65,
  'Qatar': 55,
  'Zwitserland': 19,
  // Groep C
  'Brazilië': 6,
  'Marokko': 8,
  'Schotland': 43,
  'Haïti': 83,
  // Groep D
  'Verenigde Staten': 16,
  'United States': 16,   // engelstalige alias
  'Paraguay': 40,
  'Australië': 27,
  'Turkije': 22,
  // Groep E
  'Duitsland': 10,
  'Curaçao': 82,
  'Ivoorkust': 34,
  'Ecuador': 23,
  // Groep F
  'Nederland': 7,
  'Japan': 18,
  'Tunesië': 44,
  'Zweden': 38,
  // Groep G
  'België': 9,
  'Iran': 21,
  'Egypte': 29,
  'Nieuw-Zeeland': 85,
  // Groep H
  'Spanje': 2,
  'Uruguay': 17,
  'Saoedi-Arabië': 61,
  'Saudi-Arabië': 61,       // alternatieve spelling
  'Kaapverdië': 69,
  'Cabo Verde': 69,         // alternatieve spelling
  // Groep I
  'Frankrijk': 1,
  'Senegal': 14,
  'Noorwegen': 31,
  'Irak': 57,
  // Groep J
  'Argentinië': 3,
  'Algerije': 28,
  'Oostenrijk': 24,
  'Jordanië': 63,
  // Groep K
  'Portugal': 5,
  'Colombia': 13,
  'Oezbekistan': 50,
  'DR Congo': 46,
  'Congo DR': 46,
  'Congo-Kinshasa': 46,
  'Democratische Republiek Congo': 46,
  // Groep L
  'Engeland': 4,
  'Kroatië': 11,
  'Ghana': 74,
  'Panama': 33,
}

export type ThirdEntry = {
  group: string
  teamId: string
  name: string
  points: number
  gd: number
  gf: number
}

// FIFA-regels voor rangschikking beste nummer-3's (cross-groep):
// 1. Punten · 2. Doelsaldo · 3. Doelpunten voor · 4. FIFA-ranking · 5. Alfabetisch (loting-surrogaat)
export function compareThirds(a: ThirdEntry, b: ThirdEntry): number {
  return (
    b.points - a.points ||
    b.gd    - a.gd    ||
    b.gf    - a.gf    ||
    (FIFA_RANKING[a.name] ?? 999) - (FIFA_RANKING[b.name] ?? 999) ||
    a.name.localeCompare(b.name)
  )
}
