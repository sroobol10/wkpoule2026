// Padel Club: de vier deelnemers die de takeover-pagina én de klassement-link zien.
// Vergelijking is hoofdletter-ongevoelig (usernames staan soms met hoofdletter).
export const PADEL_USERNAMES = ['steveloper', 'christiaano', 'shrimplife', 'vdleije']

export function isPadelUser(username: string | null | undefined): boolean {
  return !!username && PADEL_USERNAMES.includes(username.toLowerCase())
}
