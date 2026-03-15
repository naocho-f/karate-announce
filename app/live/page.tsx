"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Match, Tournament } from "@/lib/types";

type FighterInfo = { id: string; name: string };

type CourtData = {
  courtNum: number;
  tournament: Tournament | null;
  matches: Match[];
};

export default function LivePage() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { data: ae } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    setActiveEvent(ae ?? null);
    if (!ae) return;

    const courtData: CourtData[] = [];
    for (let c = 1; c <= ae.court_count; c++) {
      const { data: t } = await supabase
        .from("tournaments")
        .select("*")
        .eq("event_id", ae.id)
        .eq("court", String(c))
        .neq("status", "finished")
        .maybeSingle();

      let matches: Match[] = [];
      if (t) {
        const { data: ms } = await supabase
          .from("matches")
          .select("*, fighter1:fighters!fighter1_id(id,name), fighter2:fighters!fighter2_id(id,name), winner:fighters!winner_id(id,name)")
          .eq("tournament_id", t.id)
          .order("round")
          .order("position");
        matches = (ms ?? []) as Match[];
      }
      courtData.push({ courtNum: c, tournament: t ?? null, matches });
    }
    setCourts(courtData);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (activeEvent === undefined) {
    return <div className="min-h-screen bg-gray-950" />;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* ヘッダー */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {activeEvent ? (
              <>
                <span className="shrink-0 text-xs bg-green-700 text-green-200 px-2 py-0.5 rounded-full font-medium">LIVE</span>
                <span className="font-bold text-base truncate">{activeEvent.name}</span>
              </>
            ) : (
              <span className="text-gray-500 text-sm">試合なし</span>
            )}
          </div>
          {lastUpdated && (
            <span className="text-xs text-gray-600 shrink-0">
              {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新
            </span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {!activeEvent ? (
          <div className="text-center py-24 text-gray-600">
            <p className="text-4xl mb-4">🥋</p>
            <p className="text-lg font-medium">現在開催中の試合はありません</p>
          </div>
        ) : (
          courts.map(({ courtNum, tournament, matches }) => (
            <CourtView
              key={courtNum}
              courtNum={courtNum}
              tournament={tournament}
              matches={matches}
            />
          ))
        )}
      </div>
    </main>
  );
}

function CourtView({ courtNum, tournament, matches }: {
  courtNum: number;
  tournament: Tournament | null;
  matches: Match[];
}) {
  const ongoing = matches.find((m) => m.status === "ongoing");
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const maxRound = rounds.length > 0 ? Math.max(...rounds) : 1;

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden">
      {/* コートヘッダー */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
        <h2 className="font-bold text-lg">コート {courtNum}</h2>
        {tournament ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            tournament.status === "ongoing" ? "bg-yellow-800 text-yellow-200" :
            "bg-gray-700 text-gray-400"
          }`}>
            {tournament.status === "preparing" ? "準備中" : "進行中"}
          </span>
        ) : (
          <span className="text-xs text-gray-600">対戦表未設定</span>
        )}
      </div>

      {!tournament || matches.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-600 text-sm">データなし</div>
      ) : (
        <div className="p-4 space-y-4">
          {/* 試合中ハイライト */}
          {ongoing && <OngoingCard match={ongoing} />}

          {/* ラウンド別対戦表 */}
          <div className="space-y-3">
            {rounds.map((round) => {
              const roundMatches = matches.filter((m) => m.round === round);
              const roundLabel =
                round === maxRound ? "決勝" :
                round === maxRound - 1 && maxRound > 1 ? "準決勝" :
                `${round}回戦`;
              const allLabeled = roundMatches.every((m) => m.match_label);

              return (
                <div key={round}>
                  {!allLabeled && (
                    <p className="text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">{roundLabel}</p>
                  )}
                  <div className="space-y-1.5">
                    {roundMatches.map((m) => (
                      <MatchRow key={m.id} match={m} isOngoing={m.id === ongoing?.id} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OngoingCard({ match }: { match: Match }) {
  const f1 = match.fighter1 as FighterInfo | null;
  const f2 = match.fighter2 as FighterInfo | null;

  return (
    <div className="bg-blue-950 border border-blue-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium animate-pulse">試合中</span>
        {match.match_label && (
          <span className="text-xs text-blue-300">{match.match_label}</span>
        )}
        {match.rules && (
          <span className="text-xs text-gray-400">{match.rules}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-center font-bold text-lg text-white">
          {f1?.name ?? "未定"}
        </span>
        <span className="text-gray-500 text-sm font-medium shrink-0">vs</span>
        <span className="flex-1 text-center font-bold text-lg text-white">
          {f2?.name ?? "未定"}
        </span>
      </div>
    </div>
  );
}

function MatchRow({ match, isOngoing }: { match: Match; isOngoing: boolean }) {
  const f1 = match.fighter1 as FighterInfo | null;
  const f2 = match.fighter2 as FighterInfo | null;
  const winner = match.winner as FighterInfo | null;
  const isDone = match.status === "done";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
      isOngoing ? "bg-blue-900/40 border border-blue-800" :
      isDone    ? "bg-gray-800/50 opacity-60" :
                  "bg-gray-800"
    }`}>
      {match.match_label && (
        <span className="text-xs text-gray-500 shrink-0">{match.match_label}</span>
      )}
      <span className={`flex-1 truncate ${
        winner && winner.id === f1?.id ? "font-bold text-white" :
        isDone ? "text-gray-500" : "text-gray-200"
      }`}>
        {f1?.name ?? "未定"}
        {winner?.id === f1?.id && <span className="ml-1 text-xs text-green-400">勝</span>}
      </span>
      <span className="text-gray-600 text-xs shrink-0">vs</span>
      <span className={`flex-1 truncate text-right ${
        winner && winner.id === f2?.id ? "font-bold text-white" :
        isDone ? "text-gray-500" :
        f2 ? "text-gray-200" : "text-gray-600"
      }`}>
        {f2 ? (
          <>
            {f2.name}
            {winner?.id === f2?.id && <span className="ml-1 text-xs text-green-400">勝</span>}
          </>
        ) : (
          match.round === 1 ? "BYE" : "未定"
        )}
      </span>
      {isOngoing && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      )}
    </div>
  );
}
