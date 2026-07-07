// Mini geluids-helper voor de playground-games. Laadt een setje mp3's uit /public/sfx voor en
// speelt ze op aanvraag. Ontbreekt een bestand of blokkeert de browser autoplay? Dan faalt het
// STIL — zo kun je de koppeling alvast leggen en de mp3's later toevoegen.

export type Sfx = { play: (name: string, vol?: number) => void; loop: (name: string, vol?: number) => void; stop: (name: string) => void }

export function createSfx(names: string[]): Sfx {
  const map: Record<string, HTMLAudioElement> = {}
  if (typeof window !== 'undefined') {
    for (const n of names) {
      const a = new window.Audio(`/sfx/${n}.mp3`)
      a.preload = 'auto'
      map[n] = a
    }
  }
  return {
    play(name, vol = 1) {
      const a = map[name]
      if (!a) return
      try { a.loop = false; a.currentTime = 0; a.volume = vol; a.play()?.catch(() => {}) } catch { /* geen bestand / autoplay geweigerd */ }
    },
    loop(name, vol = 1) {
      const a = map[name]
      if (!a) return
      try { a.loop = true; a.volume = vol; if (a.paused) a.play()?.catch(() => {}) } catch { /* stil */ }
    },
    stop(name) {
      const a = map[name]
      if (!a) return
      try { a.pause(); a.currentTime = 0 } catch { /* stil */ }
    },
  }
}
