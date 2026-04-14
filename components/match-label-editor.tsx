"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BracketView, type BracketMatch } from "@/lib/bracket-view";
import { autoAssignOrder } from "@/lib/match-label-utils";

type TournamentData = {
  id: string;
  name: string;
  type: "tournament" | "one_match";
  sortOrder: number;
  court: string;
  matches: BracketMatch[];
  nameMap: Record<string, string>;
};

export function getCourtLabel(court: string, courtNames: string[] | null): string {
  const idx = parseInt(court) - 1;
  return courtNames?.[idx]?.trim() || `コート${court}`;
}

function OneMatchNumberCard({
  match,
  nameMap,
  assignedNumber,
  onClick,
  onSwapFighters,
  isSwapping,
}: {
  match: BracketMatch;
  nameMap: Record<string, string>;
  assignedNumber?: number;
  onClick: () => void;
  onSwapFighters: () => void;
  isSwapping: boolean;
}) {
  const f1Name = match.fighter1_id ? (nameMap[match.fighter1_id] ?? "未定") : "未定";
  const f2Name = match.fighter2_id ? (nameMap[match.fighter2_id] ?? "未定") : "未定";
  const isDone = match.status === "done" || match.status === "ongoing";

  return (
    <div
      onClick={onClick}
      className={`border rounded-lg p-3 cursor-pointer transition select-none ${
        assignedNumber ? "border-blue-500 bg-blue-900/20" : "border-gray-700 hover:border-gray-500"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            assignedNumber ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-500"
          }`}
        >
          {assignedNumber ?? "−"}
        </div>
        <span
          className={`text-sm font-medium ${match.winner_id === match.fighter1_id ? "text-green-400" : "text-white"}`}
        >
          {f1Name}
        </span>
        <span className="text-xs text-gray-500">vs</span>
        <span
          className={`text-sm font-medium ${match.winner_id === match.fighter2_id ? "text-green-400" : "text-white"}`}
        >
          {f2Name}
        </span>
        {!isDone && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSwapFighters();
            }}
            disabled={isSwapping}
            className="ml-auto text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50 px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition shrink-0"
          >
            {isSwapping ? "…" : "⇅赤白"}
          </button>
        )}
      </div>
    </div>
  );
}

function useMatchLabelData(eventId: string) {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [swappingIds, setSwappingIds] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (preserveOrder = false) => {
      const { data: tourns } = await supabase
        .from("tournaments")
        .select("id, name, sort_order, court, type")
        .eq("event_id", eventId)
        .order("sort_order")
        .order("created_at");
      if (!tourns?.length) {
        setTournaments([]);
        return;
      }
      const result = await loadTournamentMatches(tourns);
      setTournaments(result.tournaments);
      if (!preserveOrder && result.labeledOrder.length > 0) setOrder(result.labeledOrder);
    },
    [eventId],
  );

  useEffect(() => {
    let c = false;
    void (async () => {
      if (!c) await load();
    })();
    return () => {
      c = true;
    };
  }, [load]);

  const matchToCourtMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tournaments) for (const m of t.matches) map[m.id] = t.court;
    return map;
  }, [tournaments]);

  const assignedNumbers = useMemo(() => {
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

  return {
    tournaments,
    order,
    setOrder,
    saving,
    setSaving,
    saved,
    setSaved,
    swappingIds,
    setSwappingIds,
    load,
    matchToCourtMap,
    assignedNumbers,
  };
}

async function loadTournamentMatches(
  tourns: { id: string; name: string; sort_order: number; court: string; type: string }[],
) {
  const tournIds = tourns.map((t) => t.id);
  const { data: matches } = await supabase
    .from("matches")
    .select("id, tournament_id, round, position, fighter1_id, fighter2_id, winner_id, status, match_label")
    .in("tournament_id", tournIds)
    .order("round")
    .order("position");
  if (!matches?.length) return { tournaments: [] as TournamentData[], labeledOrder: [] as string[] };
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
        f.id,
        `${f.family_name}${f.given_name ?? ""}`,
      ]),
    );
  }
  const byTournament: Record<string, BracketMatch[]> = {};
  for (const m of matches as unknown as Array<{
    id: string;
    tournament_id: string;
    round: number;
    position: number;
    fighter1_id: string | null;
    fighter2_id: string | null;
    winner_id: string | null;
    status: string;
    match_label: string | null;
  }>) {
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
  const tournaments: TournamentData[] = tourns.map((t) => ({
    id: t.id,
    name: t.name,
    type: (t.type === "one_match" ? "one_match" : "tournament") as "tournament" | "one_match",
    sortOrder: t.sort_order,
    court: t.court,
    matches: byTournament[t.id] ?? [],
    nameMap,
  }));
  const matchCourtMap: Record<string, string> = {};
  for (const t of tourns) for (const m of byTournament[t.id] ?? []) matchCourtMap[m.id] = t.court;
  const labeled = (matches as Array<{ id: string; match_label: string | null }>)
    .filter((m) => m.match_label?.match(/第(\d+)試合$/))
    .map((m) => ({
      id: m.id,
      court: matchCourtMap[m.id] ?? "1",
      num: parseInt((m.match_label?.match(/第(\d+)試合$/) ?? ["", "0"])[1]),
    }));
  labeled.sort((a, b) => a.court.localeCompare(b.court) || a.num - b.num);
  return { tournaments, labeledOrder: labeled.map((l) => l.id) };
}

