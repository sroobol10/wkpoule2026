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
    <div className="min-h-screen flex flex-col bg-wk-bg sm:items-center sm:justify-center sm:px-4 sm:py-12">

      {/* Hero */}
      <div className="w-full sm:max-w-md sm:mb-6 sm:rounded-2xl overflow-hidden sm:shadow-2xl sm:border border-white/10">
        <div className="relative aspect-2/1">
          <Image
            src="/mijn-wk-poule.jpg"
            alt="Mijn WK Poule 2026"
            fill
            className="object-cover object-top"
            priority
          />
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 sm:flex-none w-full sm:max-w-md px-4 sm:px-0 py-8 sm:py-0">
        {children}
      </div>

    </div>
  );
}
