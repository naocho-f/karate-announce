"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, FighterInfo, Match, Tournament } from "@/lib/types";
import { matchLabelNum } from "@/lib/match-utils";

type CourtData = {
  courtNum: number;
  courtName: string;
  tournaments: { tournament: Tournament; matches: Match[] }[];
};

export default function LivePage() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [courts, setCourts] = useState<CourtData[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevCourtsRef = useRef<string>("");

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
      const courtName = ae.court_names?.[c - 1]?.trim() || `コート${c}`;
      const { data: tourns } = await supabase
        .from("tournaments")
        .select("*")
        .eq("event_id", ae.id)
        .eq("court", String(c))
        .neq("status", "finished")
        .order("sort_order")
        .order("created_at");

      const tournData: CourtData["tournaments"] = [];
      for (const t of tourns ?? []) {
        const { data: ms } = await supabase
          .from("matches")
          .select("*, fighter1:fighters!fighter1_id(id,name), fighter2:fighters!fighter2_id(id,name), winner:fighters!winner_id(id,name)")
          .eq("tournament_id", t.id)
          .order("round")
          .order("position");
        tournData.push({ tournament: t, matches: (ms ?? []) as Match[] });
      }
      courtData.push({ courtNum: c, courtName, tournaments: tournData });
    }
    const serialized = JSON.stringify(courtData);
    if (serialized !== prevCourtsRef.current) {
      prevCourtsRef.current = serialized;
      setCourts(courtData);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (activeEvent === undefined) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (activeEvent === null) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-4xl">🥋</p>
          <p className="text-gray-400 text-sm">現在開催中の大会はありません</p>
        </div>
      </main>
    );
  }

  const activeCourt = courts[selectedCourt] ?? courts[0];
  const activeOngoing = activeCourt
    ? activeCourt.tournaments.flatMap(({ matches }) => matches).find((m) => m.status === "ongoing") ?? null
    : null;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* ヘッダー（sticky: タイトル + タブ + 試合中カード） */}
      <div className="sticky top-0 z-10 bg-gray-900 backdrop-blur border-b border-gray-700/60">
        <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-medium">LIVE</span>
            <span className="font-bold text-sm truncate">{activeEvent.name}</span>
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-gray-500 shrink-0">
              {lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>

        {/* コートタブ（2コート以上の場合のみ表示） */}
        {courts.length > 1 && (
          <div className="max-w-lg mx-auto grid px-3 pb-2 gap-1.5" style={{ gridTemplateColumns: `repeat(${courts.length}, 1fr)` }}>
            {courts.map((court, idx) => {
              const hasOngoing = court.tournaments.some(({ matches }) => matches.some((m) => m.status === "ongoing"));
              const isActive = idx === selectedCourt;
              return (
                <button
                  key={court.courtNum}
                  onClick={() => setSelectedCourt(idx)}
                  className={`relative py-2.5 text-sm font-bold text-center transition-colors rounded-lg ${
                    isActive
                      ? "bg-blue-600/30 text-blue-200 border border-blue-500/40"
                      : "text-gray-400 bg-gray-800/60 border border-gray-700/40 active:bg-gray-700/60"
                  }`}
                >
                  {court.courtName}
                  {hasOngoing && (
                    <span className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 試合中バナー（sticky ヘッダー内に固定） */}
        {activeOngoing && <OngoingBanner match={activeOngoing} />}
      </div>

      <div className="max-w-lg mx-auto px-3 py-3">
        {activeCourt && <CourtView court={activeCourt} />}
      </div>
    </main>
  );
}

function CourtView({ court }: { court: CourtData }) {
  const { tournaments } = court;

  // 全トーナメントの試合をフラットにして試合番号順にソート
  const allMatches = tournaments.flatMap(({ matches }) => matches);
  const sortedMatches = [...allMatches].sort((a, b) => {
    const nA = matchLabelNum(a.match_label);
    const nB = matchLabelNum(b.match_label);
    if (nA !== nB) return nA - nB;
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  const ongoingMatch = sortedMatches.find((m) => m.status === "ongoing") ?? null;
  // 不戦勝（round 1 で fighter2 なし）を除外
  const visibleMatches = sortedMatches.filter((m) => m.fighter2_id || m.round > 1);

  return (
    <div className="space-y-1.5">
      {/* 試合番号順の対戦リスト */}
      {visibleMatches.map((m) => (
        <MatchRow key={m.id} match={m} isOngoing={m.id === ongoingMatch?.id} />
      ))}

      {visibleMatches.length === 0 && (
        <div className="py-8 text-center text-gray-600 text-sm">データなし</div>
      )}
    </div>
  );
}

function OngoingBanner({ match }: { match: Match }) {
  const f1 = match.fighter1 as FighterInfo | null;
  const f2 = match.fighter2 as FighterInfo | null;

  return (
    <div className="bg-blue-900/60 border-t border-blue-600/40 px-3 py-2.5">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <span className="text-[10px] text-blue-300 font-semibold uppercase tracking-wide">試合中</span>
          {match.match_label && (
            <span className="text-xs text-blue-200 font-medium">{match.match_label}</span>
          )}
          {match.rules && (
            <span className="text-[10px] text-blue-400/70 ml-auto shrink-0">{match.rules}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-center font-bold text-sm text-white truncate">
            {f1?.name ?? "未定"}
          </span>
          <span className="text-blue-400/60 text-[10px] shrink-0">vs</span>
          <span className="flex-1 text-center font-bold text-sm text-white truncate">
            {f2?.name ?? "未定"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MatchRow({ match, isOngoing }: { match: Match; isOngoing: boolean }) {
  const f1 = match.fighter1 as FighterInfo | null;
  const f2 = match.fighter2 as FighterInfo | null;
  const winner = match.winner as FighterInfo | null;
  const isDone = match.status === "done";
  const isBye = match.round === 1 && f1 && !f2;

  if (isBye) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700/30 text-xs">
        {match.match_label && (
          <span className="text-gray-500 shrink-0">{match.match_label}</span>
        )}
        <span className="text-gray-300 truncate">{f1?.name ?? "未定"}</span>
        <span className="text-gray-500 ml-auto shrink-0">不戦勝</span>
      </div>
    );
  }

  // 2行レイアウト: 1行目=試合番号+ステータス、2行目=選手名
  return (
    <div className={`px-3 py-2.5 rounded-xl ${
      isOngoing ? "bg-blue-900/40 border border-blue-600/50" :
      isDone    ? "bg-gray-800/40 border border-gray-700/30" :
                  "bg-gray-800/70 border border-gray-700/40"
    }`}>
      {/* 1行目: 試合番号 + ステータス */}
      <div className="flex items-center gap-1.5 mb-1">
        {match.match_label && (
          <span className={`text-xs font-semibold ${
            isOngoing ? "text-blue-300" : isDone ? "text-gray-500" : "text-gray-400"
          }`}>{match.match_label}</span>
        )}
        {isDone && winner && (
          <span className="text-[10px] text-green-400 font-medium">終了</span>
        )}
        {isOngoing && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] text-blue-300 font-medium">試合中</span>
          </span>
        )}
        {!isDone && !isOngoing && !f2 && (
          <span className="text-[10px] text-gray-500">未定</span>
        )}
      </div>
      {/* 2行目: 選手名 */}
      <div className="flex items-center gap-2">
        <span className={`flex-1 truncate text-sm ${
          winner?.id === f1?.id ? "font-bold text-white" :
          isDone ? "text-gray-400" : "text-gray-100"
        }`}>
          {f1?.name ?? "未定"}
          {winner?.id === f1?.id && <span className="ml-1 text-[10px] text-green-400">勝</span>}
        </span>
        <span className={`text-[10px] shrink-0 ${isDone ? "text-gray-600" : "text-gray-500"}`}>vs</span>
        <span className={`flex-1 truncate text-sm text-right ${
          winner?.id === f2?.id ? "font-bold text-white" :
          isDone ? "text-gray-400" :
          f2 ? "text-gray-100" : "text-gray-500"
        }`}>
          {f2 ? f2.name : "未定"}
          {winner?.id === f2?.id && <span className="ml-1 text-[10px] text-green-400">勝</span>}
        </span>
      </div>
    </div>
  );
}