export function MatchLabelEditor({
  eventId,
  courtNames,
  courtCount,
  selectedCourt,
  onChanged,
}: {
  eventId: string;
  courtNames: string[] | null;
  courtCount: number;
  selectedCourt?: string;
  onChanged?: () => void;
}) {
  const d = useMatchLabelData(eventId);

  async function save() {
    d.setSaving(true);
    const allMatches = d.tournaments.flatMap((t) => t.matches.map((m) => ({ id: m.id, court: t.court })));
    const courtCounters: Record<string, number> = {};
    const labels: Record<string, string> = {};
    const numbers: Record<string, number> = {};
    for (const id of d.order) {
      const court = d.matchToCourtMap[id];
      if (!court) continue;
      courtCounters[court] = (courtCounters[court] ?? 0) + 1;
      labels[id] = `第${courtCounters[court]}試合`;
      numbers[id] = courtCounters[court];
    }
    await fetch("/api/admin/matches/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: allMatches.map((m) => ({
          id: m.id,
          match_label: labels[m.id] ?? null,
          match_number: numbers[m.id] ?? 0,
        })),
      }),
    });
    d.setSaving(false);
    d.setSaved(true);
    setTimeout(() => d.setSaved(false), 2000);
    await d.load(true);
    onChanged?.();
  }

  async function handleSwapFighters(matchId: string) {
    if (d.swappingIds.has(matchId)) return;
    const tournament = d.tournaments.find((t) => t.matches.some((m) => m.id === matchId));
    const match = tournament?.matches.find((m) => m.id === matchId);
    if (!match) return;
    d.setSwappingIds((prev) => new Set(prev).add(matchId));
    try {
      await fetch(`/api/admin/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighter1_id: match.fighter2_id, fighter2_id: match.fighter1_id }),
      });
      await d.load(true);
      onChanged?.();
    } finally {
      d.setSwappingIds((prev) => {
        const s = new Set(prev);
        s.delete(matchId);
        return s;
      });
    }
  }

  async function handleSwapWithNext(round: number, matchId: string) {
    if (d.swappingIds.has(matchId)) return;
    const tournament = d.tournaments.find((t) => t.matches.some((m) => m.id === matchId));
    if (!tournament) return;
    const rm = tournament.matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
    const idx = rm.findIndex((m) => m.id === matchId);
    if (idx < 0 || idx >= rm.length - 1) return;
    d.setSwappingIds((prev) => {
      const s = new Set(prev);
      s.add(rm[idx].id);
      s.add(rm[idx + 1].id);
      return s;
    });
    try {
      await fetch("/api/admin/matches/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match1_id: rm[idx].id, match2_id: rm[idx + 1].id }),
      });
      await d.load(true);
      onChanged?.();
    } finally {
      d.setSwappingIds((prev) => {
        const s = new Set(prev);
        s.delete(rm[idx].id);
        s.delete(rm[idx + 1].id);
        return s;
      });
    }
  }

  const totalCount = d.tournaments.reduce(
    (s, t) => s + t.matches.filter((m) => !(m.round === 1 && !!m.fighter1_id && !m.fighter2_id)).length,
    0,
  );
  const allLabeledInDb = useMemo(() => {
    if (totalCount === 0) return false;
    const c = d.tournaments.reduce(
      (s, t) =>
        s + t.matches.filter((m) => !(m.round === 1 && !!m.fighter1_id && !m.fighter2_id) && !!m.match_label).length,
      0,
    );
    return c === totalCount;
  }, [d.tournaments, totalCount]);

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <span className="font-semibold text-sm">📋 試合番号設定</span>
      </div>
      <div className="bg-gray-900 p-4">
        <p className="text-xs text-gray-400 mb-3">
          試合カードを<strong className="text-white">タップした順番</strong>にコートごとの番号が振られます（例:
          Aコート第1試合）。番号をつけたカードをもう一度タップすると解除します。空欄のカードはアナウンス時に「準決勝」などラウンド名を使います。
        </p>
        <MatchLabelToolbar
          assignedCount={d.order.length}
          totalCount={totalCount}
          saving={d.saving}
          saved={d.saved}
          onAutoAssign={() => d.setOrder(autoAssignOrder(d.tournaments, courtCount))}
          onClearAll={() => d.setOrder([])}
          onSave={() => void save()}
        />
        {allLabeledInDb && <ReadyBanner />}
        {d.tournaments.length === 0 ? (
          <p className="text-sm text-gray-600">確定済みのトーナメントがありません</p>
        ) : (
          <MatchLabelCourtList
            tournaments={d.tournaments}
            courtCount={courtCount}
            courtNames={courtNames}
            selectedCourt={selectedCourt}
            assignedNumbers={d.assignedNumbers}
            swappingIds={d.swappingIds}
            onNumberClick={(id) =>
              d.setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
            onSwapFighters={(id) => void handleSwapFighters(id)}
            onSwapWithNext={(r, id) => void handleSwapWithNext(r, id)}
          />
        )}
      </div>
    </div>
  );
}

function MatchLabelToolbar({
  assignedCount,
  totalCount,
  saving,
  saved,
  onAutoAssign,
  onClearAll,
  onSave,
}: {
  assignedCount: number;
  totalCount: number;
  saving: boolean;
  saved: boolean;
  onAutoAssign: () => void;
  onClearAll: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap items-center">
      <button
        onClick={onAutoAssign}
        className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition"
      >
        ラウンド順で自動割り当て
      </button>
      <button
        onClick={onClearAll}
        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded transition"
      >
        全解除
      </button>
      <span className="text-xs text-gray-500 ml-1">
        {assignedCount} / {totalCount} 件割り当て済み
      </span>
      <button
        onClick={onSave}
        disabled={saving}
        className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded transition ml-auto"
      >
        {saving ? "保存中…" : saved ? "✓ 保存済み" : "保存"}
      </button>
    </div>
  );
}

function ReadyBanner() {
  return (
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
  );
}

function TournamentBracketCard({
  t,
  assignedNumbers,
  swappingIds,
  onNumberClick,
  onSwapFighters,
  onSwapWithNext,
  extraLabel,
}: {
  t: TournamentData;
  assignedNumbers: Record<string, number>;
  swappingIds: Set<string>;
  onNumberClick: (id: string) => void;
  onSwapFighters: (id: string) => void;
  onSwapWithNext: (round: number, id: string) => void;
  extraLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-400">{t.name}</h3>
        {t.type === "one_match" && (
          <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">ワンマッチ</span>
        )}
        {extraLabel && <span className="text-xs text-orange-400">{extraLabel}</span>}
      </div>
      <div className="bg-gray-800 rounded-xl p-3">
        {t.type === "one_match" && t.matches.length === 1 ? (
          <OneMatchNumberCard
            match={t.matches[0]}
            nameMap={t.nameMap}
            assignedNumber={assignedNumbers[t.matches[0].id]}
            onClick={() => onNumberClick(t.matches[0].id)}
            onSwapFighters={() => onSwapFighters(t.matches[0].id)}
            isSwapping={swappingIds.has(t.matches[0].id)}
          />
        ) : (
          <BracketView
            matches={t.matches}
            nameMap={t.nameMap}
            assignedNumbers={assignedNumbers}
            onNumberClick={onNumberClick}
            onSwapWithNext={onSwapWithNext}
            onSwapFighters={onSwapFighters}
            processingMatchIds={swappingIds}
          />
        )}
      </div>
    </div>
  );
}

function MatchLabelCourtList({
  tournaments,
  courtCount,
  courtNames,
  selectedCourt,
  assignedNumbers,
  swappingIds,
  onNumberClick,
  onSwapFighters,
  onSwapWithNext,
}: {
  tournaments: TournamentData[];
  courtCount: number;
  courtNames: string[] | null;
  selectedCourt?: string;
  assignedNumbers: Record<string, number>;
  swappingIds: Set<string>;
  onNumberClick: (id: string) => void;
  onSwapFighters: (id: string) => void;
  onSwapWithNext: (round: number, id: string) => void;
}) {
  const unassigned = tournaments.filter((t) => t.court === "");
  const showUnassigned = unassigned.length > 0 && (!selectedCourt || selectedCourt === "");
  return (
    <div className="space-y-6">
      {showUnassigned && (
        <div>
          <h2 className="text-base font-semibold text-orange-400 mb-3">未割当</h2>
          <div className="space-y-4">
            {unassigned.map((t) => (
              <TournamentBracketCard
                key={t.id}
                t={t}
                assignedNumbers={assignedNumbers}
                swappingIds={swappingIds}
                onNumberClick={onNumberClick}
                onSwapFighters={onSwapFighters}
                onSwapWithNext={onSwapWithNext}
                extraLabel="※ コートを割り当ててください"
              />
            ))}
          </div>
        </div>
      )}
      {Array.from({ length: courtCount }, (_, i) => i + 1)
        .filter((n) => !selectedCourt || String(n) === selectedCourt)
        .map((n) => {
          const ct = tournaments.filter((t) => t.court === String(n));
          if (ct.length === 0) return null;
          return (
            <div key={n}>
              <h2 className="text-base font-semibold text-gray-200 mb-3">{getCourtLabel(String(n), courtNames)}</h2>
              <div className="space-y-4">
                {ct.map((t) => (
                  <TournamentBracketCard
                    key={t.id}
                    t={t}
                    assignedNumbers={assignedNumbers}
                    swappingIds={swappingIds}
                    onNumberClick={onNumberClick}
                    onSwapFighters={onSwapFighters}
                    onSwapWithNext={onSwapWithNext}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
