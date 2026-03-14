"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Fighter, Match, Tournament } from "@/lib/types";
import { roundName, totalRounds } from "@/lib/tournament";
import { announceMatchStart, announceWinner } from "@/lib/speech";
import Link from "next/link";

type Props = { params: Promise<{ court: string }> };

export default function CourtPage({ params }: Props) {
  const { court } = use(params);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [fighters, setFighters] = useState<Record<string, Fighter>>({});
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);

  const loadTournaments = useCallback(async () => {
    const { data } = await supabase
      .from("tournaments")
      .select("*")
      .eq("court", court)
      .neq("status", "finished")
      .order("created_at", { ascending: false });
    setTournaments(data ?? []);
    if (data && data.length > 0 && !selectedTournamentId) {
      setSelectedTournamentId(data[0].id);
    }
  }, [court, selectedTournamentId]);

  const loadMatches = useCallback(async () => {
    if (!selectedTournamentId) return;
    const { data } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", selectedTournamentId)
      .order("round")
      .order("position");
    if (!data) return;
    setMatches(data);

    // 選手情報を一括取得
    const ids = new Set<string>();
    data.forEach((m) => {
      if (m.fighter1_id) ids.add(m.fighter1_id);
      if (m.fighter2_id) ids.add(m.fighter2_id);
    });
    if (ids.size > 0) {
      const { data: fs } = await supabase
        .from("fighters")
        .select("*, dojo:dojos(*)")
        .in("id", [...ids]);
      const map: Record<string, Fighter> = {};
      (fs ?? []).forEach((f) => { map[f.id] = f as Fighter; });
      setFighters(map);
    }
  }, [selectedTournamentId]);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);
  useEffect(() => { loadMatches(); }, [loadMatches]);

  // 3秒ごとにポーリング
  useEffect(() => {
    const timer = setInterval(loadMatches, 3000);
    return () => clearInterval(timer);
  }, [loadMatches]);

  const tournament = tournaments.find((t) => t.id === selectedTournamentId);
  const rounds = tournament ? Math.max(...matches.map((m) => m.round), 1) : 0;

  async function startMatch(match: Match) {
    const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
    const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
    if (!f1 || !f2) return;

    await supabase.from("matches").update({ status: "ongoing" }).eq("id", match.id);
    await supabase.from("tournaments").update({ status: "ongoing" }).eq("id", selectedTournamentId);
    setCurrentMatchId(match.id);
    loadMatches();

    const label = roundName(match.round, rounds);
    const f1dojo = f1.dojo as unknown as { name: string; name_reading?: string | null };
    const f2dojo = f2.dojo as unknown as { name: string; name_reading?: string | null };
    announceMatchStart(
      f1.name, f1dojo?.name ?? "",
      f2.name, f2dojo?.name ?? "",
      label,
      f1.name_reading, f1dojo?.name_reading,
      f2.name_reading, f2dojo?.name_reading,
    );
  }

  async function setWinner(match: Match, winnerId: string) {
    const winner = fighters[winnerId];
    if (!winner) return;

    await supabase.from("matches").update({ winner_id: winnerId, status: "done" }).eq("id", match.id);

    // 次ラウンドに勝者を進める
    if (match.round < rounds) {
      const nextPosition = Math.floor(match.position / 2);
      const isSlot1 = match.position % 2 === 0;
      const field = isSlot1 ? "fighter1_id" : "fighter2_id";
      await supabase.from("matches")
        .update({ [field]: winnerId, status: "ready" })
        .eq("tournament_id", selectedTournamentId)
        .eq("round", match.round + 1)
        .eq("position", nextPosition);
    } else {
      // 決勝終了
      await supabase.from("tournaments").update({ status: "finished" }).eq("id", selectedTournamentId);
    }

    setCurrentMatchId(null);
    loadMatches();
    const winnerDojo = winner.dojo as unknown as { name: string; name_reading?: string | null };
    announceWinner(winner.name, winnerDojo?.name ?? "", winner.name_reading, winnerDojo?.name_reading);
  }

  const currentMatch = matches.find((m) => m.id === currentMatchId) ?? matches.find((m) => m.status === "ongoing");

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-3xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{court}コート</h1>
          {tournaments.length > 1 && (
            <select
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              className="ml-auto bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
            >
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {tournaments.length === 1 && (
            <span className="ml-auto text-gray-300 text-sm font-medium">{tournament?.name}</span>
          )}
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg mb-2">このコートにトーナメントがありません</p>
            <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm underline">管理画面でトーナメントを作成</Link>
          </div>
        ) : (
          <>
            {/* 進行中の試合 */}
            {currentMatch && currentMatch.status === "ongoing" && (
              <OngoingMatchCard
                match={currentMatch}
                fighters={fighters}
                rounds={rounds}
                onSetWinner={setWinner}
              />
            )}

            {/* トーナメント表 */}
            <div className="space-y-6">
              {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => {
                const roundMatches = matches.filter((m) => m.round === round);
                return (
                  <div key={round}>
                    <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                      {roundName(round, rounds)}
                    </h2>
                    <div className="space-y-2">
                      {roundMatches.map((m) => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          fighters={fighters}
                          onStart={() => startMatch(m)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function MatchCard({ match, fighters, onStart }: {
  match: Match;
  fighters: Record<string, Fighter>;
  onStart: () => void;
}) {
  const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;

  const bgColor =
    match.status === "done" ? "bg-gray-800 opacity-60" :
    match.status === "ongoing" ? "bg-blue-900 border border-blue-600" :
    "bg-gray-800";

  return (
    <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${bgColor}`}>
      <div className="flex-1 min-w-0">
        <FighterLine fighter={f1} isWinner={match.winner_id === f1?.id} />
        <div className="text-gray-600 text-xs my-0.5 pl-1">vs</div>
        <FighterLine fighter={f2} isWinner={match.winner_id === f2?.id} />
      </div>

      {match.status === "ready" && (
        <button
          onClick={onStart}
          className="shrink-0 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
        >
          試合開始
        </button>
      )}
      {match.status === "done" && match.winner_id && (
        <span className="shrink-0 text-green-400 text-xs font-medium">終了</span>
      )}
    </div>
  );
}

function OngoingMatchCard({ match, fighters, rounds, onSetWinner }: {
  match: Match;
  fighters: Record<string, Fighter>;
  rounds: number;
  onSetWinner: (match: Match, winnerId: string) => void;
}) {
  const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;

  return (
    <div className="bg-blue-950 border-2 border-blue-500 rounded-2xl p-5 mb-6">
      <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-3">試合中</p>
      <div className="flex gap-3">
        {[f1, f2].map((f, i) => (
          f ? (
            <button
              key={f.id}
              onClick={() => onSetWinner(match, f.id)}
              className="flex-1 bg-gray-800 hover:bg-green-800 border border-gray-600 hover:border-green-500 active:bg-green-700 rounded-xl p-4 text-center transition group"
            >
              <p className="text-xs text-gray-400 group-hover:text-green-300 mb-1">
                {(f.dojo as unknown as { name: string })?.name}
              </p>
              <p className="text-lg font-bold">{f.name}</p>
              <p className="text-xs text-gray-500 group-hover:text-green-400 mt-2">タップして勝者に</p>
            </button>
          ) : (
            <div key={i} className="flex-1 bg-gray-800 rounded-xl p-4 opacity-30 text-center">
              <p className="text-sm text-gray-500">未定</p>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function FighterLine({ fighter, isWinner }: { fighter: Fighter | null; isWinner: boolean }) {
  if (!fighter) return <div className="text-gray-600 text-sm py-0.5">未定</div>;
  return (
    <div className={`flex items-center gap-2 py-0.5 ${isWinner ? "text-green-400" : "text-white"}`}>
      <span className="text-xs text-gray-500">
        {(fighter.dojo as unknown as { name: string })?.name}
      </span>
      <span className="font-medium text-sm">{fighter.name}</span>
      {isWinner && <span className="text-xs text-green-400">✓ 勝</span>}
    </div>
  );
}
