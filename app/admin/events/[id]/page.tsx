"use client";

export const dynamic = "force-dynamic";

import { use, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Event, Fighter, Tournament, Rule } from "@/lib/types";
import { createTournamentBracketFromPairs } from "@/lib/bracket";
import {
  checkCompatibility, getMismatchSettings,
  COMPAT_COLORS, COMPAT_LABEL, type CompatibilityLevel, type MismatchSettings,
} from "@/lib/compatibility";
import Link from "next/link";

type Props = { params: Promise<{ id: string }> };

type Pair = {
  id: string;
  f1: Fighter;
  f2: Fighter | null; // null = BYE
  matchLabel: string;
  ruleId: string; // "" = use court default
};

function compatScore(f1: Fighter, f2: Fighter): number {
  let s = 0;
  if (f1.weight && f2.weight) s += Math.abs(f1.weight - f2.weight) * 2;
  if (f1.height && f2.height) s += Math.abs(f1.height - f2.height) * 0.3;
  return s;
}

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const [event, setEvent] = useState<Event | null>(null);
  const [eventFighters, setEventFighters] = useState<Fighter[]>([]);
  const [seedSet, setSeedSet] = useState<Set<string>>(new Set());
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [mismatchSettings, setMismatchSettings] = useState<MismatchSettings>({ maxWeightDiff: 5, maxHeightDiff: null });

  const load = useCallback(async () => {
    const { data: e } = await supabase.from("events").select("*").eq("id", id).single();
    setEvent(e ?? null);

    const { data: ef } = await supabase.from("event_fighters").select("fighter_id, seed_number").eq("event_id", id);
    if (ef && ef.length > 0) {
      const { data: fs } = await supabase.from("fighters").select("*, dojo:dojos(*)").in("id", ef.map((r) => r.fighter_id));
      setEventFighters((fs ?? []) as Fighter[]);
      const seeds = new Set<string>();
      ef.forEach((r) => { if (r.seed_number) seeds.add(r.fighter_id); });
      setSeedSet(seeds);
    } else {
      setEventFighters([]);
      setSeedSet(new Set());
    }

    const { data: ts } = await supabase.from("tournaments").select("*").eq("event_id", id);
    setTournaments(ts ?? []);

    const { data: rs } = await supabase.from("rules").select("*").order("name");
    setRules(rs ?? []);

    setMismatchSettings(getMismatchSettings());
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function toggleSeed(fighterId: string) {
    const isSeed = seedSet.has(fighterId);
    await supabase.from("event_fighters")
      .update({ seed_number: isSeed ? null : 1 })
      .eq("event_id", id)
      .eq("fighter_id", fighterId);
    setSeedSet((prev) => {
      const next = new Set(prev);
      isSeed ? next.delete(fighterId) : next.add(fighterId);
      return next;
    });
  }

  if (!event) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-gray-400">読み込み中...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← 戻る</Link>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <span className="text-sm text-gray-500">{event.court_count}コート / 参加{eventFighters.length}名</span>
        </div>

        {/* シード設定 */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-300">シード選手</h2>
            <p className="text-xs text-gray-500 mt-0.5">タップでシード指定。自動振り分け時に優先的に BYE を割り当て、対戦相手は非シードから選択します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {eventFighters.map((f) => (
              <button
                key={f.id}
                onClick={() => toggleSeed(f.id)}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  seedSet.has(f.id)
                    ? "bg-yellow-600 text-white font-bold"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {seedSet.has(f.id) ? "★ " : "☆ "}{f.name}
                {f.weight ? ` ${f.weight}kg` : ""}
              </button>
            ))}
            {eventFighters.length === 0 && <p className="text-xs text-gray-500">参加選手が登録されていません</p>}
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: event.court_count }, (_, i) => i + 1).map((courtNum) => (
            <CourtSection
              key={courtNum}
              courtNum={courtNum}
              eventId={id}
              eventFighters={eventFighters}
              seedSet={seedSet}
              tournament={tournaments.find((t) => t.court === String(courtNum)) ?? null}
              rules={rules}
              mismatchSettings={mismatchSettings}
              onCreated={load}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

// ── コートセクション ──────────────────────────────────────────────────────

function CourtSection({ courtNum, eventId, eventFighters, seedSet, tournament, rules, mismatchSettings, onCreated }: {
  courtNum: number;
  eventId: string;
  eventFighters: Fighter[];
  seedSet: Set<string>;
  tournament: Tournament | null;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  onCreated: () => void;
}) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [defaultRuleId, setDefaultRuleId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const assignedIds = new Set(
    pairs.flatMap((p) => [p.f1.id, p.f2?.id].filter((x): x is string => !!x)),
  );
  const unassigned = eventFighters.filter((f) => !assignedIds.has(f.id));

  function autoAssign() {
    const seeds = eventFighters.filter((f) => seedSet.has(f.id));
    const nonSeeds = eventFighters
      .filter((f) => !seedSet.has(f.id))
      .sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999));

    const total = eventFighters.length;
    const newPairs: Pair[] = [];
    const used = new Set<string>();

    // 奇数の場合、最初のシード（なければ最初の非シード）に BYE
    if (total % 2 === 1) {
      const byeTarget = seeds[0] ?? nonSeeds[0];
      if (byeTarget) {
        newPairs.push({ id: crypto.randomUUID(), f1: byeTarget, f2: null, matchLabel: "", ruleId: "" });
        used.add(byeTarget.id);
      }
    }

    // シード選手は非シードと対戦させる
    for (const seed of seeds.filter((f) => !used.has(f.id))) {
      const partner = nonSeeds
        .filter((f) => !used.has(f.id))
        .sort((a, b) => compatScore(seed, a) - compatScore(seed, b))[0];
      if (partner) {
        used.add(seed.id);
        used.add(partner.id);
        newPairs.push({ id: crypto.randomUUID(), f1: seed, f2: partner, matchLabel: "", ruleId: "" });
      }
    }

    // 余ったシード同士（非シードが足りない場合）
    const remainingSeeds = seeds.filter((f) => !used.has(f.id));
    for (let i = 0; i + 1 < remainingSeeds.length; i += 2) {
      used.add(remainingSeeds[i].id);
      used.add(remainingSeeds[i + 1].id);
      newPairs.push({ id: crypto.randomUUID(), f1: remainingSeeds[i], f2: remainingSeeds[i + 1], matchLabel: "", ruleId: "" });
    }

    // 残り非シード同士を体重差最小でペアリング（greedy）
    const pool = eventFighters.filter((f) => !used.has(f.id)).sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999));
    while (pool.length >= 2) {
      const f1 = pool.shift()!;
      let bestIdx = 0;
      let best = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const s = compatScore(f1, pool[i]);
        if (s < best) { best = s; bestIdx = i; }
      }
      const f2 = pool.splice(bestIdx, 1)[0];
      newPairs.push({ id: crypto.randomUUID(), f1, f2, matchLabel: "", ruleId: "" });
    }
    if (pool.length === 1) {
      newPairs.push({ id: crypto.randomUUID(), f1: pool[0], f2: null, matchLabel: "", ruleId: "" });
    }

    setPairs(newPairs);
  }

  function addEmptyPair() {
    if (unassigned.length === 0) return;
    setPairs((prev) => [...prev, { id: crypto.randomUUID(), f1: unassigned[0], f2: null, matchLabel: "", ruleId: "" }]);
  }

  function removePair(pairId: string) {
    setPairs((prev) => prev.filter((p) => p.id !== pairId));
  }

  function updateF1(pairId: string, fighterId: string) {
    const f = eventFighters.find((f) => f.id === fighterId);
    if (!f) return;
    setPairs((prev) => prev.map((p) => p.id !== pairId ? p : { ...p, f1: f }));
  }

  function updateF2(pairId: string, fighterId: string | null) {
    const f = fighterId ? eventFighters.find((f) => f.id === fighterId) ?? null : null;
    setPairs((prev) => prev.map((p) => p.id !== pairId ? p : { ...p, f2: f }));
  }

  function updateField(pairId: string, field: "matchLabel" | "ruleId", value: string) {
    setPairs((prev) => prev.map((p) => p.id !== pairId ? p : { ...p, [field]: value }));
  }

  async function confirm() {
    if (pairs.length === 0) return;
    setConfirming(true);
    const defaultRule = rules.find((r) => r.id === defaultRuleId);
    await createTournamentBracketFromPairs(
      `コート${courtNum}`,
      String(courtNum),
      pairs.map((p) => ({
        f1: p.f1.id,
        f2: p.f2?.id ?? null,
        matchLabel: p.matchLabel || null,
        rules: (p.ruleId ? rules.find((r) => r.id === p.ruleId)?.name : null) ?? defaultRule?.name ?? null,
      })),
      eventId,
      defaultRule?.name ?? null,
    );
    setConfirming(false);
    onCreated();
  }

  // 対戦表あり → 表示・編集モード
  if (tournament) {
    return (
      <ExistingTournamentSection
        courtNum={courtNum}
        tournament={tournament}
        eventFighters={eventFighters}
        rules={rules}
        mismatchSettings={mismatchSettings}
      />
    );
  }

  // 対戦表作成UI
  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-200">コート{courtNum} の対戦表</h2>
        <span className="text-xs text-gray-500">
          参加{eventFighters.length}名 / 割当{assignedIds.size}名 / 未割当{unassigned.length}名
        </span>
      </div>

      {/* デフォルトルール + 自動振り分け */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 shrink-0">コートルール:</label>
        <select
          value={defaultRuleId}
          onChange={(e) => setDefaultRuleId(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
        >
          <option value="">なし</option>
          {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button
          onClick={autoAssign}
          disabled={eventFighters.length < 2}
          className="shrink-0 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 px-3 py-2 rounded-lg text-xs font-medium transition"
        >
          自動振り分け
        </button>
      </div>

      {/* 対戦リスト */}
      {pairs.length > 0 ? (
        <div className="space-y-2">
          {pairs.map((pair, idx) => {
            const compat: CompatibilityLevel = pair.f2
              ? checkCompatibility(pair.f1, pair.f2, mismatchSettings)
              : "unknown";
            const defaultRule = rules.find((r) => r.id === defaultRuleId);
            const effectiveRuleName = pair.ruleId
              ? rules.find((r) => r.id === pair.ruleId)?.name
              : defaultRule?.name;

            // F1 options: current f1 + unassigned
            const f1Options = [pair.f1, ...unassigned];
            // F2 options: current f2 (if any) + unassigned (excluding f1)
            const f2Options = [...(pair.f2 ? [pair.f2] : []), ...unassigned.filter((f) => f.id !== pair.f1.id)];
            // Sort F2 by compatibility with F1
            const f2Sorted = [...f2Options].sort((a, b) => compatScore(a, pair.f1) - compatScore(b, pair.f1));

            return (
              <div key={pair.id} className="border border-gray-700 rounded-lg p-3 space-y-2">
                {/* Fighter row */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-5 shrink-0 text-center">{idx + 1}</span>

                  {/* F1 select */}
                  <select
                    value={pair.f1.id}
                    onChange={(e) => updateF1(pair.id, e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                  >
                    {f1Options.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}{f.weight ? ` ${f.weight}kg` : ""}{f.height ? ` ${f.height}cm` : ""}
                      </option>
                    ))}
                  </select>

                  <span className="text-gray-600 text-xs shrink-0">vs</span>

                  {/* F2 select */}
                  <select
                    value={pair.f2?.id ?? ""}
                    onChange={(e) => updateF2(pair.id, e.target.value || null)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="">BYE（不戦勝）</option>
                    {f2Sorted.map((f) => {
                      const c: CompatibilityLevel = checkCompatibility(pair.f1, f, mismatchSettings);
                      const label = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
                      return (
                        <option key={f.id} value={f.id}>
                          {label}{f.name}{f.weight ? ` ${f.weight}kg` : ""}{f.height ? ` ${f.height}cm` : ""}
                          {f.experience ? ` [${f.experience}]` : ""}
                        </option>
                      );
                    })}
                  </select>

                  {/* Compatibility badge */}
                  <span className={`text-sm font-bold w-5 text-center shrink-0 ${COMPAT_COLORS[compat]}`}>
                    {COMPAT_LABEL[compat]}
                  </span>

                  <button onClick={() => removePair(pair.id)} className="text-red-400 hover:text-red-300 text-sm shrink-0">✕</button>
                </div>

                {/* Match detail row */}
                <div className="flex gap-2 pl-5">
                  <input
                    value={pair.matchLabel}
                    onChange={(e) => updateField(pair.id, "matchLabel", e.target.value)}
                    placeholder="試合名（例: 第1試合・ワンマッチ）"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none focus:border-blue-500"
                  />
                  <select
                    value={pair.ruleId}
                    onChange={(e) => updateField(pair.id, "ruleId", e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    <option value="">デフォルト{effectiveRuleName ? `（${effectiveRuleName}）` : ""}</option>
                    {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                {/* Body mismatch detail */}
                {pair.f2 && (compat === "warn" || compat === "ng") && (
                  <p className={`text-xs pl-5 ${compat === "ng" ? "text-red-400" : "text-yellow-400"}`}>
                    {pair.f1.weight && pair.f2.weight ? `体重差 ${Math.abs(pair.f1.weight - pair.f2.weight).toFixed(1)}kg` : ""}
                    {pair.f1.height && pair.f2.height ? ` 身長差 ${Math.abs(pair.f1.height - pair.f2.height).toFixed(0)}cm` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-6">
          「自動振り分け」で一括設定するか、「対戦を追加」で手動で組んでください
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={addEmptyPair}
          disabled={unassigned.length === 0}
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 py-2 rounded-lg text-sm transition"
        >
          + 対戦を追加
        </button>
        <button
          onClick={confirm}
          disabled={confirming || pairs.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium transition"
        >
          {confirming ? "保存中..." : `対戦表を確定（${pairs.length}対戦）`}
        </button>
      </div>
    </div>
  );
}

// ── 確定済み対戦表の表示・編集 ──────────────────────────────────────────

type MatchRow = {
  id: string;
  round: number;
  position: number;
  fighter1_id: string | null;
  fighter2_id: string | null;
  winner_id: string | null;
  status: string;
  match_label: string | null;
  rules: string | null;
};

function ExistingTournamentSection({ courtNum, tournament, eventFighters, rules, mismatchSettings }: {
  courtNum: number;
  tournament: Tournament;
  eventFighters: Fighter[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
}) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("matches")
      .select("id, round, position, fighter1_id, fighter2_id, winner_id, status, match_label, rules")
      .eq("tournament_id", tournament.id)
      .order("round").order("position");
    setMatches(data ?? []);
  }, [tournament.id]);

  useEffect(() => { load(); }, [load]);

  const fighterMap = Object.fromEntries(eventFighters.map((f) => [f.id, f]));
  const round1 = matches.filter((m) => m.round === 1);

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-200">コート{courtNum}</h2>
          <span className={`text-xs px-2 py-0.5 rounded ${
            tournament.status === "finished" ? "bg-green-900 text-green-300" :
            tournament.status === "ongoing"  ? "bg-yellow-900 text-yellow-300" :
            "bg-gray-700 text-gray-400"
          }`}>
            {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
          </span>
          {tournament.default_rules && (
            <span className="text-xs text-gray-500">{tournament.default_rules}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-gray-400 hover:text-gray-200">
            {open ? "▲ 折りたたむ" : "▼ 対戦一覧を表示"}
          </button>
          <Link href={`/court/${courtNum}`} className="text-blue-400 hover:text-blue-300 text-sm">
            コート画面 →
          </Link>
        </div>
      </div>

      {open && (
        <div className="space-y-2">
          {round1.length === 0 && (
            <p className="text-xs text-gray-500">試合データがありません</p>
          )}
          {round1.map((m) => {
            // 他の試合で使用済みの選手IDセット（自分自身は除く）
            const otherUsedIds = new Set(
              round1
                .filter((other) => other.id !== m.id)
                .flatMap((other) => [other.fighter1_id, other.fighter2_id].filter((id): id is string => !!id)),
            );
            return (
              <MatchEditRow
                key={m.id}
                match={m}
                fighterMap={fighterMap}
                eventFighters={eventFighters}
                otherUsedIds={otherUsedIds}
                rules={rules}
                mismatchSettings={mismatchSettings}
                onUpdated={load}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchEditRow({ match, fighterMap, eventFighters, otherUsedIds, rules, mismatchSettings, onUpdated }: {
  match: MatchRow;
  fighterMap: Record<string, Fighter>;
  eventFighters: Fighter[];
  otherUsedIds: Set<string>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [f1Id, setF1Id] = useState(match.fighter1_id ?? "");
  const [f2Id, setF2Id] = useState(match.fighter2_id ?? "");
  const [label, setLabel] = useState(match.match_label ?? "");
  const [ruleText, setRuleText] = useState(match.rules ?? "");

  function startEdit() {
    setF1Id(match.fighter1_id ?? "");
    setF2Id(match.fighter2_id ?? "");
    setLabel(match.match_label ?? "");
    setRuleText(match.rules ?? "");
    setEditing(true);
  }

  async function save() {
    await supabase.from("matches").update({
      fighter1_id: f1Id || null,
      fighter2_id: f2Id || null,
      match_label: label.trim() || null,
      rules: ruleText.trim() || null,
      status: (f1Id && f2Id) ? "ready" : "waiting",
    }).eq("id", match.id);
    setEditing(false);
    onUpdated();
  }

  const f1 = match.fighter1_id ? fighterMap[match.fighter1_id] : null;
  const f2 = match.fighter2_id ? fighterMap[match.fighter2_id] : null;
  const compat: CompatibilityLevel = (f1 && f2)
    ? checkCompatibility(f1, f2, mismatchSettings)
    : "unknown";

  const isDone = match.status === "done" || match.status === "ongoing";

  if (!editing) {
    return (
      <div className={`border rounded-lg px-3 py-2 flex items-center gap-2 text-sm ${isDone ? "border-gray-700 opacity-60" : "border-gray-700"}`}>
        {match.match_label && <span className="text-xs text-blue-300 shrink-0">{match.match_label}</span>}
        <span className={`${match.winner_id === match.fighter1_id && match.winner_id ? "text-green-400 font-bold" : "text-gray-200"}`}>
          {f1?.name ?? "BYE"}
        </span>
        <span className="text-gray-600 text-xs shrink-0">vs</span>
        <span className={`${match.winner_id === match.fighter2_id && match.winner_id ? "text-green-400 font-bold" : "text-gray-200"}`}>
          {f2?.name ?? "BYE"}
        </span>
        <span className={`text-xs font-bold shrink-0 ${COMPAT_COLORS[compat]}`}>{COMPAT_LABEL[compat]}</span>
        {match.rules && <span className="text-xs text-gray-500 shrink-0">[{match.rules}]</span>}
        {match.status === "done" && <span className="ml-auto text-xs text-green-400 shrink-0">完了</span>}
        {match.status === "ongoing" && <span className="ml-auto text-xs text-yellow-400 shrink-0 animate-pulse">試合中</span>}
        {!isDone && (
          <button onClick={startEdit} className="ml-auto text-gray-500 hover:text-blue-400 text-xs shrink-0">✎ 編集</button>
        )}
      </div>
    );
  }

  // F2 sorted by compat with F1
  const currentF1 = eventFighters.find((f) => f.id === f1Id);
  const f2Options = eventFighters
    .filter((f) => f.id !== f1Id)
    .sort((a, b) => currentF1 ? compatScore(a, currentF1) - compatScore(b, currentF1) : 0);

  return (
    <div className="border border-blue-600 rounded-lg p-3 space-y-2">
      <div className="flex gap-2 items-center">
        <select
          value={f1Id}
          onChange={(e) => setF1Id(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none"
        >
          <option value="">BYE</option>
          {eventFighters.filter((f) => f.id !== f2Id).map((f) => (
            <option key={f.id} value={f.id}>{f.name}{f.weight ? ` ${f.weight}kg` : ""}</option>
          ))}
        </select>
        <span className="text-gray-600 text-xs shrink-0">vs</span>
        <select
          value={f2Id}
          onChange={(e) => setF2Id(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none"
        >
          <option value="">BYE</option>
          {f2Options.map((f) => {
            const c: CompatibilityLevel = currentF1 ? checkCompatibility(currentF1, f, mismatchSettings) : "unknown";
            const cl = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
            return (
              <option key={f.id} value={f.id}>
                {cl}{f.name}{f.weight ? ` ${f.weight}kg` : ""}{f.experience ? ` [${f.experience}]` : ""}
              </option>
            );
          })}
        </select>
      </div>
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="試合名"
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder:text-gray-500 outline-none"
        />
        <select
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none"
        >
          <option value="">ルールなし</option>
          {rules.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      {/* 重複警告 */}
      {(f1Id && otherUsedIds.has(f1Id)) || (f2Id && otherUsedIds.has(f2Id)) ? (
        <p className="text-xs text-red-400 bg-red-900/40 rounded px-2 py-1">
          ⚠ {[
            f1Id && otherUsedIds.has(f1Id) ? `${fighterMap[f1Id]?.name ?? "選手1"}` : null,
            f2Id && otherUsedIds.has(f2Id) ? `${fighterMap[f2Id]?.name ?? "選手2"}` : null,
          ].filter(Boolean).join("、")} は他の試合にも割り当てられています
        </p>
      ) : null}
      <div className="flex gap-2">
        <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-500 py-1.5 rounded text-xs font-medium">保存</button>
        <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200">キャンセル</button>
      </div>
    </div>
  );
}
