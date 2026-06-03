import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = { title: "WK Poule 2026" };

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-wk-bg px-4 py-12">
      {/* Header card */}
      <div className="w-full max-w-sm mb-6 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
        <div className="relative h-44">
          <Image
            src="/world-cup-default.jpg"
            alt="WK 2026"
            fill
            className="object-cover object-center"
            priority
          />
          {/* Dark overlays — same as deck cover */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/30" />
          <div className="absolute bottom-0 left-0 px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-wk-red text-white text-xs font-mono font-bold tracking-[0.2em] uppercase px-2 py-1 rounded">
                WK Poule
              </span>
              <span className="text-white/70 font-mono text-xs tracking-widest uppercase">
                Editie 2026
              </span>
            </div>
            <p className="font-display text-2xl text-white uppercase leading-none tracking-tight">
              MIJN <span className="text-wk-gold">WK POULE</span>
            </p>
            <p className="font-mono text-white/60 text-[10px] tracking-[0.18em] uppercase mt-1">
              Voorspellen · Volgen · Winnen
            </p>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
