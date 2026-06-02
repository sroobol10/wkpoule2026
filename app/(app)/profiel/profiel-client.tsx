"use client";

import { useState, useTransition, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { setTheme } from "@/app/actions/profile";
import { AvatarCircle } from "@/components/avatar-circle";

type Profile = {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
};
type Score = {
  total_pts: number;
  exact_hits: number;
  correct_results: number;
  group_match_pts: number | null;
  group_standings_pts: number | null;
  knockout_pts: number | null;
  bonus_pre_pts: number | null;
  bonus_daily_pts: number | null;
  jokers_played: number | null;
};

type Accuracy = {
  playedPredCount: number;
  exactCount: number;
  correctDirectionCount: number;
  bracketScoredCount: number;
  bracketCorrectCount: number;
};

type Props = Readonly<{
  profile: Profile;
  score: Score | null;
  predCount: number;
  bonusCount: number;
  rank: number | null;
  pouleDeelnemers: number;
  currentTheme: string;
  accuracy: Accuracy;
}>;

export default function ProfielClient({
  profile,
  score,
  predCount,
  bonusCount,
  rank,
  pouleDeelnemers,
  currentTheme,
  accuracy,
}: Props) {
  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [isPending, startTransition] = useTransition();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [themeToast, setThemeToast] = useState<{
    msg: string;
    ok: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Afbeelding mag max. 2 MB zijn.", false);
      return;
    }

    setAvatarUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${profile.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      showToast("Upload mislukt.", false);
      setAvatarUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    // Voeg cache-buster toe zodat de nieuwe afbeelding direct zichtbaar is
    const urlWithBust = `${publicUrl}?t=${Date.now()}`;

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", profile.id);

    if (saveError) {
      showToast("Opslaan mislukt.", false);
    } else {
      setAvatarUrl(urlWithBust);
      showToast("Avatar bijgewerkt!", true);
    }
    setAvatarUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function saveUsername() {
    const trimmed = username.trim();
    if (!trimmed || trimmed === profile.username) return;
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ username: trimmed })
        .eq("id", profile.id);
      if (error) showToast("Opslaan mislukt.", false);
      else {
        showToast("Opgeslagen!", true);
        router.refresh();
      }
    });
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const totalPts = score?.total_pts ?? 0;

  const breakdown = [
    { label: "Groepswedstrijden", pts: score?.group_match_pts ?? 0 },
    { label: "Groepsklassering", pts: score?.group_standings_pts ?? 0 },
    { label: "Knockout", pts: score?.knockout_pts ?? 0 },
    { label: "Bonus vóór toernooi", pts: score?.bonus_pre_pts ?? 0 },
    { label: "Dagelijkse bonus", pts: score?.bonus_daily_pts ?? 0 },
  ].filter((r) => r.pts > 0);

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <AvatarCircle
            username={username || profile.email}
            avatarUrl={avatarUrl}
            size={64}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-wk-surface border border-white/20 flex items-center justify-center hover:border-wk-gold/50 transition-colors disabled:opacity-50"
            title="Avatar wijzigen"
          >
            {avatarUploading ? (
              <span className="font-mono text-[9px] text-wk-muted">…</span>
            ) : (
              <svg
                className="w-3 h-3 text-wk-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.828l-3 1 1-3a4 4 0 01.828-1.414z"
                />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">
            Account
          </p>
          <h1 className="font-display text-2xl text-wk-text uppercase leading-none">
            Profiel
          </h1>
          <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
            {profile.email}
          </p>
        </div>
      </div>

      {/* Rang + Totaal highlights */}
      <div className="grid grid-cols-2 gap-3">
        {rank !== null ? (
          <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-4">
            <p className="font-display text-3xl leading-none text-wk-gold">
              #{rank}
            </p>
            <p className="font-mono text-[10px] text-wk-muted mt-1.5 tracking-[0.12em] uppercase">
              van {pouleDeelnemers}
            </p>
            <p className="font-mono text-[9px] text-wk-muted/60 tracking-widest mt-0.5 uppercase">
              Rangpositie
            </p>
          </div>
        ) : (
          <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-4">
            <p className="font-display text-3xl leading-none text-wk-muted">
              —
            </p>
            <p className="font-mono text-[9px] text-wk-muted/60 tracking-widest mt-2 uppercase">
              Rangpositie
            </p>
          </div>
        )}
        <div className="bg-wk-surface border border-white/10 rounded-xl px-5 py-4">
          <p className="font-display text-3xl leading-none text-wk-gold">
            {totalPts}
          </p>
          <p className="font-mono text-[10px] text-wk-muted mt-1.5 tracking-[0.12em] uppercase">
            punten
          </p>
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-widest mt-0.5 uppercase">
            Totaalscore
          </p>
        </div>
      </div>

      {/* Puntenopbouw */}
      {breakdown.length > 0 && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-2">
            Puntenopbouw
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {breakdown.map(({ label, pts }) => {
              const pct = totalPts > 0 ? Math.round((pts / totalPts) * 100) : 0;
              return (
                <div key={label} className="px-5 py-3">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="flex-1 text-sm text-wk-soft">{label}</span>
                    <span className="font-mono text-sm font-bold text-wk-text shrink-0">
                      {pts} pt
                    </span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-wk-gold/60 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stats grid */}
      <section>
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-2">
          Statistieken
        </p>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value={score?.jokers_played ?? 0}
            label="Jokers"
            color="text-wk-gold"
          />
          <StatCard
            value={predCount}
            label="Voorspellingen"
            color="text-wk-text"
          />
          <StatCard
            value={bonusCount}
            label="Bonusvragen"
            color="text-wk-text"
          />
        </div>
      </section>

      {/* Nauwkeurigheid */}
      {(accuracy.playedPredCount > 0 || accuracy.bracketScoredCount > 0) && (
        <section>
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-2">
            Nauwkeurigheid
          </p>
          <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {accuracy.playedPredCount > 0 && (
              <>
                <AccuracyRow
                  label="Exacte uitslag geraden"
                  count={accuracy.exactCount}
                  total={accuracy.playedPredCount}
                  accent="gold"
                />
                <AccuracyRow
                  label="Correcte winnaar gekozen"
                  count={accuracy.correctDirectionCount}
                  total={accuracy.playedPredCount}
                  accent="blue"
                  note="W/D/L raak, ook als score niet klopte"
                />
              </>
            )}
            {accuracy.bracketScoredCount > 0 && (
              <AccuracyRow
                label="Bracket teams correct"
                count={accuracy.bracketCorrectCount}
                total={accuracy.bracketScoredCount}
                accent="green"
              />
            )}
          </div>
          {accuracy.playedPredCount > 0 && (
            <p className="font-mono text-[9px] text-wk-muted/60 tracking-widest mt-1.5">
              {accuracy.playedPredCount} gespeelde voorspellingen
            </p>
          )}
        </section>
      )}

      {/* Instellingen */}
      <div className="bg-wk-surface border border-white/10 rounded-xl p-5">
        <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-4">
          Instellingen
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5"
            >
              Gebruikersnaam
            </label>
            <div className="flex gap-2">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveUsername()}
                maxLength={30}
                className="flex-1 rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm text-wk-text focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
              />
              <button
                onClick={saveUsername}
                disabled={
                  isPending ||
                  !username.trim() ||
                  username.trim() === profile.username
                }
                className="rounded bg-wk-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? "…" : "Opslaan"}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase mb-1.5">
              E-mailadres
            </label>
            <p className="rounded bg-wk-bg2 border border-white/10 px-3 py-2 text-sm text-wk-muted font-mono tracking-widest">
              {profile.email}
            </p>
          </div>
        </div>
      </div>

      {/* Thema */}
      <div className="bg-wk-surface border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <p className="font-mono text-[10px] text-wk-muted tracking-[0.16em] uppercase">
            Thema
          </p>
        </div>
        <div className="p-5 space-y-3">
          {(
            [
              {
                id: "default",
                label: "Standaard",
                desc: "Donker stadion-thema",
                preview: "bg-[#0B0E14] border-[#F4B92E]/30",
                dot: "bg-[#F4B92E]",
              },
              {
                id: "retro-1988",
                label: "EK 1988 Retro",
                desc: "Oranje · Strijd · Passie · Glorie",
                preview: "bg-[#2A0800] border-[#FF6600]/40",
                dot: "bg-[#FF6600]",
              },
            ] as const
          ).map((t) => {
            const active = currentTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  startTransition(async () => {
                    const result = await setTheme(t.id);
                    setThemeToast({
                      msg: result.ok
                        ? `Thema "${t.label}" ingesteld!`
                        : result.error,
                      ok: result.ok,
                    });
                    setTimeout(() => setThemeToast(null), 3000);
                  });
                }}
                disabled={active || isPending}
                className={`w-full flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-wk-gold/50 bg-wk-gold/5"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div
                  className={`w-10 h-7 rounded shrink-0 border ${t.preview} flex items-center justify-center`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${active ? "text-wk-gold" : "text-wk-text"}`}
                  >
                    {t.label}
                  </p>
                  <p className="font-mono text-[10px] text-wk-muted tracking-widest">
                    {t.desc}
                  </p>
                </div>
                {active && (
                  <span className="font-mono text-[9px] text-wk-green border border-wk-green/30 rounded-full px-2 py-0.5 tracking-widest uppercase shrink-0">
                    Actief
                  </span>
                )}
              </button>
            );
          })}
          {themeToast && (
            <p
              className={`font-mono text-[10px] tracking-[0.12em] ${themeToast.ok ? "text-wk-green" : "text-wk-red"}`}
            >
              {themeToast.msg}
            </p>
          )}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full rounded border border-wk-red/30 px-4 py-2.5 text-sm font-mono font-medium text-wk-red hover:bg-wk-red/5 transition-colors tracking-[0.12em] uppercase"
      >
        Uitloggen
      </button>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 font-mono text-xs font-semibold shadow-lg text-white tracking-[0.12em] uppercase ${
            toast.ok ? "bg-wk-green" : "bg-wk-red"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-wk-surface border border-white/10 rounded-xl px-4 py-3">
      <p className={`font-display text-2xl leading-none ${color}`}>{value}</p>
      <p className="font-mono text-[10px] text-wk-muted mt-1 tracking-[0.12em] uppercase">
        {label}
      </p>
    </div>
  );
}

function AccuracyRow({
  label,
  count,
  total,
  accent,
  note,
}: {
  label: string;
  count: number;
  total: number;
  accent: "gold" | "blue" | "green";
  note?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor =
    accent === "gold"
      ? "bg-wk-gold"
      : accent === "blue"
        ? "bg-wk-blue"
        : "bg-wk-green";
  const textColor =
    accent === "gold"
      ? "text-wk-gold"
      : accent === "blue"
        ? "text-wk-blue"
        : "text-wk-green";
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="flex-1 text-sm font-semibold text-wk-text">
          {label}
        </span>
        {note && (
          <span className="font-mono text-[9px] text-wk-muted/60 hidden sm:inline">
            {note}
          </span>
        )}
        <span className="font-mono text-xs text-wk-muted shrink-0">
          {count}/{total}
        </span>
        <span
          className={`font-mono text-sm font-bold shrink-0 w-10 text-right ${textColor}`}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
