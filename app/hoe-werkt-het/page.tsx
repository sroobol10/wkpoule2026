import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AnimatedSection from './animated-section'

export const metadata: Metadata = {
  title: 'Hoe werkt het?',
  description: 'Alles over Mijn WK Poule: voorspellingen, jokers, puntentelling, de KO-fase en bonusvragen.',
  robots: { index: true, follow: true },
}

const STEPS = [
  {
    step: '01',
    color: 'wk-red',
    icon: '⚽',
    title: 'Voorspel alle groepswedstrijden',
    desc: 'Vul voor de start van het WK de uitslag in van alle 72 groepswedstrijden. Per groep (A t/m L) voorspel je wie 1e, 2e of 3e eindigt.',
    detail: 'Al je groepsvoorspellingen moeten ingevuld zijn vóór de aftrap van de allereerste wedstrijd. Daarna zijn ze niet meer aan te passen.',
    scores: [
      { label: 'Exacte uitslag', pts: '10' },
      { label: 'Correct resultaat + één doelpunttotaal', pts: '7' },
      { label: 'Correct resultaat (W/G/V)', pts: '5' },
      { label: 'Fout resultaat + één doelpunttotaal', pts: '2' },
      { label: 'Correcte eindpositie in de groep', pts: '5' },
    ],
  },
  {
    step: '02',
    color: 'wk-gold',
    icon: '★',
    title: 'Zet je joker in',
    desc: 'Per groep mag je op één wedstrijd een joker inzetten. De joker verdubbelt het aantal behaalde punten voor die wedstrijd.',
    detail: 'Je hebt 12 jokers (één per groep A t/m L). Kies slim — de joker is niet meer te wijzigen zodra er een wedstrijd in die groep is gespeeld.',
    scores: null,
  },
  {
    step: '03',
    color: 'wk-blue',
    icon: '🏆',
    title: 'Voorspel de KO-fase',
    desc: 'Vul vóór het toernooi je bracket in: wie wint de Ronde van 32, de achtste finales, de kwartfinales, de halve finales en de finale?',
    detail: 'Je hoeft niet het exacte slot te raden — het gaat erom of je het juiste land in die ronde hebt voorspeld als winnaar.',
    scores: [
      { label: 'Ronde van 32', pts: '15' },
      { label: 'Achtste finale', pts: '25' },
      { label: 'Kwartfinale', pts: '50' },
      { label: 'Halve finale', pts: '100' },
      { label: 'Finale', pts: '200' },
      { label: 'Troostfinale', pts: '50' },
    ],
  },
  {
    step: '04',
    color: 'wk-green',
    icon: '🎯',
    title: 'Bonusvragen',
    desc: 'Los speciale vragen op over het toernooi: wie wordt topscorer, wie is de beste speler, en wie wint het GOAT-duel — Ronaldo of Messi?',
    detail: 'De dagelijkse vraag sluit bij de aftrap van de eerste wedstrijd van die dag. Vul op tijd in!',
    scores: [
      { label: 'Topscorer', pts: '25' },
      { label: 'Beste speler', pts: '15' },
      { label: 'GOAT-duel', pts: '10' },
      { label: 'Gedoseerde groepsfase', pts: 'max. 15' },
      { label: 'Dagelijkse vraag', pts: '1' },
    ],
  },
  {
    step: '05',
    color: 'wk-red',
    icon: '📊',
    title: 'Volg de stand',
    desc: 'Zodra wedstrijden worden gespeeld en uitslagen worden ingevoerd, zie je live hoe jij en je mede-deelnemers scoren.',
    detail: 'Je ziet wie er stijgt en daalt in het klassement, inclusief een breakdown per categorie: groepsfase, KO-fase, bonusvragen en jokers.',
    scores: null,
  },
]

