"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AvatarCircle } from "@/components/avatar-circle";
import {
  savePredictions,
  saveGroupAdvancement,
} from "@/app/actions/predictions";
import { toggleJoker } from "@/app/actions/jokers";
import { getMatchPrediction } from "@/app/actions/ai-prediction";
import { formatInAmsterdam } from "@/lib/format";
import { compareThirds, type ThirdEntry } from "@/lib/third-place";
import type { AiPrediction } from "@/app/actions/ai-prediction";

type Team = { id: string; name: string; flag_url: string; group_name: string };
type Match = {
  id: string;
  kickoff_at: string;
  match_number: number | null;
  home_score: number | null;
  away_score: number | null;
  result_entered: boolean;
  home_team: Team | null;
  away_team: Team | null;
};
type Prediction = {
  predicted_home: number;
  predicted_away: number;
  points_awarded: number | null;
};

type PouleEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalPts: number;
  rankChange: number | null;
};
type PouleStanding = {
  pouleId: string;
  pouleName: string;
  isGeneral: boolean;
  entries: PouleEntry[];
};
type GroupEntry = { userId: string; username: string; pts: number };
type PouleGroupStanding = {
  pouleId: string;
  byGroup: Record<string, GroupEntry[]>;
};

type Props = Readonly<{
  matches: Match[];
  predMap: Record<string, Prediction>;
  advancement: { team_id: string; predicted_position: number }[];
  teams: Team[];
  jokerMatchIds: string[];
  pouleStandings: PouleStanding[];
  pouleGroupStandings: PouleGroupStanding[];
  currentUserId: string;
}>;

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function ptsBadgeClass(pts: number) {
  if (pts >= 5) return "bg-wk-green/10 border-wk-green/30 text-wk-green";
  if (pts > 0) return "bg-wk-gold/10 border-wk-gold/30 text-wk-gold";
  return "bg-white/5 border-white/10 text-wk-muted";
}

