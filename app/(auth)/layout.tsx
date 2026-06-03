import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: 'Inloggen',
  description: 'Log in op Mijn WK Poule en ga direct aan de slag met jouw voorspellingen voor WK 2026.',
  robots: { index: true, follow: true },
};

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-wk-bg px-4 py-12">
      {/* Header card */}
      <div className="w-full max-w-md mb-6 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
        <div className="relative aspect-[2/1]">
          <Image
            src="/mijn-wk-poule.jpg"
            alt="Mijn WK Poule 2026"
            fill
            className="object-cover object-center"
            priority
          />
          {/* Dark overlays — same as deck cover */}
         </div>
      </div>

      {children}
    </div>
  );
}
