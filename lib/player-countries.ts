// Land per speler uit de topscorer/beste speler-spelerslijsten (en het GOAT-duel).
// Landnamen exact zoals in de teams-tabel, zodat de vlag op te zoeken is.
export const PLAYER_COUNTRIES: Record<string, string> = {
  // Argentinië
  'Julián Álvarez': 'Argentinië',
  'Lautaro Martínez': 'Argentinië',
  'Lionel Messi': 'Argentinië',
  'Alexis Mac Allister': 'Argentinië',
  'Enzo Fernández': 'Argentinië',
  'Messi': 'Argentinië',
  // België
  'Kevin de Bruyne': 'België',
  'Romelu Lukaku': 'België',
  // Brazilië
  'Igor Thiago': 'Brazilië',
  'Matheus Cunha': 'Brazilië',
  'Raphinha': 'Brazilië',
  'Vinícius Júnior': 'Brazilië',
  'Neymar': 'Brazilië',
  // Colombia
  'Luis Díaz': 'Colombia',
  'Luis Javier Suárez': 'Colombia',
  // Duitsland
  'Florian Wirtz': 'Duitsland',
  'Jamal Musiala': 'Duitsland',
  'Kai Havertz': 'Duitsland',
  // Ecuador
  'Enner Valencia': 'Ecuador',
  // Egypte
  'Mohamed Salah': 'Egypte',
  // Engeland
  'Bukayo Saka': 'Engeland',
  'Harry Kane': 'Engeland',
  'Jude Bellingham': 'Engeland',
  'Ollie Watkins': 'Engeland',
  'Declan Rice': 'Engeland',
  // Frankrijk
  'Désire Doué': 'Frankrijk',
  'Kylian Mbappé': 'Frankrijk',
  'Michael Olise': 'Frankrijk',
  'Ousmane Dembélé': 'Frankrijk',
  // Ghana
  'Antoine Semenyo': 'Ghana',
  // Japan
  'Ayase Ueda': 'Japan',
  // Kroatië
  'Andrej Kramaric': 'Kroatië',
  'Luka Modric': 'Kroatië',
  // Marokko
  'Brahim Díaz': 'Marokko',
  // Mexico
  'Raúl Jiménez': 'Mexico',
  // Nederland
  'Cody Gakpo': 'Nederland',
  'Donyell Malen': 'Nederland',
  'Memphis Depay': 'Nederland',
  'Denzel Dumfries': 'Nederland',
  'Frenkie de Jong': 'Nederland',
  'Virgil van Dijk': 'Nederland',
  // Noorwegen
  'Erling Haaland': 'Noorwegen',
  // Portugal
  'Bruno Fernandes': 'Portugal',
  'Cristiano Ronaldo': 'Portugal',
  'Gonçalo Ramos': 'Portugal',
  'João Neves': 'Portugal',
  'Nuno Mendes': 'Portugal',
  'Vitinha': 'Portugal',
  'Ronaldo': 'Portugal',
  // Schotland
  'Scott McTominay': 'Schotland',
  // Senegal
  'Sadio Mané': 'Senegal',
  // Spanje
  'Dani Olmo': 'Spanje',
  'Ferran Torres': 'Spanje',
  'Lamine Yamal': 'Spanje',
  'Mikel Merino': 'Spanje',
  'Mikel Oyarzabal': 'Spanje',
  'Nico Williams': 'Spanje',
  'Pedri': 'Spanje',
  'Rodri': 'Spanje',
  // Turkije
  'Arda Güler': 'Turkije',
  // Uruguay
  'Darwin Núñez': 'Uruguay',
  // Verenigde Staten
  'Christian Pulisic': 'Verenigde Staten',
  // Zuid-Korea
  'Son Heung-Min': 'Zuid-Korea',
  // Zweden
  'Alexander Isak': 'Zweden',
  'Viktor Gyökeres': 'Zweden',
}

export const playerCountry = (player: string): string | null =>
  PLAYER_COUNTRIES[player.trim()] ?? null