export default function PredictionsClient({
  matches,
  predMap,
  jokerMatchIds,
  pouleStandings,
  pouleGroupStandings,
  currentUserId,
}: Props) {
  const router = useRouter();

  // Als punten al berekend zijn maar result_entered nog false → data is stale → ververs
  useEffect(() => {
    const isStale = matches.some(
      (m) => !m.result_entered && predMap[m.id]?.points_awarded != null,
    );
    if (isStale) router.refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeGroup, setActiveGroup] = useState("A");
  const [scores, setScores] = useState<
    Record<string, { home: string; away: string }>
  >(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const [matchId, pred] of Object.entries(predMap)) {
      init[matchId] = {
        home: String(pred.predicted_home),
        away: String(pred.predicted_away),
      };
    }
    return init;
  });
  const [showScoring, setShowScoring] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [jokerSet, setJokerSet] = useState<Set<string>>(
    () => new Set(jokerMatchIds),
  );
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  // Bereken doorstroom-picks voor saveGroupAdvancement:
  // - Positie 1 en 2 voor alle groepen (altijd door)
  // - Positie 3 voor de beste 8 nummers 3 (cross-groep vergelijking)
  // Sla ALLEEN op voor groepen zonder gespeelde wedstrijden: zodra admin heeft
  // gescoord overschrijft de auto-save de points_awarded waarden niet meer.
  function computeGroupStandings(): { teamId: string; position: number }[] {
    const picks: { teamId: string; position: number }[] = [];
    const thirds: ThirdEntry[] = [];

    // teamId → naam voor FIFA-ranking lookup
    const teamNames: Record<string, string> = {};
    for (const m of matches) {
      if (m.home_team) teamNames[m.home_team.id] = m.home_team.name;
      if (m.away_team) teamNames[m.away_team.id] = m.away_team.name;
    }

    for (const group of GROUPS) {
      const gm = matches.filter((m) => m.home_team?.group_name === group);

      // Groep overgeslagen als er al een wedstrijd is gespeeld (admin scoort die groepen)
      if (gm.some((m) => m.result_entered)) continue;
      const st: Record<string, { points: number; gd: number; gf: number }> = {};
      for (const m of gm) {
        if (m.home_team) st[m.home_team.id] ??= { points: 0, gd: 0, gf: 0 };
        if (m.away_team) st[m.away_team.id] ??= { points: 0, gd: 0, gf: 0 };
      }
      let hasScore = false;
      for (const m of gm) {
        const s = scores[m.id];
        if (
          !s ||
          s.home === "" ||
          s.away === "" ||
          !m.home_team ||
          !m.away_team
        )
          continue;
        hasScore = true;
        const h = Number(s.home),
          a = Number(s.away);
        st[m.home_team.id].gf += h;
        st[m.home_team.id].gd += h - a;
        st[m.away_team.id].gf += a;
        st[m.away_team.id].gd += a - h;
        if (h > a) st[m.home_team.id].points += 3;
        else if (h < a) st[m.away_team.id].points += 3;
        else {
          st[m.home_team.id].points += 1;
          st[m.away_team.id].points += 1;
        }
      }
      if (!hasScore) continue;

      const sorted = Object.entries(st).sort(
        ([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf,
      );

      if (sorted[0]) picks.push({ teamId: sorted[0][0], position: 1 });
      if (sorted[1]) picks.push({ teamId: sorted[1][0], position: 2 });
      if (sorted[2])
        thirds.push({
          group,
          teamId: sorted[2][0],
          name: teamNames[sorted[2][0]] ?? "",
          ...sorted[2][1],
        });
    }

    // Sla positie 3 op voor de beste 8 nummers 3 — gesorteerd op FIFA-regels
    const best8 = [...thirds].sort(compareThirds).slice(0, 8);
    for (const t of best8) picks.push({ teamId: t.teamId, position: 3 });

    return picks;
  }

  // Bereken beste 8 nummers 3 voor KO-weergave (posities 1–3 per groep)
  function computeAdvancementPicks(): Record<
    string,
    [string | null, string | null, string | null]
  > {
    const result: Record<
      string,
      [string | null, string | null, string | null]
    > = {};
    const thirds: ThirdEntry[] = [];

    // teamId → naam voor FIFA-ranking lookup
    const teamNames: Record<string, string> = {};
    for (const m of matches) {
      if (m.home_team) teamNames[m.home_team.id] = m.home_team.name;
      if (m.away_team) teamNames[m.away_team.id] = m.away_team.name;
    }

    for (const group of GROUPS) {
      const gm = matches.filter((m) => m.home_team?.group_name === group);
      const st: Record<string, { points: number; gd: number; gf: number }> = {};
      for (const m of gm) {
        if (m.home_team) st[m.home_team.id] ??= { points: 0, gd: 0, gf: 0 };
        if (m.away_team) st[m.away_team.id] ??= { points: 0, gd: 0, gf: 0 };
      }
      for (const m of gm) {
        const s = scores[m.id];
        if (
          !s ||
          s.home === "" ||
          s.away === "" ||
          !m.home_team ||
          !m.away_team
        )
          continue;
        const h = Number(s.home),
          aw = Number(s.away);
        st[m.home_team.id].gf += h;
        st[m.home_team.id].gd += h - aw;
        st[m.away_team.id].gf += aw;
        st[m.away_team.id].gd += aw - h;
        if (h > aw) st[m.home_team.id].points += 3;
        else if (h < aw) st[m.away_team.id].points += 3;
        else {
          st[m.home_team.id].points += 1;
          st[m.away_team.id].points += 1;
        }
      }
      const sorted = Object.entries(st).sort(
        ([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf,
      );
      result[group] = [
        sorted[0]?.[0] ?? null,
        sorted[1]?.[0] ?? null,
        sorted[2]?.[0] ?? null,
      ];
      if (sorted[2])
        thirds.push({
          group,
          teamId: sorted[2][0],
          name: teamNames[sorted[2][0]] ?? "",
          ...sorted[2][1],
        });
    }

    const best8 = new Set(
      [...thirds]
        .sort(compareThirds)
        .slice(0, 8)
        .map((t) => t.group),
    );
    for (const group of GROUPS) {
      if (!best8.has(group))
        result[group] = [result[group][0], result[group][1], null];
    }
    return result;
  }

  async function handleJokerToggle(matchId: string) {
    const result = await toggleJoker(matchId);
    if (!result.ok) return;

    const targetGroup =
      matches.find((x) => x.id === matchId)?.home_team?.group_name ?? null;

    setJokerSet((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        // Verwijder bestaande joker voor een andere wedstrijd in dezelfde groep
        if (targetGroup) {
          for (const m of matches) {
            if (m.id !== matchId && m.home_team?.group_name === targetGroup) {
              next.delete(m.id);
            }
          }
        }
        next.add(matchId);
      }
      return next;
    });
  }

  const now = new Date();

  const groupMatches = matches.filter(
    (m) => m.home_team?.group_name === activeGroup,
  );

  const filledCount = matches.filter((m) => {
    const s = scores[m.id];
    return s?.home !== "" && s?.away !== "" && s?.home !== undefined;
  }).length;

  function setScore(matchId: string, side: "home" | "away", val: string) {
    const num = val.replace(/\D/g, "").slice(0, 2);
    const current = scores[matchId] ?? { home: "", away: "" };
    const newScore = { ...current, [side]: num };
    setScores((prev) => ({ ...prev, [matchId]: newScore }));
    if (newScore.home !== "" && newScore.away !== "") {
      clearTimeout(autoSaveTimers.current[matchId]);
      setSaveStatus("idle");
      autoSaveTimers.current[matchId] = setTimeout(async () => {
        setSaveStatus("saving");
        const result = await savePredictions([
          { matchId, home: Number(newScore.home), away: Number(newScore.away) },
        ]);
        if (result.ok) {
          // Groepsstand-koppeling bevroren zodra toernooi is gestart (eerste match gespeeld)
          const tournamentStarted = matches.some((m) => m.result_entered);
          if (!tournamentStarted) {
            const standingPicks = computeGroupStandings();
            if (standingPicks.length > 0) {
              saveGroupAdvancement(standingPicks).catch(() => {});
            }
          }
        }
        setSaveStatus(result.ok ? "saved" : "error");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }, 1500);
    }
  }

  const advancementPicks = computeAdvancementPicks();

  const hasActualResults = groupMatches.some((m) => m.result_entered);

  const standingsPanel = (
    <div className="space-y-3">
      {/* Huidige stand — alleen tonen als er al uitslagen zijn */}
      {hasActualResults && (
        <ActualGroupStandingsInline
          group={activeGroup}
          groupMatches={groupMatches}
        />
      )}
      {/* Voorspelde stand */}
      <GroupStandingsInline
        group={activeGroup}
        groupMatches={groupMatches}
        scores={scores}
        advancementPicks={advancementPicks[activeGroup] ?? [null, null, null]}
      />
    </div>
  );

  return (
    <div className="md:grid md:grid-cols-3 md:gap-6 md:items-start">
      {/* 2/3: voorspellingen + controls */}
      <div className="space-y-6 md:col-span-2">
        {/* Mobiel: Hoe werkt het? — volledige breedte */}
        <a
          href="/hoe-werkt-het"
          className="md:hidden flex items-center justify-center gap-2 w-full font-mono text-[10px] text-wk-muted hover:text-wk-gold tracking-[0.14em] uppercase transition-colors border border-white/10 hover:border-wk-gold/30 rounded-xl py-3"
        >
          Hoe werkt het? →
        </a>
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="font-mono text-[10px] text-wk-red tracking-[0.2em] uppercase mb-1">
              Fase 01 · Vooraf invullen
            </p>
            <h1 className="font-display text-2xl text-wk-text uppercase leading-none">
              Groepsfase
            </h1>
            <p className="font-mono text-xs text-wk-muted mt-1 tracking-[0.12em]">
              {filledCount} / {matches.length} wedstrijden ingevuld
            </p>
          </div>
          <a
            href="/groepen"
            className="font-mono text-[10px] text-wk-muted hover:text-wk-gold tracking-[0.14em] uppercase transition-colors border border-white/10 hover:border-wk-gold/30 rounded-full px-3 py-1.5 shrink-0"
          >
            Groepsinfo →
          </a>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-wk-green rounded-full transition-all"
            style={{ width: `${(filledCount / matches.length) * 100}%` }}
          />
        </div>

        {/* Scoring info */}
        <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
          <button
            onClick={() => setShowScoring((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
              Puntentelling
            </span>
            <svg
              className={`w-3.5 h-3.5 text-wk-muted transition-transform ${showScoring ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showScoring && (
            <div className="border-t border-white/5 px-5 py-4 space-y-2.5">
              {[
                { label: "Exacte uitslag", pts: "10 punten" },
                { label: "Correct resultaat (W/G/V)", pts: "5 punten" },
                {
                  label: "Correct resultaat + één doelpunttotaal",
                  pts: "7 punten",
                },
                {
                  label: "Fout resultaat + één doelpunttotaal",
                  pts: "2 punten",
                },
                { label: "Correcte eindpositie in de groep", pts: "5 punten" },
              ].map(({ label, pts }) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="font-mono text-[10px] text-wk-soft tracking-widest">
                    {label}
                  </span>
                  <span className="font-mono text-xs font-bold text-wk-gold shrink-0">
                    {pts}
                  </span>
                </div>
              ))}
              <p className="font-mono text-[9px] text-wk-muted tracking-widest pt-2 border-t border-white/5">
                Je hebt de mogelijkheid om in elke groep op één van de zes
                wedstrijden een joker in te zetten.
              </p>
              <p className="font-mono text-[9px] text-wk-muted tracking-widest">
                Een joker zorgt voor een verdubbeling van het aantal punten dat
                je behaalt in deze wedstrijd.
              </p>
            </div>
          )}
        </div>

        {/* Group tabs */}
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => {
            const gMatches = matches.filter(
              (m) => m.home_team?.group_name === g,
            );
            const filled = gMatches.filter(
              (m) =>
                scores[m.id]?.home !== undefined && scores[m.id]?.home !== "",
            ).length;
            const groupJoker = gMatches.some((m) => jokerSet.has(m.id));
            return (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`relative rounded px-3 py-1.5 text-xs font-mono font-bold tracking-[0.14em] uppercase transition-colors ${
                  activeGroup === g
                    ? "bg-wk-surface border border-wk-gold/50 text-wk-gold"
                    : "bg-wk-bg2 border border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft"
                }`}
              >
                {g}
                {filled === gMatches.length && gMatches.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-wk-green text-white text-[7px] font-mono">
                    ✓
                  </span>
                )}
                {groupJoker &&
                  !(filled === gMatches.length && gMatches.length > 0) && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-wk-gold text-black text-[7px] font-mono">
                      ★
                    </span>
                  )}
              </button>
            );
          })}
        </div>

        {/* Matches for active group */}
        <div className="bg-wk-surface rounded-xl border border-white/10 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm text-wk-text uppercase tracking-wide">
                Groep {activeGroup}
              </span>
              <a
                href={`/groep/${activeGroup}`}
                className="font-mono text-[9px] text-wk-muted hover:text-wk-gold tracking-widest uppercase transition-colors border border-white/10 hover:border-wk-gold/30 rounded-full px-2 py-0.5"
              >
                ℹ details
              </a>
            </div>
            <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
              {
                groupMatches.filter(
                  (m) =>
                    scores[m.id]?.home !== undefined &&
                    scores[m.id]?.home !== "",
                ).length
              }
              /{groupMatches.length} ingevuld
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {groupMatches.map((match) => {
              const locked =
                new Date(match.kickoff_at) <= now || match.result_entered;
              const score = scores[match.id];
              const pred = predMap[match.id];
              const pts = pred?.points_awarded;
              const exactScore =
                match.result_entered &&
                pred != null &&
                match.home_score !== null &&
                match.away_score !== null &&
                pred.predicted_home === match.home_score &&
                pred.predicted_away === match.away_score;
              // Joker-wijziging geblokkeerd als er al een wedstrijd in de groep gespeeld is
              const anyGroupMatchPlayed = groupMatches.some(
                (m) => m.result_entered,
              );
              return (
                <MatchRow
                  key={match.id}
                  match={match}
                  score={score}
                  pts={pts}
                  locked={locked}
                  hasJoker={jokerSet.has(match.id)}
                  jokerLocked={anyGroupMatchPlayed}
                  exactScore={exactScore}
                  onScoreChange={setScore}
                  onJokerToggle={handleJokerToggle}
                />
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-white/10 flex justify-end items-center min-h-11">
            {saveStatus === "saving" && (
              <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase animate-pulse">
                Opslaan…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="font-mono text-[10px] text-wk-green tracking-[0.14em] uppercase animate-check-in">
                ✓ Automatisch opgeslagen
              </span>
            )}
            {saveStatus === "error" && (
              <span className="font-mono text-[10px] text-wk-red tracking-[0.14em] uppercase">
                Fout bij opslaan
              </span>
            )}
          </div>
        </div>

        {/* Mobile: groepstand + tussenstand onder de wedstrijden */}
        <div className="md:hidden space-y-6">
          {standingsPanel}
          {pouleStandings.length > 0 && (
            <PouleMiniLeaderboard
              poules={pouleStandings}
              groupStandings={pouleGroupStandings}
              currentUserId={currentUserId}
              activeGroup={activeGroup}
            />
          )}
        </div>
      </div>

      {/* 1/3: groepstand + tussenstand (sticky sidebar, desktop only) */}
      <aside className="hidden md:block md:col-span-1">
        <div className="sticky top-6 space-y-4">
          {standingsPanel}
          {pouleStandings.length > 0 && (
            <PouleMiniLeaderboard
              poules={pouleStandings}
              groupStandings={pouleGroupStandings}
              currentUserId={currentUserId}
              activeGroup={activeGroup}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Poule mini-leaderboard ───────────────────────────────────────────────────

function PouleMiniLeaderboard({
  poules,
  groupStandings,
  currentUserId,
  activeGroup,
}: {
  poules: PouleStanding[];
  groupStandings: PouleGroupStanding[];
  currentUserId: string;
  activeGroup: string;
}) {
  // Privé-poules → anders de algemene poule
  const customPoules = poules.filter((p) => !p.isGeneral);
  const displayPoules =
    customPoules.length > 0 ? customPoules : poules.filter((p) => p.isGeneral);

  const [activeIdx, setActiveIdx] = useState(0);

  if (displayPoules.length === 0) return null;

  const poule = displayPoules[activeIdx] ?? displayPoules[0];
  const globalIdx = poules.findIndex((p) => p.pouleId === poule.pouleId);
  const pouleGroupData = groupStandings[globalIdx];
  const groupEntries = pouleGroupData?.byGroup[activeGroup] ?? [];
  const TOP = 10;

  return (
    <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
      {/* Header: groep + poulekeuze */}
      <div className="px-4 pt-3 pb-2 border-b border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
            Groep {activeGroup}
          </span>
          {/* Poulekeuze — alleen tonen als er meerdere privé-poules zijn */}
          {displayPoules.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {displayPoules.map((p, i) => (
                <button
                  key={p.pouleId}
                  onClick={() => setActiveIdx(i)}
                  className={`rounded px-2 py-0.5 font-mono text-[9px] tracking-widest uppercase border transition-colors max-w-28 truncate ${
                    i === activeIdx
                      ? "bg-wk-gold/10 border-wk-gold/40 text-wk-gold"
                      : "border-white/10 text-wk-muted hover:border-white/20 hover:text-wk-soft"
                  }`}
                  title={p.pouleName}
                >
                  {p.pouleName}
                </button>
              ))}
            </div>
          )}
          {/* Één privé-poule of algemeen: naam tonen */}
          {displayPoules.length === 1 && (
            <span className="font-mono text-[10px] text-wk-muted truncate max-w-32">
              {poule.pouleName}
            </span>
          )}
        </div>
      </div>

      {/* Standings */}
      {groupEntries.length === 0 ? (
        <div className="px-5 py-4 text-center font-mono text-[10px] text-wk-muted tracking-widest">
          Nog geen punten voor groep {activeGroup}
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {groupEntries.slice(0, TOP).map((entry, i) => {
            const isCurrentUser = entry.userId === currentUserId;
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-2 px-4 py-2 ${isCurrentUser ? "bg-wk-gold/5" : ""}`}
              >
                <div className="w-5 text-center shrink-0">
                  {i < 3 ? (
                    <span className="text-xs">{medals[i]}</span>
                  ) : (
                    <span className="font-mono text-[10px] text-wk-muted">
                      {i + 1}
                    </span>
                  )}
                </div>
                <span
                  className={`flex-1 text-xs truncate ${isCurrentUser ? "font-bold text-wk-gold" : "text-wk-text"}`}
                >
                  {entry.username}
                </span>
                <span className="font-display text-sm text-wk-gold shrink-0">
                  {entry.pts}
                </span>
                <span className="font-mono text-[9px] text-wk-muted shrink-0">
                  pt
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-white/10">
        <a
          href={`/poules/${poule.pouleId}`}
          className="font-mono text-[9px] text-wk-muted hover:text-wk-gold tracking-widest uppercase transition-colors"
        >
          Volledig klassement →
        </a>
      </div>
    </div>
  );
}

// ─── Match row ─────────────────────────────────────────────────────────────────

type MatchRowProps = {
  match: Match;
  score: { home: string; away: string } | undefined;
  pts: number | null | undefined;
  locked: boolean;
  hasJoker: boolean;
  jokerLocked: boolean;
  exactScore: boolean;
  onScoreChange: (matchId: string, side: "home" | "away", val: string) => void;
  onJokerToggle: (matchId: string) => void;
};

function MatchRow({
  match,
  score,
  pts,
  locked,
  hasJoker,
  jokerLocked,
  exactScore,
  onScoreChange,
  onJokerToggle,
}: MatchRowProps) {
  const [showAi, setShowAi] = useState(false);
  const [aiState, setAiState] = useState<
    AiPrediction | "loading" | "error" | null
  >(null);

  // Joker-knop zichtbaar: match nog niet gespeeld én geen wedstrijd in de groep gespeeld
  const jokerable = !locked && !jokerLocked;

  async function handleAiToggle() {
    if (showAi) {
      setShowAi(false);
      return;
    }
    setShowAi(true);
    if (aiState !== null) return;
    setAiState("loading");
    const result = await getMatchPrediction(match.id);
    setAiState(result.ok ? result.prediction : "error");
  }

  return (
    <div className={exactScore ? "bg-wk-gold/[0.12]" : ""}>
      {/* Date + joker row */}
      <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-3 sm:pb-4">
        {/* Datum-rij: joker links · datum midden · punten rechts */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center mb-3">
          {/* Joker-indicator links bovenin (zodra wedstrijd gespeeld) */}
          <div className="flex justify-start">
            {hasJoker && locked && (
              <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-wk-gold border border-wk-gold/60 bg-wk-gold/15 rounded-full px-2 py-0.5 tracking-[0.12em] uppercase">
                <span className="text-xs">★</span> Joker
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 justify-center">
            <p className="font-mono text-[10px] text-wk-muted tracking-[0.12em] uppercase">
              {formatInAmsterdam(match.kickoff_at, "EEEE d MMMM · HH:mm")}
            </p>
            {locked && !match.result_entered && (
              <span className="text-wk-muted text-xs">🔒</span>
            )}
          </div>
          {/* Punten rechtsboven */}
          <div className="flex justify-end">
            {match.result_entered && pts !== null && pts !== undefined && (
              <span
                className={`font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full border tracking-[0.12em] uppercase ${ptsBadgeClass(pts)}`}
              >
                {pts} pt
              </span>
            )}
          </div>
        </div>

        {/* Joker toggle — prominenter, eigen rij */}
        {jokerable && (
          <div className="flex justify-center mb-3">
            <button
              onClick={() => onJokerToggle(match.id)}
              title={
                hasJoker
                  ? "Joker uitzetten"
                  : "Joker inzetten (verdubbelt punten)"
              }
              className={`flex items-center gap-1.5 font-mono text-xs font-bold transition-all rounded-full px-3 py-1 border ${
                hasJoker
                  ? "text-wk-gold border-wk-gold/60 bg-wk-gold/15 shadow-[0_0_8px_rgba(var(--color-wk-gold-raw),0.2)]"
                  : "text-wk-muted border-white/15 bg-wk-bg2 hover:text-wk-gold hover:border-wk-gold/40 hover:bg-wk-gold/5"
              }`}
            >
              <span className="text-sm">★</span>
              <span className="tracking-[0.12em] uppercase">Joker</span>
            </button>
          </div>
        )}

        {/* Match row */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 w-full">
            {/* Home team */}
            <div className="flex-1 flex items-center gap-1 sm:gap-2 justify-end min-w-0">
              <span className="text-[11px] sm:text-sm font-semibold text-wk-text text-right leading-tight truncate">
                {match.home_team?.name}
              </span>
              {match.home_team?.flag_url && (
                <Image
                  src={match.home_team.flag_url}
                  alt={match.home_team.name}
                  width={24}
                  height={17}
                  className="rounded-sm object-cover shrink-0 w-6 h-[17px] sm:w-7 sm:h-5"
                />
              )}
            </div>

            {/* Score */}
            <div className="shrink-0 text-center">
              {match.result_entered ? (
                <div className="flex items-center gap-1">
                  <span className="w-10 sm:w-12 text-center py-1.5 text-sm font-display font-bold text-wk-gold tabular-nums">
                    {score?.home ?? "–"}
                  </span>
                  <span className="text-wk-muted font-mono text-xs sm:text-sm">
                    :
                  </span>
                  <span className="w-10 sm:w-12 text-center py-1.5 text-sm font-display font-bold text-wk-gold tabular-nums">
                    {score?.away ?? "–"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    disabled={locked}
                    value={score?.home ?? ""}
                    onChange={(e) =>
                      onScoreChange(match.id, "home", e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (
                        !/^[0-9Backspace Delete ArrowLeft ArrowRight Tab]/.test(
                          e.key,
                        )
                      )
                        e.preventDefault();
                    }}
                    maxLength={2}
                    className="w-10 sm:w-12 text-center rounded bg-wk-bg2 border border-white/10 py-1.5 text-sm font-display text-wk-gold disabled:text-wk-muted disabled:opacity-60 focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                    placeholder="–"
                  />
                  <span className="text-wk-muted font-mono text-xs sm:text-sm">
                    :
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    disabled={locked}
                    value={score?.away ?? ""}
                    onChange={(e) =>
                      onScoreChange(match.id, "away", e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (
                        !/^[0-9Backspace Delete ArrowLeft ArrowRight Tab]/.test(
                          e.key,
                        )
                      )
                        e.preventDefault();
                    }}
                    maxLength={2}
                    className="w-10 sm:w-12 text-center rounded bg-wk-bg2 border border-white/10 py-1.5 text-sm font-display text-wk-gold disabled:text-wk-muted disabled:opacity-60 focus:border-wk-gold focus:outline-none focus:ring-2 focus:ring-wk-gold/20 transition"
                    placeholder="–"
                  />
                </div>
              )}
            </div>

            {/* Away team */}
            <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
              {match.away_team?.flag_url && (
                <Image
                  src={match.away_team.flag_url}
                  alt={match.away_team.name ?? ""}
                  width={24}
                  height={17}
                  className="rounded-sm object-cover shrink-0 w-6 h-[17px] sm:w-7 sm:h-5"
                />
              )}
              <span className="text-[11px] sm:text-sm font-semibold text-wk-text leading-tight truncate">
                {match.away_team?.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Uitslag tonen als wedstrijd gespeeld, anders AI toggle */}
      {match.result_entered ? (
        <div className="px-5 pt-2 pb-4 flex justify-center">
          <p className="font-mono text-[10px] text-wk-muted tracking-widest">
            Uitslag: {match.home_score}–{match.away_score}
          </p>
        </div>
      ) : (
        <div className="px-5 pt-2 pb-4">
          <button
            onClick={handleAiToggle}
            className={`flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors w-full ${
              showAi ? "text-wk-blue" : "text-wk-muted hover:text-wk-soft"
            }`}
          >
            <span className="text-[11px]">⚡</span>
            AI voorspelling
            <svg
              className={`w-3 h-3 transition-transform ${showAi ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showAi && (
            <AiPredictionPanel
              state={aiState}
              homeName={match.home_team?.name ?? ""}
              awayName={match.away_team?.name ?? ""}
            />
          )}
        </div>
      )}
    </div>
  );
}


// ─── AI prediction panel ──────────────────────────────────────────────────────

function AiPredictionPanel({
  state,
  homeName,
  awayName,
}: {
  state: AiPrediction | "loading" | "error" | null;
  homeName: string;
  awayName: string;
}) {
  if (state === "loading" || state === null) {
    return (
      <div className="mt-3 rounded-lg bg-wk-bg2 border border-white/10 px-4 py-4">
        <div className="flex items-center gap-2 text-wk-muted">
          <svg
            className="w-3.5 h-3.5 animate-spin shrink-0"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8z"
            />
          </svg>
          <span className="font-mono text-[10px] tracking-[0.12em]">
            Analyse wordt gegenereerd…
          </span>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mt-3 rounded-lg bg-wk-red/5 border border-wk-red/20 px-4 py-3">
        <p className="font-mono text-[10px] text-wk-red tracking-[0.12em]">
          Analyse kon niet worden geladen.
        </p>
      </div>
    );
  }

  const total = state.kansThuis + state.kansGelijkspel + state.kansUit;
  const pThuis = total > 0 ? Math.round((state.kansThuis / total) * 100) : 0;
  const pGelijk =
    total > 0 ? Math.round((state.kansGelijkspel / total) * 100) : 0;
  const pUit = 100 - pThuis - pGelijk;

  return (
    <div className="mt-3 rounded-lg bg-wk-bg2 border border-wk-blue/20 overflow-hidden md:max-w-lg md:mx-auto">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-wk-blue/5">
        <span className="text-[11px]">⚡</span>
        <span className="font-mono text-[10px] text-wk-blue tracking-[0.14em] uppercase font-bold">
          AI Voorspelling
        </span>
        <span className="ml-auto font-mono text-[9px] text-wk-muted tracking-widest uppercase">
          Op basis van FIFA-ranking & statistieken
        </span>
      </div>

      <div className="px-4 py-3 space-y-4">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase text-right">
              {homeName}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-display text-xl text-wk-gold">
                {state.homeScore}
              </span>
              <span className="font-mono text-sm text-wk-muted">–</span>
              <span className="font-display text-xl text-wk-gold">
                {state.awayScore}
              </span>
            </div>
            <span className="font-mono text-[10px] text-wk-muted tracking-widest uppercase">
              {awayName}
            </span>
          </div>
          <p className="font-mono text-[9px] text-wk-muted/60 tracking-[0.18em] uppercase">
            Voorspeld resultaat
          </p>
        </div>

        <div>
          <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
            <div
              className="bg-wk-blue rounded-l-full transition-all"
              style={{ width: `${pThuis}%` }}
            />
            <div
              className="bg-white/20 transition-all"
              style={{ width: `${pGelijk}%` }}
            />
            <div
              className="bg-wk-gold/70 rounded-r-full transition-all"
              style={{ width: `${pUit}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="font-mono text-[9px] text-wk-blue tracking-widest">
              {pThuis}% winst
            </span>
            <span className="font-mono text-[9px] text-wk-muted tracking-widest">
              {pGelijk}% gelijk
            </span>
            <span className="font-mono text-[9px] text-wk-gold tracking-widest">
              {pUit}% winst
            </span>
          </div>
        </div>

        <p className="text-xs text-wk-soft leading-relaxed">{state.analyse}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-wk-surface border border-white/5 px-3 py-2">
            <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase mb-1">
              Sleutelspeler
            </p>
            <p className="text-xs text-wk-text leading-snug">
              {state.sleutelspelerThuis}
            </p>
          </div>
          <div className="rounded bg-wk-surface border border-white/5 px-3 py-2">
            <p className="font-mono text-[9px] text-wk-muted tracking-widest uppercase mb-1">
              Sleutelspeler
            </p>
            <p className="text-xs text-wk-text leading-snug">
              {state.sleutelspelerUit}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline group standings ───────────────────────────────────────────────────

// ─── Actuele groepsstand (op basis van werkelijke uitslagen) ─────────────────

function ActualGroupStandingsInline({
  group,
  groupMatches,
}: {
  group: string;
  groupMatches: Match[];
}) {
  const teamMap: Record<string, Team> = {};
  for (const m of groupMatches) {
    if (m.home_team) teamMap[m.home_team.id] = m.home_team;
    if (m.away_team) teamMap[m.away_team.id] = m.away_team;
  }

  const st: Record<
    string,
    { points: number; gd: number; gf: number; played: number }
  > = {};
  for (const m of groupMatches) {
    if (m.home_team)
      st[m.home_team.id] ??= { points: 0, gd: 0, gf: 0, played: 0 };
    if (m.away_team)
      st[m.away_team.id] ??= { points: 0, gd: 0, gf: 0, played: 0 };
  }

  let playedCount = 0;
  for (const m of groupMatches) {
    if (!m.result_entered || m.home_score == null || m.away_score == null)
      continue;
    if (!m.home_team || !m.away_team) continue;
    playedCount++;
    const h = m.home_score,
      a = m.away_score;
    st[m.home_team.id].gf += h;
    st[m.home_team.id].gd += h - a;
    st[m.home_team.id].played++;
    st[m.away_team.id].gf += a;
    st[m.away_team.id].gd += a - h;
    st[m.away_team.id].played++;
    if (h > a) st[m.home_team.id].points += 3;
    else if (h < a) st[m.away_team.id].points += 3;
    else {
      st[m.home_team.id].points += 1;
      st[m.away_team.id].points += 1;
    }
  }

  if (playedCount === 0) return null;

  const sorted = Object.entries(st).sort(
    ([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
          Huidige stand groep {group}
        </span>
        <span className="font-mono text-[9px] text-wk-muted/60 tracking-widest">
          {playedCount}/{groupMatches.length} gespeeld
        </span>
      </div>
      <div className="divide-y divide-white/5">
        {sorted.map(([teamId, stat], i) => {
          const team = teamMap[teamId];
          if (!team) return null;
          const pos = i + 1;
          return (
            <div key={teamId} className="flex items-center gap-3 px-5 py-2">
              <span
                className={`font-mono text-xs w-4 shrink-0 text-center ${pos <= 2 ? "text-wk-green font-bold" : "text-wk-muted"}`}
              >
                {pos}
              </span>
              {team.flag_url && (
                <Image
                  src={team.flag_url}
                  alt={team.name}
                  width={20}
                  height={14}
                  className="rounded-sm object-cover shrink-0"
                  style={{ width: 20, height: 14 }}
                />
              )}
              <span className="flex-1 text-xs font-semibold text-wk-text truncate">
                {team.name}
              </span>
              <span className="font-mono text-[10px] text-wk-muted w-5 text-center">
                {stat.played}
              </span>
              <span className="font-mono text-[10px] font-bold text-wk-gold w-5 text-center">
                {stat.points}
              </span>
              <span className="font-mono text-[10px] text-wk-muted w-8 text-right">
                {stat.gd > 0 ? `+${stat.gd}` : stat.gd}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Voorspelde groepsstand ───────────────────────────────────────────────────

function GroupStandingsInline({
  group,
  groupMatches,
  scores,
  advancementPicks,
}: {
  group: string;
  groupMatches: Match[];
  scores: Record<string, { home: string; away: string }>;
  advancementPicks: [string | null, string | null, string | null];
}) {
  const st: Record<string, { points: number; gd: number; gf: number }> = {};
  for (const m of groupMatches) {
    if (m.home_team) st[m.home_team.id] ??= { points: 0, gd: 0, gf: 0 };
    if (m.away_team) st[m.away_team.id] ??= { points: 0, gd: 0, gf: 0 };
  }

  // Team-lookup vanuit de wedstrijden zelf
  const teamMap: Record<string, Team> = {};
  for (const m of groupMatches) {
    if (m.home_team) teamMap[m.home_team.id] = m.home_team;
    if (m.away_team) teamMap[m.away_team.id] = m.away_team;
  }

  // Altijd eigen voorspellingen gebruiken — nooit werkelijke uitslagen
  // (ActualGroupStandingsInline toont de werkelijke stand apart hierboven)
  let hasAnyScore = false;

  for (const m of groupMatches) {
    const s = scores[m.id];
    if (!s || s.home === "" || s.away === "" || !m.home_team || !m.away_team)
      continue;
    hasAnyScore = true;
    const h = Number(s.home),
      a = Number(s.away);
    st[m.home_team.id].gf += h;
    st[m.home_team.id].gd += h - a;
    st[m.away_team.id].gf += a;
    st[m.away_team.id].gd += a - h;
    if (h > a) st[m.home_team.id].points += 3;
    else if (h < a) st[m.away_team.id].points += 3;
    else {
      st[m.home_team.id].points += 1;
      st[m.away_team.id].points += 1;
    }
  }

  const sorted = Object.entries(st).sort(
    ([, x], [, y]) => y.points - x.points || y.gd - x.gd || y.gf - x.gf,
  );

  // Nummer 3 die door is, op basis van beste-8-berekening
  const advancingThird = advancementPicks[2];

  const standingLabel = `Jouw prognose groep ${group}`;

  return (
    <div className="rounded-xl border border-white/10 bg-wk-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-wk-muted tracking-[0.14em] uppercase">
          {standingLabel}
        </span>
        {!hasAnyScore && (
          <span className="font-mono text-[9px] text-wk-muted/60 tracking-widest uppercase italic">
            Vul wedstrijden in
          </span>
        )}
      </div>
      <div className="divide-y divide-white/5">
        {sorted.map(([teamId, stat], i) => {
          const team = teamMap[teamId];
          if (!team) return null;
          const pos = i + 1;

          // Bepaal doorstroom-status
          let statusLabel: string;
          let statusClass: string;
          if (pos <= 2) {
            statusLabel = "→ Door";
            statusClass = "text-wk-green";
          } else if (pos === 3) {
            if (advancingThird === teamId) {
              statusLabel = "→ Door";
              statusClass = "text-wk-green";
            } else {
              statusLabel = "✗ Uit";
              statusClass = "text-wk-red/70";
            }
          } else {
            statusLabel = "✗ Uit";
            statusClass = "text-wk-red/70";
          }

          return (
            <div key={teamId} className="flex items-center gap-3 px-5 py-2.5">
              <span
                className={`font-mono text-xs w-4 shrink-0 text-center ${pos <= 2 ? "text-wk-green font-bold" : "text-wk-muted"}`}
              >
                {pos}
              </span>
              {team.flag_url && (
                <Image
                  src={team.flag_url}
                  alt={team.name}
                  width={22}
                  height={15}
                  className="rounded-sm object-cover shrink-0"
                />
              )}
              <span className="flex-1 text-xs font-semibold text-wk-text truncate">
                {team.name}
              </span>
              {hasAnyScore && (
                <>
                  <span className="font-mono text-[10px] text-wk-muted w-5 text-center shrink-0">
                    {stat.points}pt
                  </span>
                  <span className="font-mono text-[10px] text-wk-muted w-7 text-right shrink-0">
                    {stat.gd > 0 ? `+${stat.gd}` : stat.gd}
                  </span>
                  <span
                    className={`font-mono text-[9px] tracking-widest uppercase shrink-0 w-14 text-right ${statusClass}`}
                  >
                    {statusLabel}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
