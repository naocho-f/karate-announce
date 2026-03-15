"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Match, Tournament } from "@/lib/types";

type CourtData = {
  courtNum: number;
  tournament: Tournament | null;
  matches: Match[];
};

type FighterInfo = { id: string; name: string };

export default function Home() {
  const [activeEvent, setActiveEvent] = useState<Event | null | undefined>(undefined);
  const [courts, setCourts] = useState<CourtData[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
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
        .maybeSingle();

      let matches: Match[] = [];
      if (t) {
        const { data: ms } = await supabase
          .from("matches")
          .select("*, fighter1:fighters!fighter1_id(*), fighter2:fighters!fighter2_id(*), winner:fighters!winner_id(*)")
          .eq("tournament_id", t.id)
          .order("round")
          .order("position");
        matches = (ms ?? []) as Match[];
      }
      courtData.push({ courtNum: c, tournament: t ?? null, matches });
    }
    setCourts(courtData);
  }

  if (activeEvent === undefined) {
    return <div className="min-h-screen bg-gray-900" />;
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">柔空会 - 試合管理 ＆ AI アナウンス</h1>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-300 underline">管理画面</Link>
        </div>

        {!activeEvent ? (
          <div className="text-center py-20 text-gray-500">
            <p className="mb-3">アクティブな試合がありません</p>
            <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm">
              管理画面で試合をアクティブに設定する →
            </Link>
          </div>
        ) : (
          <>
            {/* 進行中の試合 */}
            <div className="bg-gray-800 rounded-xl p-4 mb-6 flex items-center gap-3">
              <span className="text-xs bg-green-800 text-green-300 px-2 py-1 rounded font-medium shrink-0">進行中</span>
              <span className="text-xl font-bold">{activeEvent.name}</span>
              <span className="text-sm text-gray-400">{activeEvent.court_count}コート</span>
            </div>

            {/* コート一覧 */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {courts.map(({ courtNum, tournament, matches }) => (
                <div key={courtNum} className="bg-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">コート{courtNum}</h2>
                      {tournament && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          tournament.status === "finished" ? "bg-green-900 text-green-300" :
                          tournament.status === "ongoing" ? "bg-yellow-900 text-yellow-300" :
                          "bg-gray-700 text-gray-400"
                        }`}>
                          {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/court/${courtNum}`}
                      className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition"
                    >
                      アナウンス →
                    </Link>
                  </div>

                  <div className="p-4">
                    {!tournament ? (
                      <p className="text-sm text-gray-500">対戦表未設定</p>
                    ) : matches.length === 0 ? (
                      <p className="text-sm text-gray-500">試合データなし</p>
                    ) : (
                      <MatchTable matches={matches} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function MatchTable({ matches }: { matches: Match[] }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {rounds.map((round) => {
        const roundMatches = matches.filter((m) => m.round === round);
        return (
          <div key={round}>
            <p className="text-xs text-gray-500 mb-1">
              {round === 1 ? "1回戦" : round === Math.max(...rounds) ? "決勝" : `${round}回戦`}
            </p>
            <div className="space-y-1">
              {roundMatches.map((m) => {
                const f1 = m.fighter1 as FighterInfo | null;
                const f2 = m.fighter2 as FighterInfo | null;
                const winner = m.winner as FighterInfo | null;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded ${
                      m.status === "ongoing" ? "bg-yellow-900/30 border border-yellow-700" : ""
                    }`}
                  >
                    {m.match_label && (
                      <span className="text-xs text-gray-500 shrink-0">{m.match_label}</span>
                    )}
                    <span className={`${winner?.id === f1?.id ? "font-bold text-white" : m.status === "done" ? "text-gray-500" : "text-gray-200"}`}>
                      {f1?.name ?? "TBD"}
                    </span>
                    <span className="text-gray-600 text-xs shrink-0">vs</span>
                    <span className={`${winner?.id === f2?.id ? "font-bold text-white" : m.status === "done" ? "text-gray-500 " : "text-gray-200"}`}>
                      {f2?.name ?? (m.round === 1 ? "BYE" : "TBD")}
                    </span>
                    {m.status === "ongoing" && (
                      <span className="ml-auto text-xs text-yellow-400 shrink-0 animate-pulse">試合中</span>
                    )}
                    {m.status === "done" && winner && (
                      <span className="ml-auto text-xs text-green-400 shrink-0">勝: {winner.name}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
