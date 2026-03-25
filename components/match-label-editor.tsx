"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BracketView, type BracketMatch } from "@/lib/bracket-view";

type TournamentData = {
  id: string;
  name: string;
  type: "tournament" | "one_match";
  sortOrder: number;
  court: string;
  matches: BracketMatch[];
  nameMap: Record<string, string>;
};

function getCourtLabel(court: string, courtNames: string[] | null): string {
  const idx = parseInt(court) - 1;
  return courtNames?.[idx]?.trim() || `コート${court}`;
}

function OneMatchNumberCard({ match, nameMap, assignedNumber, onClick, onSwapFighters, isSwapping }: {
  match: BracketMatch;
  nameMap: Record<string, string>;
  assignedNumber?: number;
  onClick: () => void;
  onSwapFighters: () => void;
  isSwapping: boolean;
}) {
  const f1Name = match.fighter1_id ? nameMap[match.fighter1_id] ?? "未定" : "未定";
  const f2Name = match.fighter2_id ? nameMap[match.fighter2_id] ?? "未定" : "未定";
  const isDone = match.status === "done" || match.status === "ongoing";

  return (
    <div
      onClick={onClick}
      className={`border rounded-lg p-3 cursor-pointer transition select-none ${
        assignedNumber
          ? "border-blue-500 bg-blue-900/20"
          : "border-gray-600 hover:border-gray-500"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          assignedNumber ? "bg-blue-600 text-white" : "bg-gray-600 text-gray-500"
        }`}>
          {assignedNumber ?? "−"}
        </div>
        <span className={`text-sm font-medium ${match.winner_id === match.fighter1_id ? "text-green-400" : "text-white"}`}>
          {f1Name}
        </span>
        <span className="text-xs text-gray-500">vs</span>
        <span className={`text-sm font-medium ${match.winner_id === match.fighter2_id ? "text-green-400" : "text-white"}`}>
          {f2Name}
        </span>
        {!isDone && (
          <button
            onClick={(e) => { e.stopPropagation(); onSwapFighters(); }}
            disabled={isSwapping}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 px-2 py-1 rounded border border-gray-600 hover:border-gray-500 transition shrink-0"
          >
            {isSwapping ? "…" : "⇅赤白"}
          </button>
        )}
      </div>
    </div>
  );
}

