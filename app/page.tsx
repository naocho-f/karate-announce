"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Fighter, Match, Tournament } from "@/lib/types";
import { fighterFullName } from "@/lib/types";
import { BracketView } from "@/lib/bracket-view";

type TournamentData = {
  tournament: Tournament;
  matches: Match[];
  nameMap: Record<string, string>;
  affiliationMap: Record<string, string>;
};

type CourtData = {
  courtNum: number;
  tournaments: TournamentData[];
};

function CourtCard({
  courtNum,
  tournaments,
  courtNames,
}: {
  courtNum: number;
  tournaments: TournamentData[];
  courtNames?: string[] | null;
}) {
  const courtName = courtNames?.[courtNum - 1]?.trim() || `コート${courtNum}`;
  return (
    <div className="bg-gray-800/80 border border-gray-700/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600/40">
        <h2 className="font-semibold">{courtName}</h2>
        <Link
          href={`/court/${courtNum}`}
          className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition"
        >
          アナウンス →
        </Link>
      </div>
      <div className="p-4 space-y-6">
        {tournaments.length === 0 ? (
          <p className="text-sm text-gray-500">対戦表未設定</p>
        ) : (
          tournaments.map(({ tournament, matches, nameMap, affiliationMap }) => (
            <div key={tournament.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-200">{tournament.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${tournament.status === "ongoing" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"}`}
                >
                  {tournament.status === "ongoing" ? "進行中" : "準備中"}
                </span>
              </div>
              {matches.length === 0 ? (
                <p className="text-xs text-gray-500">試合データなし</p>
              ) : (
                <BracketView matches={matches} nameMap={nameMap} affiliationMap={affiliationMap} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EventHeader({ event }: { event: Event }) {
  return (
    <div className="bg-gray-800/80 border border-gray-700/40 rounded-xl p-4 mb-6 flex items-center gap-3">
      <span className="text-xs bg-green-700 text-green-100 px-2 py-1 rounded font-medium shrink-0">進行中</span>
      <span className="text-xl font-bold">{event.name}</span>
      <span className="text-sm text-gray-300">{event.court_count}コート</span>
    </div>
  );
}

async function fetchFighterMaps(allMatches: Match[]) {
  const allFighterIds = new Set<string>();
  allMatches.forEach((m) => {
    if (m.fighter1_id) allFighterIds.add(m.fighter1_id);
    if (m.fighter2_id) allFighterIds.add(m.fighter2_id);
  });
  const fighterMap: Record<string, Fighter> = {};
  if (allFighterIds.size > 0) {
    const { data: fs } = await supabase
      .from("fighters")
      .select("*, dojo:dojos(*)")
      .in("id", [...allFighterIds]);
    (fs ?? []).forEach((f) => {
      fighterMap[f.id] = f as Fighter;
    });
  }
  return {
    nameMap: Object.fromEntries(Object.entries(fighterMap).map(([id, f]) => [id, fighterFullName(f)])),
    affiliationMap: Object.fromEntries(
      Object.entries(fighterMap).map(([id, f]) => [id, f.affiliation ?? f.dojo?.name ?? ""]),
    ),
  };
}

function buildCourtData(
  ae: Event,
  allTourns: Tournament[],
  allMatches: Match[],
  nameMap: Record<string, string>,
  affiliationMap: Record<string, string>,
): CourtData[] {
  const matchesByTournament: Record<string, Match[]> = {};
  allMatches.forEach((m) => {
    if (!matchesByTournament[m.tournament_id]) matchesByTournament[m.tournament_id] = [];
    matchesByTournament[m.tournament_id].push(m);
  });
  return Array.from({ length: ae.court_count }, (_, i) => ({
    courtNum: i + 1,
    tournaments: allTourns
      .filter((t) => t.court === String(i + 1))
      .map((t) => ({
        tournament: t,
        matches: matchesByTournament[t.id] ?? [],
        nameMap,
        affiliationMap,
      })),
  }));
}

export default function Home() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [courts, setCourts] = useState<CourtData[]>([]);

  const load = useCallback(async () => {
    const { data: ae } = await supabase.from("events").select("*").eq("is_active", true).maybeSingle();
    setActiveEvent(ae ?? null);
    if (!ae) return;

    const { data: allTourns } = await supabase
      .from("tournaments")
      .select("*")
      .eq("event_id", ae.id)
      .neq("status", "finished")
      .order("sort_order")
      .order("created_at");
    if (!allTourns?.length) {
      setCourts([]);
      return;
    }

    const { data: allMatches } = await supabase
      .from("matches")
      .select("*")
      .in(
        "tournament_id",
        allTourns.map((t) => t.id),
      )
      .order("round")
      .order("position");
    const { nameMap, affiliationMap } = await fetchFighterMaps(allMatches ?? []);
    setCourts(buildCourtData(ae, allTourns, allMatches ?? [], nameMap, affiliationMap));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const doLoad = () => {
      if (!cancelled) void load();
    };
    doLoad();
    const timer = setInterval(doLoad, 5000);

    function handleVisibility() {
      if (document.visibilityState === "visible") doLoad();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  if (activeEvent === undefined) {
    return (
      <div className="min-h-screen bg-main-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-main-bg text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">柔空会 - 試合管理 ＆ AI アナウンス</h1>
          <div className="flex items-center gap-4">
            <Link href="/live" target="_blank" className="text-sm text-blue-400 hover:text-blue-300">
              試合速報
            </Link>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-300 underline">
              管理画面
            </Link>
          </div>
        </div>

        {!activeEvent ? (
          <div className="text-center py-20 text-gray-500">
            <p>開催中の試合はありません</p>
          </div>
        ) : (
          <>
            <EventHeader event={activeEvent} />
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {courts.map(({ courtNum, tournaments }) => (
                <CourtCard
                  key={courtNum}
                  courtNum={courtNum}
                  tournaments={tournaments}
                  courtNames={activeEvent.court_names}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