export default async function HoeWerktHetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div className="min-h-screen bg-wk-bg">
      {/* Hero */}
      <div className="relative h-64 md:h-84 overflow-hidden">
        <Image
          src="/retro-1988.jpg"
          alt="Mijn WK Poule 2026"
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-wk-bg" />
        <div className="absolute inset-0 flex flex-col items-center justify-end text-center px-6">
          <p className="font-mono text-[11px] text-white/60 tracking-[0.3em] uppercase mb-3">Mijn WK Poule · 2026</p>
          <h1 className="font-display text-4xl md:text-6xl text-white uppercase leading-none tracking-tight drop-shadow-xl">
            Hoe werkt <span className="text-wk-gold">het?</span>
          </h1>
          <p className="font-mono text-white/60 text-[11px] tracking-[0.18em] uppercase mt-3">
            Voorspellen · Scoren · Winnen
          </p>
        </div>
      </div>

      {/* Intro */}
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p className="text-wk-soft text-lg leading-relaxed">
          Mijn WK Poule is een poule-spel rondom het WK 2026 in Canada, VS en Mexico.
          Vul je voorspellingen in, zet jokers in op wedstrijden en strijd met vrienden en collega&apos;s om de meeste punten.
        </p>
      </div>

      {/* Steps */}
      <div className="max-w-3xl mx-auto px-6 pb-16 space-y-8">
        {STEPS.map((s, i) => (
          <AnimatedSection key={s.step} delay={i * 80}>
            <div className="rounded-2xl border border-white/10 bg-wk-surface overflow-hidden">
              {/* Header */}
              <div className="px-6 py-5 border-b border-white/10 flex items-start gap-4">
                <div className="shrink-0">
                  <span className="font-mono text-[10px] text-wk-muted tracking-[0.2em] uppercase block mb-1">Stap {s.step}</span>
                  <span className="text-3xl leading-none">{s.icon}</span>
                </div>
                <div>
                  <h2 className="font-display text-xl md:text-2xl text-wk-text uppercase leading-tight">
                    {s.title}
                  </h2>
                  <p className="text-wk-soft text-sm mt-1.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>

              {/* Detail + scores */}
              <div className="px-6 py-5 space-y-4">
                <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] leading-relaxed">{s.detail}</p>

                {s.scores && (
                  <div className="rounded-xl bg-wk-bg2 border border-white/10 overflow-hidden">
                    <p className="font-mono text-[9px] text-wk-muted tracking-[0.2em] uppercase px-4 py-2 border-b border-white/10">
                      Puntentelling
                    </p>
                    <div className="divide-y divide-white/5">
                      {s.scores.map(({ label, pts }) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5 gap-4">
                          <span className="font-mono text-[10px] text-wk-soft tracking-widest">{label}</span>
                          <span className="font-display text-base text-wk-gold shrink-0">{pts}<span className="font-mono text-[10px] text-wk-muted ml-0.5">pt</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </AnimatedSection>
        ))}
      </div>

      {/* CTA */}
      <AnimatedSection delay={0}>
        <div className="max-w-2xl mx-auto px-6 pb-20 text-center space-y-4">
          <p className="font-display text-2xl md:text-3xl text-wk-text uppercase">
            {isLoggedIn
              ? <>Ga aan de <span className="text-wk-gold">slag!</span></>
              : <>Klaar om mee te <span className="text-wk-gold">doen?</span></>
            }
          </p>
          <p className="font-mono text-[10px] text-wk-muted tracking-widest uppercase">
            {isLoggedIn
              ? 'Je bent al ingelogd — ga direct naar je voorspellingen'
              : 'Maak een account aan en ga direct aan de slag'
            }
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            {isLoggedIn ? (
              <Link
                href="/voorspellingen"
                className="rounded-full bg-wk-red px-6 py-2.5 font-mono text-[11px] font-bold text-white tracking-[0.18em] uppercase hover:opacity-90 transition-opacity"
              >
                Naar mijn voorspellingen →
              </Link>
            ) : (
              <>
                <Link
                  href="/registreren"
                  className="rounded-full bg-wk-red px-6 py-2.5 font-mono text-[11px] font-bold text-white tracking-[0.18em] uppercase hover:opacity-90 transition-opacity"
                >
                  Deelnemen
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-white/20 px-6 py-2.5 font-mono text-[11px] text-wk-muted tracking-[0.18em] uppercase hover:border-white/40 hover:text-wk-soft transition-colors"
                >
                  Inloggen
                </Link>
              </>
            )}
          </div>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <div className="border-t border-white/10 py-6 text-center">
        <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase">
          Mijn WK Poule · mijnwkpoule.nl · WK 2026
        </p>
      </div>
    </div>
  )
}