export function MatchLabelEditor({ eventId, courtNames, courtCount, onChanged }: { eventId: string; courtNames: string[] | null; courtCount: number; onChanged?: () => void }) {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [swappingIds, setSwappingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (preserveOrder = false) => {
    const { data: tourns } = await supabase
      .from("tournaments")
      .select("id, name, sort_order, court, type")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("created_at");
    if (!tourns?.length) { setTournaments([]); return; }

    type RawTourn = { id: string; name: string; sort_order: number; court: string; type: string };
    const tournsArr = tourns as RawTourn[];
    const tournIds = tournsArr.map((t) => t.id);

    const { data: matches } = await supabase
      .from("matches")
      .select("id, tournament_id, round, position, fighter1_id, fighter2_id, winner_id, status, match_label")
      .in("tournament_id", tournIds)
      .order("round")
      .order("position");

    if (!matches?.length) { setTournaments([]); return; }

    const allFighterIds = new Set<string>();
    for (const m of matches) {
      if (m.fighter1_id) allFighterIds.add(m.fighter1_id);
      if (m.fighter2_id) allFighterIds.add(m.fighter2_id);
    }
    let nameMap: Record<string, string> = {};
    if (allFighterIds.size > 0) {
      const { data: fighters } = await supabase
        .from("fighters")
        .select("id, family_name, given_name")
        .in("id", [...allFighterIds]);
      nameMap = Object.fromEntries(
        (fighters ?? []).map((f: { id: string; family_name: string; given_name: string | null }) => [
          f.id, `${f.family_name}${f.given_name ?? ""}`,
        ])
      );
    }

    type RawMatch = { id: string; tournament_id: string; round: number; position: number; fighter1_id: string | null; fighter2_id: string | null; winner_id: string | null; status: string; match_label: string | null };
    const byTournament: Record<string, BracketMatch[]> = {};
    for (const m of matches as unknown as RawMatch[]) {
      if (!byTournament[m.tournament_id]) byTournament[m.tournament_id] = [];
      byTournament[m.tournament_id].push({
        id: m.id,
        round: m.round,
        position: m.position,
        fighter1_id: m.fighter1_id,
        fighter2_id: m.fighter2_id,
        winner_id: m.winner_id,
        status: m.status,
        match_label: m.match_label,
      });
    }

    const result: TournamentData[] = tournsArr.map((t) => ({
      id: t.id,
      name: t.name,
      type: (t.type === "one_match" ? "one_match" : "tournament") as "tournament" | "one_match",
      sortOrder: t.sort_order,
      court: t.court,
      matches: byTournament[t.id] ?? [],
      nameMap,
    }));
    setTournaments(result);

    // 既存ラベル（"XXX第N試合" 形式）から順序を復元
    type MatchRow = { id: string; tournament_id: string; match_label: string | null };
    const matchToCourtMap: Record<string, string> = {};
    for (const t of tournsArr) {
      for (const m of (byTournament[t.id] ?? []) as BracketMatch[]) {
        matchToCourtMap[m.id] = t.court;
      }
    }
    const labeled: { id: string; court: string; num: number }[] = (matches as MatchRow[])
      .filter((m) => m.match_label?.match(/第(\d+)試合$/))
      .map((m) => ({
        id: m.id,
        court: matchToCourtMap[m.id] ?? "1",
        num: parseInt(m.match_label!.match(/第(\d+)試合$/)![1]),
      }));
    if (!preserveOrder && labeled.length > 0) {
      labeled.sort((a, b) => a.court.localeCompare(b.court) || a.num - b.num);
      setOrder(labeled.map((l) => l.id));
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // matchId → court のマッピング
  const matchToCourtMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tournaments) {
      for (const m of t.matches) map[m.id] = t.court;
    }
    return map;
  }, [tournaments]);

  // コート別の割り当て番号
  const assignedNumbers: Record<string, number> = useMemo(() => {
    const result: Record<string, number> = {};
    const counters: Record<string, number> = {};
    for (const id of order) {
      const court = matchToCourtMap[id];
      if (!court) continue;
      counters[court] = (counters[court] ?? 0) + 1;
      result[id] = counters[court];
    }
    return result;
  }, [order, matchToCourtMap]);

  function handleNumberClick(matchId: string) {
    setOrder((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    );
  }

  function autoAssign() {
    // コートごとに独立してソート: ラウンド → トーナメント sort_order → ポジション
    const result: string[] = [];
    for (let courtNum = 1; courtNum <= courtCount; courtNum++) {
      const courtTournaments = tournaments.filter((t) => t.court === String(courtNum));
      const courtMatches = courtTournaments.flatMap((t, tIdx) =>
        t.matches
          .filter((m) => !(m.round === 1 && !!m.fighter1_id && !m.fighter2_id))
          .map((m) => ({ id: m.id, round: m.round, sortOrder: t.sortOrder, tIdx, position: m.position }))
      );
      courtMatches.sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        if (a.tIdx !== b.tIdx) return a.tIdx - b.tIdx;
        return a.position - b.position;
      });
      result.push(...courtMatches.map((m) => m.id));
    }
    setOrder(result);
  }

  function clearAll() {
    setOrder([]);
  }

  async function save() {
    setSaving(true);
    const allMatches = tournaments.flatMap((t) => t.matches.map((m) => ({ id: m.id, court: t.court })));

    // コート別カウントでラベル生成
    const courtCounters: Record<string, number> = {};
    const labels: Record<string, string> = {};
    for (const id of order) {
      const court = matchToCourtMap[id];
      if (!court) continue;
      courtCounters[court] = (courtCounters[court] ?? 0) + 1;
      labels[id] = `${getCourtLabel(court, courtNames)}第${courtCounters[court]}試合`;
    }

    const updates = allMatches.map((m) => ({
      id: m.id,
      match_label: labels[m.id] ?? null,
    }));
    await fetch("/api/admin/matches/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await load(true);
  }

  async function handleSwapFighters(matchId: string) {
    if (swappingIds.has(matchId)) return;
    const tournament = tournaments.find((t) => t.matches.some((m) => m.id === matchId));
    if (!tournament) return;
    const match = tournament.matches.find((m) => m.id === matchId);
    if (!match) return;
    setSwappingIds((prev) => new Set(prev).add(matchId));
    try {
      await fetch(`/api/admin/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighter1_id: match.fighter2_id, fighter2_id: match.fighter1_id }),
      });
      await load(true);
      onChanged?.();
    } finally {
      setSwappingIds((prev) => { const s = new Set(prev); s.delete(matchId); return s; });
    }
  }

  async function handleSwapWithNext(round: number, matchId: string) {
    if (swappingIds.has(matchId)) return;
    const tournament = tournaments.find((t) => t.matches.some((m) => m.id === matchId));
    if (!tournament) return;
    const roundMatches = tournament.matches
      .filter((m) => m.round === round)
      .sort((a, b) => a.position - b.position);
    const idx = roundMatches.findIndex((m) => m.id === matchId);
    if (idx < 0 || idx >= roundMatches.length - 1) return;
    const m1 = roundMatches[idx];
    const m2 = roundMatches[idx + 1];
    setSwappingIds((prev) => { const s = new Set(prev); s.add(m1.id); s.add(m2.id); return s; });
    try {
      await fetch("/api/admin/matches/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match1_id: m1.id, match2_id: m2.id }),
      });
      await load(true);
      onChanged?.();
    } finally {
      setSwappingIds((prev) => { const s = new Set(prev); s.delete(m1.id); s.delete(m2.id); return s; });
    }
  }

  const assignedCount = order.length;
  const totalCount = tournaments.reduce((s, t) => s + t.matches.filter((m) => !(m.round === 1 && !!m.fighter1_id && !m.fighter2_id)).length, 0);

  // DB保存済みの試合番号が全試合に設定されているか
  const allLabeledInDb = useMemo(() => {
    if (totalCount === 0) return false;
    const labeledCount = tournaments.reduce((s, t) =>
      s + t.matches.filter((m) => !(m.round === 1 && !!m.fighter1_id && !m.fighter2_id) && !!m.match_label).length, 0);
    return labeledCount === totalCount;
  }, [tournaments, totalCount]);

  return (
    <div className="border border-gray-600 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-700 border-b border-gray-600">
        <span className="font-semibold text-sm">📋 試合番号設定</span>
      </div>

      <div className="bg-gray-800 p-4">
        <p className="text-xs text-gray-400 mb-3">
          試合カードを<strong className="text-white">タップした順番</strong>にコートごとの番号が振られます（例: Aコート第1試合）。
          番号をつけたカードをもう一度タップすると解除します。
          空欄のカードはアナウンス時に「準決勝」などラウンド名を使います。
        </p>

        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <button
            onClick={autoAssign}
            className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition"
          >
            ラウンド順で自動割り当て
          </button>
          <button
            onClick={clearAll}
            className="text-xs bg-gray-600 hover:bg-gray-500 text-gray-300 px-3 py-1.5 rounded transition"
          >
            全解除
          </button>
          <span className="text-xs text-gray-500 ml-1">
            {assignedCount} / {totalCount} 件割り当て済み
          </span>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition ml-auto"
          >
            {saving ? "保存中…" : saved ? "✓ 保存済み" : "保存"}
          </button>
        </div>

        {allLabeledInDb && (
          <div className="mb-4 bg-green-950 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-green-400 shrink-0">✅</span>
            <p className="text-sm text-green-300 font-medium">準備完了！大会をアクティブに設定すると試合を開始できます。</p>
            <Link
              href="/admin?tab=events"
              className="ml-auto shrink-0 text-xs bg-green-800 hover:bg-green-700 text-green-200 px-3 py-1.5 rounded transition"
            >
              試合一覧へ →
            </Link>
          </div>
        )}

        {tournaments.length === 0 ? (
          <p className="text-sm text-gray-600">確定済みのトーナメントがありません</p>
        ) : (
          <div className="space-y-6">
            {Array.from({ length: courtCount }, (_, i) => i + 1).map((courtNum) => {
              const courtLabel = getCourtLabel(String(courtNum), courtNames);
              const courtTournaments = tournaments.filter((t) => t.court === String(courtNum));
              if (courtTournaments.length === 0) return null;
              return (
                <div key={courtNum}>
                  <h2 className="text-base font-semibold text-gray-200 mb-3">{courtLabel}</h2>
                  <div className="space-y-4">
                    {courtTournaments.map((t) => (
                      <div key={t.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-medium text-gray-400">{t.name}</h3>
                          {t.type === "one_match" && (
                            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">ワンマッチ</span>
                          )}
                        </div>
                        <div className="bg-gray-700 rounded-xl p-3">
                          {t.type === "one_match" && t.matches.length === 1 ? (
                            <OneMatchNumberCard
                              match={t.matches[0]}
                              nameMap={t.nameMap}
                              assignedNumber={assignedNumbers[t.matches[0].id]}
                              onClick={() => handleNumberClick(t.matches[0].id)}
                              onSwapFighters={() => handleSwapFighters(t.matches[0].id)}
                              isSwapping={swappingIds.has(t.matches[0].id)}
                            />
                          ) : (
                            <BracketView
                              matches={t.matches}
                              nameMap={t.nameMap}
                              assignedNumbers={assignedNumbers}
                              onNumberClick={handleNumberClick}
                              onSwapWithNext={handleSwapWithNext}
                              onSwapFighters={handleSwapFighters}
                              processingMatchIds={swappingIds}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
