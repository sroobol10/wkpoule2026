import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HeroTitle from "@/components/nav/hero-title";
import HeroImage from "@/components/nav/hero-image";
import Sidebar from "@/components/nav/sidebar";
import BottomNav from "@/components/nav/bottom-nav";
import NavProgress from "@/components/nav/nav-progress";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, is_admin, theme")
    .eq("id", user.id)
    .single();

  const username = profile?.username ?? user.email ?? "Gebruiker";
  const isAdmin = profile?.is_admin ?? false;
  const theme = profile?.theme ?? "default";
  const isRetro = theme === "retro-1988";
  const isOostenrijk = theme === "oostenrijk";

  // Controleer of de gebruiker in een poule genaamd "ennovate" zit
  const { data: ennovatePoule } = await supabase
    .from("poule_members")
    .select("poules!inner(name)")
    .eq("user_id", user.id)
    .ilike("poules.name", "%ennovate%")
    .limit(1)
    .maybeSingle();

  const isEnnovate = !!ennovatePoule;
  const defaultHeaderImg = isEnnovate ? "/world-cup-banner.jpg" : "/hero.jpg";
  let headerImg = defaultHeaderImg;
  if (isRetro) headerImg = "/retro-1988.jpg";
  else if (isOostenrijk) headerImg = "/julia-hero.jpg";

  let headerAlt = "WK 2026";
  if (isRetro) headerAlt = "EK 1988 Retro";
  else if (isOostenrijk) headerAlt = "Alpengloed";

  let gradientB = "from-black/55 via-black/10 to-black/85";
  if (isRetro)
    gradientB = "from-black/70 via-transparent to-black/90";
  else if (isOostenrijk)
    gradientB = "from-red-900/60 via-transparent to-red-900/80";

  let gradientR = "from-black/50 via-transparent to-black/40";
  if (isRetro)
    gradientR = "from-black/60 via-transparent to-black/50";
  else if (isOostenrijk)
    gradientR = "from-red-900/50 via-transparent to-red-900/40";

  const gradientBClass = `absolute inset-0 bg-linear-to-b ${gradientB}`;
  const gradientRClass = `absolute inset-0 bg-linear-to-r ${gradientR}`;

  let themeClass = "";
  if (isRetro) themeClass = "theme-retro";
  else if (isOostenrijk) themeClass = "theme-oostenrijk";

  return (
    <div className={`min-h-screen bg-wk-bg ${themeClass}`}>
      <NavProgress />
      <Sidebar isAdmin={isAdmin} username={username} />
      <BottomNav isAdmin={isAdmin} />

      <div className="md:pl-56 pb-20 md:pb-0 min-h-screen">
        {/* Header banner */}
        <div className="relative h-44 md:h-[346px] lg:h-86.5 xl:h-100.75 min-[1600px]:h-170 w-full overflow-hidden">
          <HeroImage
            src={headerImg}
            pouleSrc={isEnnovate && !isRetro && !isOostenrijk ? "/management.jpg" : null}
            alt={headerAlt}
          />
          {/* Gradient overlays */}
          <div className={gradientBClass} />
          <div className={gradientRClass} />

          {/* Top chrome */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 md:px-8 pt-5">
            <div className="flex items-center gap-3">
              <span className="bg-wk-red text-white font-mono font-bold text-[11px] tracking-[0.2em] uppercase px-2.5 py-1 rounded">
                {isRetro ? "EK 1988 VIBES" : "WK Poule"}
              </span>
              <span className="text-white/60 font-mono text-[11px] tracking-[0.16em] uppercase hidden sm:block">
                {isRetro ? "Oranje Boven" : "Editie 2026"}
              </span>
            </div>
            <span className="text-white/50 font-mono text-[11px] tracking-[0.16em] uppercase hidden sm:block">
              Strijd · Passie · Glorie
            </span>
          </div>

          {/* Bottom title block — client component zodat usePathname() live updatet */}
          <HeroTitle isRetro={isRetro} />

          {/* Gouden accentlijn met trage glans */}
          <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-wk-gold/70 to-transparent animate-retro-shimmer" />
        </div>

        {/* Page content */}
        <div className="mx-auto max-w-400 px-4 md:px-8 py-6 md:py-8 animate-fade-up">
          {children}
        </div>
      </div>
    </div>
  );
}
