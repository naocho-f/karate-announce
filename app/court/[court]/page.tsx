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
      match.match_label,
      match.rules,
    );
  }

  async function setWinner(match: Match, winnerId: string) {
    const winner = fighters[winnerId];
    if (!winner) return;

    await supabase.from("matches").update({ winner_id: winnerId, status: "done" }).eq("id", match.id);

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
                          onUpdated={loadMatches}
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

function MatchCard({ match, fighters, onStart, onUpdated }: {
  match: Match;
  fighters: Record<string, Fighter>;
  onStart: () => void;
  onUpdated: () => void;
}) {
  const f1 = match.fighter1_id ? fighters[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighters[match.fighter2_id] : null;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(match.match_label ?? "");
  const [rules, setRules] = useState(match.rules ?? "");

  const bgColor =
    match.status === "done" ? "bg-gray-800 opacity-60" :
    match.status === "ongoing" ? "bg-blue-900 border border-blue-600" :
    "bg-gray-800";

  async function saveEdit() {
    await supabase.from("matches").update({
      match_label: label.trim() || null,
      rules: rules.trim() || null,
    }).eq("id", match.id);
    setEditing(false);
    onUpdated();
  }

  return (
    <div className={`rounded-xl px-4 py-3 ${bgColor}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {/* ラベル・ルール表示 */}
          {(match.match_label || match.rules) && (
            <div className="flex flex-wrap gap-2 mb-1.5">
              {match.match_label && (
                <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">{match.match_label}</span>
              )}
              {match.rules && (
                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{match.rules}</span>
              )}
            </div>
          )}
          <FighterLine fighter={f1} isWinner={match.winner_id === f1?.id} />
          <div className="text-gray-600 text-xs my-0.5 pl-1">vs</div>
          <FighterLine fighter={f2} isWinner={match.winner_id === f2?.id} />
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {match.status === "ready" && (
            <button
              onClick={onStart}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
            >
              試合開始
            </button>
          )}
          {match.status === "done" && match.winner_id && (
            <span className="text-green-400 text-xs font-medium">終了</span>
          )}
          {match.status !== "done" && (
            <button
              onClick={() => { setLabel(match.match_label ?? ""); setRules(match.rules ?? ""); setEditing(!editing); }}
              className="text-gray-500 hover:text-gray-300 text-xs transition"
            >
              ✎ 設定
            </button>
          )}
        </div>
      </div>

      {/* インライン編集フォーム */}
      {editing && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
          className="mt-3 pt-3 border-t border-gray-700 space-y-2"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="試合ラベル（例: 第一試合 / ワンマッチ）"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <input
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="ルール（例: 2分1本制 / 延長戦あり）"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 py-1.5 rounded-lg text-sm font-medium">保存</button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">キャンセル</button>
          </div>
        </form>
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
      <div className="flex items-center gap-2 mb-3">
        <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest">試合中</p>
        {match.match_label && (
          <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full">{match.match_label}</span>
        )}
        {match.rules && (
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{match.rules}</span>
        )}
      </div>
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
