"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Entry, Event, Fighter, Match, Tournament, Rule, TimerPreset } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import {
  checkCompatibility,
  COMPAT_COLORS, COMPAT_LABEL, type CompatibilityLevel, type MismatchSettings,
} from "@/lib/compatibility";
import { pairsFromEntries, entryCompatScore, type PairEntry } from "@/lib/pairing";
import { BracketView, roundLabel } from "@/lib/bracket-view";
import { BracketRulesPanel } from "@/components/bracket-rules-panel";
import { AutoCreateDialog } from "@/components/auto-create-dialog";
import { computeSuggestions } from "@/lib/suggestions";
import { buildRuleGroups } from "@/lib/rule-grouping";
import type { AutoGroup } from "@/lib/auto-bracket";
import { getGradeOptions, gradeToNumber, type AgeCategory } from "@/lib/grade-options";
import { buildFilterSortComparator, matchCountFilterPredicate, gradeFilterPredicate } from "@/lib/group-filter-sort";
import Link from "next/link";
import { estimateMatchMinutes, formatTimeEstimate, countActualMatches, roundedNowHHMM } from "@/lib/time-estimate";

type Pair = {
  id: string;
  e1: Entry;
  e2: Entry | null;
  matchLabel: string;
  ruleId: string;
};

type GroupFilters = {
  minWeight: string;
  maxWeight: string;
  minAge: string;
  maxAge: string;
  sexFilter: string;
  minGrade: string;
  maxGrade: string;
  experienceFilter: string;
  minHeight: string;
  maxHeight: string;
  nameFilter: string;
  matchCountFilter: string;
};

type Group = {
  id: string;
  name: string;
  type: "tournament" | "one_match";
  pairs: Pair[];
  maxWeightDiff: number | null;
  maxHeightDiff: number | null;
  filters?: GroupFilters;
};

// ── ダッシュボードパネル ──────────────────────────────────────────────────

function DashboardPanel({ entries, tournaments, eventRules, entryRuleIds, tournamentMatchFighterIds }: {
  entries: Entry[];
  tournaments: Tournament[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  tournamentMatchFighterIds: Record<string, Set<string>>;
}) {
  const assignedFighterIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(tournamentMatchFighterIds).forEach(ids => ids.forEach(id => s.add(id)));
    return s;
  }, [tournamentMatchFighterIds]);

  // fighter_id ごとの出場回数
  const fighterMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const fids of Object.values(tournamentMatchFighterIds)) {
      fids.forEach((fid) => { counts[fid] = (counts[fid] ?? 0) + 1; });
    }
    return counts;
  }, [tournamentMatchFighterIds]);

  const activeEntries = entries.filter(e => !e.is_withdrawn);

  // 希望試合数サマリー
  const matchCountSummary = useMemo(() => {
    let totalDesired = 0;
    let totalAssigned = 0;
    let unsatisfied = 0;
    for (const e of activeEntries) {
      const dv = e.extra_fields?.desired_match_count;
      const desired = typeof dv === "string" ? parseInt(dv, 10) || 1 : typeof dv === "number" ? dv : 1;
      const current = e.fighter_id ? (fighterMatchCounts[e.fighter_id] ?? 0) : 0;
      totalDesired += desired;
      totalAssigned += current;
      if (current < desired) unsatisfied++;
    }
    return { totalDesired, totalAssigned, unsatisfied };
  }, [activeEntries, fighterMatchCounts]);

  function buildStats(ruleId?: string) {
    const relevant = ruleId ? activeEntries.filter(e => entryRuleIds[e.id]?.has(ruleId)) : activeEntries;
    const unassigned = relevant.filter(e => !e.fighter_id || !assignedFighterIds.has(e.fighter_id)).length;
    return { total: relevant.length, unassigned };
  }

  const tournamentCountByRuleName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tournaments) {
      const k = t.default_rules ?? "__none__";
      map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  }, [tournaments]);

  const tournamentTypeCount = tournaments.filter((t) => t.type !== "one_match").length;
  const oneMatchTypeCount = tournaments.filter((t) => t.type === "one_match").length;

  const matchCountInfo = matchCountSummary.totalDesired > matchCountSummary.totalAssigned ? (
    <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <span className="text-xs text-gray-400">希望試合数:</span>
      <span className="text-sm text-white">合計 {matchCountSummary.totalDesired}試合 / 設定済 {matchCountSummary.totalAssigned}試合</span>
      {matchCountSummary.unsatisfied > 0 && (
        <span className="text-xs text-orange-400">希望未充足 {matchCountSummary.unsatisfied}名</span>
      )}
    </div>
  ) : null;

  if (eventRules.length === 0) {
    const stats = buildStats();
    if (stats.total === 0) return null;
    return (
      <div className="space-y-3">
        {matchCountInfo}
        <DashboardCard
          label="全参加者"
          total={stats.total}
          unassigned={stats.unassigned}
          tournamentCount={tournamentTypeCount}
          oneMatchCount={oneMatchTypeCount}
        />
      </div>
    );
  }

  const cards = eventRules.map(rule => {
    const stats = buildStats(rule.id);
    return {
      key: rule.id,
      label: rule.name,
      total: stats.total,
      unassigned: stats.unassigned,
      tournamentCount: tournamentCountByRuleName[rule.name] ?? 0,
    };
  });

  if (cards.every(c => c.total === 0)) return null;

  return (
    <div className="space-y-3">
      {matchCountInfo}
      {cards.map(c => (
        <DashboardCard key={c.key} label={c.label} total={c.total} unassigned={c.unassigned}
          tournamentCount={c.tournamentCount} />
      ))}
    </div>
  );
}

function DashboardCard({ label, total, unassigned, tournamentCount, oneMatchCount }: {
  label: string;
  total: number;
  unassigned: number;
  tournamentCount: number;
  oneMatchCount?: number;
}) {
  if (total === 0) return null;

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-gray-200">{label}</span>
          <span className="text-sm text-white">{total}名</span>
          {unassigned > 0 ? (
            <span className="text-sm text-orange-400">対戦未決定 {unassigned}名</span>
          ) : (
            <span className="text-xs text-green-400">全員割り当て済み ✓</span>
          )}
          {(tournamentCount > 0 || (oneMatchCount ?? 0) > 0) ? (
            <span className="text-xs text-gray-400">
              {[
                tournamentCount > 0 ? `${tournamentCount}トーナメント` : null,
                (oneMatchCount ?? 0) > 0 ? `${oneMatchCount}ワンマッチ` : null,
              ].filter(Boolean).join("・")}
            </span>
          ) : (
            <span className="text-xs text-gray-600">トーナメント未作成</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** ルール別の参加者分布パネル（画面上部に1つ表示） */
function RuleDistributionPanel({ entries, eventRules, entryRuleIds }: {
  entries: Entry[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // ルールがある場合はルール別に分布を表示、ない場合は全体で表示
  const sections = useMemo(() => {
    if (eventRules.length === 0) {
      const suggestions = computeSuggestions(entries);
      if (suggestions.length === 0) return [];
      return [{ label: "全参加者", count: entries.length, suggestions }];
    }
    return eventRules.map((rule) => {
      // ダブルエントリーの選手は entryRuleIds で両方のルールに含まれる
      const ruleEntries = entries.filter((e) => entryRuleIds[e.id]?.has(rule.id));
      const suggestions = computeSuggestions(ruleEntries);
      return { label: rule.name, count: ruleEntries.length, suggestions };
    }).filter((s) => s.suggestions.length > 0);
  }, [entries, eventRules, entryRuleIds]);

  if (sections.length === 0) return null;

  const axisLabels: Record<string, string> = { weight: "体重", age: "年齢", sex: "性別", height: "身長", experience: "経験" };
  const axisOrder = ["weight", "age", "sex", "height", "experience"];

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 transition"
      >
        <span>{"💡"} 参加者の分布（{entries.length}名）</span>
        <span className="text-xs text-gray-500">{isOpen ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-3 space-y-4 border-t border-gray-700">
          {sections.map((section) => {
            const grouped = new Map<string, typeof section.suggestions>();
            for (const s of section.suggestions) {
              const list = grouped.get(s.axis) ?? [];
              list.push(s);
              grouped.set(s.axis, list);
            }
            const sorted = new Map<string, typeof section.suggestions>();
            for (const axis of axisOrder) {
              const items = grouped.get(axis);
              if (items) sorted.set(axis, items);
            }
            for (const [axis, items] of grouped) {
              if (!sorted.has(axis)) sorted.set(axis, items);
            }

            return (
              <div key={section.label} className="pt-2">
                <p className="text-xs font-medium text-gray-400 mb-2">{section.label}（{section.count}名）</p>
                <div className="space-y-2">
                  {Array.from(sorted.entries()).map(([axis, items]) => {
                    const isReference = axis === "experience";
                    return (
                      <div key={axis} className={isReference ? "border-t border-gray-700/50 pt-2" : ""}>
                        <p className="text-xs text-gray-500 mb-1">
                          {axisLabels[axis] ?? axis}
                          {isReference && <span className="ml-1.5 text-gray-600">（参考）</span>}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((s, i) => (
                            <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${isReference ? "bg-gray-700/30 opacity-60" : "bg-gray-700/60"}`}>
                              <span className={
                                isReference ? "text-gray-500 font-bold" :
                                s.balance === "◎" ? "text-green-400 font-bold" :
                                s.balance === "△" ? "text-yellow-400 font-bold" : "text-gray-500 font-bold"
                              }>{s.balance}</span>
                              <span className={isReference ? "text-gray-500" : "text-gray-300"}>{s.belowLabel} {s.belowCount}名</span>
                              <span className="text-gray-600">/</span>
                              <span className={isReference ? "text-gray-500" : "text-gray-300"}>{s.aboveLabel} {s.aboveCount}名</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-600 pt-1">振り分けルール作成の参考にしてください</p>
        </div>
      )}
    </div>
  );
}

// ── ブラケットユーティリティ ──────────────────────────────────────────────

function bracketQuality(pairCount: number): {
  isClean: boolean;
  nextCleanPairs: number;
  prevCleanPairs: number;
  addNeeded: number;
  removeNeeded: number;
} {
  if (pairCount <= 0) return { isClean: true, nextCleanPairs: 0, prevCleanPairs: 0, addNeeded: 0, removeNeeded: 0 };
  const isClean = pairCount >= 1 && (pairCount & (pairCount - 1)) === 0;
  if (isClean) return { isClean: true, nextCleanPairs: pairCount, prevCleanPairs: pairCount, addNeeded: 0, removeNeeded: 0 };
  let next = 1;
  while (next < pairCount) next <<= 1;
  const prev = next >> 1;
  return { isClean: false, nextCleanPairs: next, prevCleanPairs: prev, addNeeded: next - pairCount, removeNeeded: pairCount - prev };
}

type MatchRow = Omit<Match, "tournament_id" | "fighter1" | "fighter2" | "winner">;

function buildBracketPreview(pairs: Pair[]): { matches: MatchRow[]; nameMap: Record<string, string>; affiliationMap: Record<string, string> } {
  const nameMap: Record<string, string> = {};
  const affiliationMap: Record<string, string> = {};
  const round1: MatchRow[] = pairs.map((p, i) => {
    nameMap[p.e1.id] = entryFullName(p.e1);
    const aff1 = [p.e1.school_name, p.e1.dojo_name].filter(Boolean).join(" ");
    if (aff1) affiliationMap[p.e1.id] = aff1;
    if (p.e2) {
      nameMap[p.e2.id] = entryFullName(p.e2);
      const aff2 = [p.e2.school_name, p.e2.dojo_name].filter(Boolean).join(" ");
      if (aff2) affiliationMap[p.e2.id] = aff2;
    }
    return {
      id: `preview-1-${i}`,
      round: 1,
      position: i,
      fighter1_id: p.e1.id,
      fighter2_id: p.e2?.id ?? null,
      winner_id: null,
      status: "ready" as const,
      match_label: p.matchLabel || null,
      rules: null,
      result_method: null,
      result_detail: null,
    };
  });

  const allMatches: MatchRow[] = [...round1];
  let count = pairs.length;
  let r = 2;
  while (count > 1) {
    count = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      allMatches.push({
        id: `preview-${r}-${i}`,
        round: r,
        position: i,
        fighter1_id: null,
        fighter2_id: null,
        winner_id: null,
        status: "waiting" as const,
        match_label: null,
        rules: null,
        result_method: null,
        result_detail: null,
      });
    }
    r++;
  }
  return { matches: allMatches, nameMap, affiliationMap };
}

function entryOptionLabel(e: Entry, prefix = ""): string {
  const name = entryFullName(e);
  const aff = [e.school_name, e.dojo_name].filter(Boolean).join(" ");
  const body = [
    e.weight ? `${parseFloat(String(e.weight))}kg` : null,
    e.height ? `${parseFloat(String(e.height))}cm` : null,
    e.age != null ? `${e.age}歳` : null,
  ].filter(Boolean).join("/");
  const exp = e.experience ? `[${e.experience}]` : "";
  return [prefix + name, aff, body, exp].filter(Boolean).join("  ");
}

// ── BracketQualityBadge ──────────────────────────────────────────────────

function BracketQualityBadge({ pairCount }: { pairCount: number }) {
  const [open, setOpen] = useState(false);

  if (pairCount === 0) return <span className="text-xs text-gray-500 shrink-0">0対戦</span>;

  const q = bracketQuality(pairCount);

  if (q.isClean) {
    return <span className="text-xs text-green-400 shrink-0 font-medium">{pairCount}対戦 ✓</span>;
  }

  const isYellow = q.addNeeded <= 2 || q.removeNeeded <= 2;
  const isNearNext = q.addNeeded <= q.removeNeeded;
  const hint = isNearNext
    ? `あと${q.addNeeded}ペア（${q.addNeeded * 2}名）追加か不戦勝で ${q.nextCleanPairs} 対戦になります`
    : `あと${q.removeNeeded}ペア（${q.removeNeeded * 2}名）減らすと ${q.prevCleanPairs} 対戦になります`;

  return (
    <span className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={`text-xs font-medium rounded px-2 py-1 flex items-center gap-1 transition ${
          isYellow
            ? "bg-yellow-900/60 text-yellow-200 border border-yellow-600 hover:bg-yellow-800/60"
            : "bg-red-900/60 text-red-200 border border-red-700 hover:bg-red-800/60"
        }`}>
        <span>⚠ {pairCount}対戦 — 不規則</span>
        <span className="text-[10px] opacity-70">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-3 space-y-1.5">
          <p className="text-xs text-white font-medium">{pairCount}対戦 — ブラケットが不規則</p>
          <p className="text-xs text-gray-400">2の累乗でないため、一部のラウンドで試合数が揃いません。</p>
          <div className="border-t border-gray-700 pt-1.5 space-y-1">
            <p className="text-xs text-gray-300">
              推奨: <span className="text-white font-medium">{q.prevCleanPairs}対戦</span>（{q.prevCleanPairs * 2}名以下）または <span className="text-white font-medium">{q.nextCleanPairs}対戦</span>（{q.nextCleanPairs * 2}名以下）
            </p>
            <p className="text-xs text-yellow-300">{hint}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-300 pt-0.5">キャンセル</button>
        </div>
      )}
    </span>
  );
}

// ── GroupSection ──────────────────────────────────────────────────────────

function GroupSection({ group, entries, unassigned, allEntries, rules, eventRules, entryRuleIds, defaultRuleId, mismatchSettings, ageCategories, canRemove, getDesiredMatchCount, getTotalMatchCount, existingPairs, onRename, onRemove, onAutoAssign, onUpdateMismatch, onAddPair, onRemovePair, onMovePair, onUpdateE1, onUpdateE2, onUpdateField, onUpdateFilters }: {
  group: Group;
  entries: Entry[];
  unassigned: Entry[];
  allEntries: Entry[];
  rules: Rule[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  defaultRuleId: string;
  mismatchSettings: MismatchSettings;
  ageCategories?: AgeCategory[];
  canRemove: boolean;
  getDesiredMatchCount: (entry: Entry) => number;
  getTotalMatchCount: (entry: Entry) => number;
  existingPairs: { e1Id: string; e2Id: string; ruleId: string; pairId: string }[];
  onRename: (name: string) => void;
  onRemove: () => void;
  onAutoAssign: (entries: Entry[]) => void;
  onUpdateMismatch: (maxWeightDiff: number | null, maxHeightDiff: number | null) => void;
  onAddPair: () => void;
  onRemovePair: (pairId: string) => void;
  onMovePair: (pairId: string, dir: "up" | "down") => void;
  onUpdateE1: (pairId: string, entryId: string) => void;
  onUpdateE2: (pairId: string, entryId: string | null) => void;
  onUpdateField: (pairId: string, field: "matchLabel" | "ruleId", value: string) => void;
  onUpdateFilters: (filters: GroupFilters) => void;
}) {
  const [previewMode, setPreviewMode] = useState(false);
  const [manualName, setManualName] = useState(false);
  const [minWeight, setMinWeight] = useState(group.filters?.minWeight ?? "");
  const [maxWeight, setMaxWeight] = useState(group.filters?.maxWeight ?? "");
  const [minAge, setMinAge] = useState(group.filters?.minAge ?? "");
  const [maxAge, setMaxAge] = useState(group.filters?.maxAge ?? "");
  const [sexFilter, setSexFilter] = useState(group.filters?.sexFilter ?? "");
  const [minGrade, setMinGrade] = useState(group.filters?.minGrade ?? "");
  const [maxGrade, setMaxGrade] = useState(group.filters?.maxGrade ?? "");
  const [experienceFilter, setExperienceFilter] = useState(group.filters?.experienceFilter ?? "");
  const [minHeight, setMinHeight] = useState(group.filters?.minHeight ?? "");
  const [maxHeight, setMaxHeight] = useState(group.filters?.maxHeight ?? "");
  const [nameFilter, setNameFilter] = useState(group.filters?.nameFilter ?? "");
  const [matchCountFilter, setMatchCountFilter] = useState(group.filters?.matchCountFilter ?? "");
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());

  // フィルター条件からトーナメント名を自動生成（年代・年齢・体重・身長・性別のみ反映）
  useEffect(() => {
    if (manualName) return;
    const parts: string[] = [];
    if (minGrade || maxGrade) {
      if (minGrade && maxGrade && minGrade !== maxGrade) parts.push(`${minGrade}〜${maxGrade}`);
      else if (minGrade && maxGrade) parts.push(minGrade);
      else if (minGrade) parts.push(`${minGrade}以上`);
      else parts.push(`${maxGrade}以下`);
    }
    if (sexFilter === "male") parts.push("男子");
    else if (sexFilter === "female") parts.push("女子");
    if (minAge || maxAge) {
      if (minAge && maxAge) parts.push(`${minAge}〜${maxAge}歳`);
      else if (minAge) parts.push(`${minAge}歳以上`);
      else parts.push(`${maxAge}歳以下`);
    }
    if (minWeight || maxWeight) {
      if (minWeight && maxWeight) parts.push(`${minWeight}〜${maxWeight}kg`);
      else if (minWeight) parts.push(`${minWeight}kg以上`);
      else parts.push(`${maxWeight}kg以下`);
    }
    if (minHeight || maxHeight) {
      if (minHeight && maxHeight) parts.push(`${minHeight}〜${maxHeight}cm`);
      else if (minHeight) parts.push(`${minHeight}cm以上`);
      else parts.push(`${maxHeight}cm以下`);
    }
    if (parts.length > 0) {
      const autoName = parts.join(" ");
      onRename(autoName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sexFilter, minAge, maxAge, minWeight, maxWeight, minHeight, maxHeight, minGrade, maxGrade, manualName]);

  useEffect(() => {
    onUpdateFilters({ minWeight, maxWeight, minAge, maxAge, sexFilter, minGrade, maxGrade, experienceFilter, minHeight, maxHeight, nameFilter, matchCountFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minWeight, maxWeight, minAge, maxAge, sexFilter, minGrade, maxGrade, experienceFilter, minHeight, maxHeight, nameFilter, matchCountFilter]);

  const filteredUnassigned = unassigned.filter((e) => {
    if (minWeight !== "" && (e.weight == null || e.weight < parseFloat(minWeight))) return false;
    if (maxWeight !== "" && (e.weight == null || e.weight > parseFloat(maxWeight))) return false;
    if (minAge !== "" && (e.age == null || e.age < parseInt(minAge))) return false;
    if (maxAge !== "" && (e.age == null || e.age > parseInt(maxAge))) return false;
    if (minHeight !== "" && (e.height == null || e.height < parseFloat(minHeight))) return false;
    if (maxHeight !== "" && (e.height == null || e.height > parseFloat(maxHeight))) return false;
    if (sexFilter && e.sex !== sexFilter) return false;
    if ((minGrade || maxGrade) && !gradeFilterPredicate(minGrade, maxGrade, ageCategories)(e)) return false;
    if (experienceFilter && !e.experience?.includes(experienceFilter)) return false;
    if (nameFilter && !entryFullName(e).toLowerCase().includes(nameFilter.toLowerCase())) return false;
    const matchPred = matchCountFilterPredicate(matchCountFilter, getTotalMatchCount, getDesiredMatchCount);
    if (!matchPred(e)) return false;
    return true;
  });

  // フィルタに応じたソート
  const sortComparator = buildFilterSortComparator({ minGrade, maxGrade, minAge, maxAge, minWeight, maxWeight, minHeight, maxHeight });
  const sortedFilteredUnassigned = [...filteredUnassigned].sort(sortComparator);

  // selectedEntryIds をフィルタ結果に合わせてクリーンアップ
  const validSelectedIds = new Set([...selectedEntryIds].filter((id) => sortedFilteredUnassigned.some((e) => e.id === id)));

  const groupMismatch: MismatchSettings = {
    maxWeightDiff: group.maxWeightDiff,
    maxHeightDiff: group.maxHeightDiff,
  };

  const isOneMatch = group.type === "one_match";
  const preview = !isOneMatch && previewMode && group.pairs.length > 1 ? buildBracketPreview(group.pairs) : null;
  const inpSm = "bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-blue-500";

  return (
    <div className="border border-gray-600 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={group.name} onChange={(e) => { setManualName(true); onRename(e.target.value); }} placeholder="トーナメント名（絞り込みから自動入力）"
          className="flex-1 min-w-[140px] bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm font-medium text-white outline-none focus:border-blue-500" />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">体重差</span>
          <input type="number" min="0" step="0.5" value={group.maxWeightDiff ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); onUpdateMismatch(v ? parseFloat(v) : null, group.maxHeightDiff); }}
            placeholder="無制限" className={`w-20 ${inpSm}`} />
          <span className="text-xs text-gray-500">kg以内</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-500">身長差</span>
          <input type="number" min="0" step="1" value={group.maxHeightDiff ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); onUpdateMismatch(group.maxWeightDiff, v ? parseFloat(v) : null); }}
            placeholder="無制限" className={`w-20 ${inpSm}`} />
          <span className="text-xs text-gray-500">cm以内</span>
        </div>
        {isOneMatch ? (
          <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded shrink-0">ワンマッチ</span>
        ) : (
          <BracketQualityBadge pairCount={group.pairs.length} />
        )}
        {!isOneMatch && group.pairs.length > 1 && (
          <div className="flex rounded overflow-hidden border border-gray-700 text-xs shrink-0">
            <button onClick={() => setPreviewMode(false)}
              className={`px-2 py-1 transition ${!previewMode ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
              編集
            </button>
            <button onClick={() => setPreviewMode(true)}
              className={`px-2 py-1 transition ${previewMode ? "bg-blue-700 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
              ブラケット
            </button>
          </div>
        )}
        {canRemove && (
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 shrink-0 transition">削除</button>
        )}
      </div>

      <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 space-y-2">
        <p className="text-xs text-gray-400 font-medium">{isOneMatch ? "選手を選択" : "選手を絞り込んでこのトーナメントに追加"}</p>
        {!isOneMatch && (<>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">年代</span>
            <select value={minGrade} onChange={(e) => setMinGrade(e.target.value)} className={`w-20 ${inpSm}`}>
              <option value="">下限</option>
              {getGradeOptions(ageCategories).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500">〜</span>
            <select value={maxGrade} onChange={(e) => setMaxGrade(e.target.value)} className={`w-20 ${inpSm}`}>
              <option value="">上限</option>
              {getGradeOptions(ageCategories).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">年齢</span>
            <input value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="下限" type="number" min="0" max="99" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">〜</span>
            <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="上限" type="number" min="0" max="99" className={`w-14 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">体重</span>
            <input value={minWeight} onChange={(e) => setMinWeight(e.target.value)} placeholder="下限" type="number" min="0" step="0.5" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">〜</span>
            <input value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} placeholder="上限" type="number" min="0" step="0.5" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">kg</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">身長</span>
            <input value={minHeight} onChange={(e) => setMinHeight(e.target.value)} placeholder="下限" type="number" min="0" step="1" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">〜</span>
            <input value={maxHeight} onChange={(e) => setMaxHeight(e.target.value)} placeholder="上限" type="number" min="0" step="1" className={`w-14 ${inpSm}`} />
            <span className="text-xs text-gray-500">cm</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">性別</span>
            <div className="relative">
              <select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)} className={`${inpSm} w-16 pr-6`}>
                <option value="">全て</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
              </select>
              {sexFilter && (
                <button type="button" onClick={() => setSexFilter("")} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs leading-none" aria-label="性別をクリア">×</button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">経験</span>
            <input value={experienceFilter} onChange={(e) => setExperienceFilter(e.target.value)} placeholder="10年" className={`w-20 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">名前</span>
            <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="山田" className={`w-20 ${inpSm}`} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">試合数</span>
            <div className="relative">
              <select value={matchCountFilter} onChange={(e) => setMatchCountFilter(e.target.value)} className={`${inpSm} w-20 pr-6`}>
                <option value="">全て</option>
                <option value="unmet">未達</option>
                {[0,1,2,3,4,5,6,7,8,9].map((n) => (
                  <option key={n} value={String(n)}>{n}試合</option>
                ))}
              </select>
              {matchCountFilter && (
                <button type="button" onClick={() => setMatchCountFilter("")} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs leading-none" aria-label="試合数をクリア">×</button>
              )}
            </div>
          </div>
        </div>
        </>)}

        {sortedFilteredUnassigned.length > 0 ? (
          <>
            {(() => {
              const allRules = eventRules.length > 0 ? eventRules : [];
              const ruleGroups = buildRuleGroups(sortedFilteredUnassigned, allRules, defaultRuleId, entryRuleIds, getDesiredMatchCount);

              const renderEntryChip = (e: Entry) => {
                const desired = getDesiredMatchCount(e);
                const current = getTotalMatchCount(e);
                const tooltip = [
                  desired > 1 ? `希望${desired}試合 / 設定済${current}試合` : "",
                  e.memo ? `📝 ${e.memo}` : "",
                  e.admin_memo ? `📋 ${e.admin_memo}` : "",
                ].filter(Boolean).join("\n");
                const matchCountLabel = desired > 1 ? ` (${current}/${desired})` : "";
                const isSelected = validSelectedIds.has(e.id);
                return (
                  <span key={e.id} title={tooltip || undefined}
                    onClick={() => {
                      setSelectedEntryIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id);
                        else next.add(e.id);
                        return next;
                      });
                    }}
                    className={`text-xs px-2 py-0.5 rounded-full cursor-pointer select-none transition ${
                      isSelected
                        ? "ring-2 ring-blue-500 bg-blue-900/50 text-blue-200"
                        : e.admin_memo ? "bg-yellow-900/50 text-yellow-200 ring-1 ring-yellow-700" : "bg-gray-700 text-gray-300"
                    }`}>
                    {entryFullName(e)}{matchCountLabel}
                    {e.age != null ? ` ${e.age}才` : ""}
                    {e.grade ? `/${e.grade}` : ""}
                    {e.weight ? ` ${parseFloat(String(e.weight))}kg` : ""}
                    {e.admin_memo && <span className="ml-1 opacity-70">📋</span>}
                    {e.memo && !e.admin_memo && <span className="ml-1 opacity-50">📝</span>}
                  </span>
                );
              };

              return (
                <div className="space-y-2">
                  {ruleGroups.map((rg, rgi) => (
                    <div key={rg.rule?.id ?? `no-rule-${rgi}`} className="space-y-1">
                      {(ruleGroups.length > 1 || rg.rule) && (
                        <p className="text-xs text-gray-400 font-medium">
                          {rg.rule?.name ?? "ルール未設定"}（{rg.entries.length}名）
                          <span className="text-gray-500 ml-1">— 合計希望試合数: {rg.totalDesired}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {rg.entries.map(renderEntryChip)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {!isOneMatch && (
              <div className="flex flex-wrap gap-1 items-center">
                <button onClick={() => setSelectedEntryIds(new Set(sortedFilteredUnassigned.map((e) => e.id)))}
                  className="text-xs text-blue-400 hover:text-blue-300 transition">全選択</button>
                <button onClick={() => setSelectedEntryIds(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-300 transition">全解除</button>
                <span className="text-xs text-gray-500">{validSelectedIds.size > 0 ? `${validSelectedIds.size}名選択中` : ""}</span>
              </div>
            )}
            {!isOneMatch && (() => {
              const totalEntries = group.pairs.reduce((s, p) => s + 1 + (p.e2 ? 1 : 0), 0) + sortedFilteredUnassigned.length;
              const totalPairs = Math.ceil(totalEntries / 2);
              const q = bracketQuality(totalPairs);
              if (!q.isClean && totalPairs > 1) {
                return (
                  <p className={`text-xs px-2 py-1 rounded ${
                    q.addNeeded <= 2 || q.removeNeeded <= 2
                      ? "bg-yellow-900/40 text-yellow-300 border border-yellow-800"
                      : "bg-red-900/40 text-red-300 border border-red-900"
                  }`}>
                    ⚠ 追加後 {totalPairs} 対戦 — ブラケットが不規則になります。
                    理想は{" "}
                    {q.prevCleanPairs > 0 && <><b>{q.prevCleanPairs * 2}名以下</b>（{q.prevCleanPairs}対戦）</>}
                    {q.prevCleanPairs > 0 && <> または </>}
                    <b>{q.nextCleanPairs * 2}名以下</b>（{q.nextCleanPairs}対戦）
                  </p>
                );
              }
              return null;
            })()}
            {!isOneMatch && (
              <div className="flex gap-2">
                <button onClick={() => onAutoAssign(sortedFilteredUnassigned)}
                  className="flex-1 bg-blue-700 hover:bg-blue-600 py-1.5 rounded text-xs font-medium transition">
                  全員（{sortedFilteredUnassigned.length}名）を追加してペアリング
                </button>
                <button
                  onClick={() => {
                    const selected = sortedFilteredUnassigned.filter((e) => validSelectedIds.has(e.id));
                    onAutoAssign(selected);
                    setSelectedEntryIds(new Set());
                  }}
                  disabled={validSelectedIds.size === 0}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                    validSelectedIds.size > 0
                      ? "bg-green-700 hover:bg-green-600"
                      : "bg-gray-700 text-gray-500 cursor-not-allowed"
                  }`}>
                  選択した{validSelectedIds.size}名を追加してペアリング
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500">
            {unassigned.length === 0 ? "未割当の選手はいません" : "条件に合う選手がいません"}
          </p>
        )}
      </div>

      {previewMode && preview ? (
        <BracketView matches={preview.matches} nameMap={preview.nameMap} affiliationMap={preview.affiliationMap} />
      ) : (
        <>
          {group.pairs.length > 0 && (
            <div className="space-y-2">
              {group.pairs.map((pair, idx) => {
                const compat: CompatibilityLevel = pair.e2
                  ? checkCompatibility(pair.e1, pair.e2, groupMismatch)
                  : "unknown";
                const defaultRule = rules.find((r) => r.id === defaultRuleId);
                const e1Options = [pair.e1, ...sortedFilteredUnassigned];
                // 同じルール内で既に対戦が組まれている相手を除外（自分自身のペアは除く）
                const isAlreadyPaired = (entryId: string) =>
                  existingPairs.some((p) =>
                    p.pairId !== pair.id &&
                    p.ruleId === pair.ruleId &&
                    ((p.e1Id === pair.e1.id && p.e2Id === entryId) ||
                     (p.e2Id === pair.e1.id && p.e1Id === entryId))
                  );
                const e2Options = [...(pair.e2 ? [pair.e2] : []), ...sortedFilteredUnassigned.filter((e) => e.id !== pair.e1.id && !isAlreadyPaired(e.id))];
                const e2Sorted = [...e2Options].sort((a, b) => entryCompatScore(a, pair.e1) - entryCompatScore(b, pair.e1));

                const weightDiffText = pair.e2 && pair.e1.weight && pair.e2.weight
                  ? `体重差 ${Math.abs(pair.e1.weight - pair.e2.weight).toFixed(1)}kg` : null;
                const heightDiffText = pair.e2 && pair.e1.height && pair.e2.height
                  ? `身長差 ${Math.abs(pair.e1.height - pair.e2.height).toFixed(0)}cm` : null;
                const compatText =
                  compat === "ok"   ? `規定内${[weightDiffText, heightDiffText].filter(Boolean).map(t => `（${t}）`).join("")}` :
                  compat === "warn" ? `注意 — ${[weightDiffText, heightDiffText].filter(Boolean).join("・")}` :
                  compat === "ng"   ? `超過 — ${[weightDiffText, heightDiffText].filter(Boolean).join("・")}` : null;

                const memos = [
                  pair.e1.admin_memo ? { name: entryFullName(pair.e1), text: pair.e1.admin_memo, kind: "admin" as const } : null,
                  pair.e2?.admin_memo ? { name: entryFullName(pair.e2), text: pair.e2.admin_memo, kind: "admin" as const } : null,
                  pair.e1.memo ? { name: entryFullName(pair.e1), text: pair.e1.memo, kind: "app" as const } : null,
                  pair.e2?.memo ? { name: entryFullName(pair.e2), text: pair.e2.memo, kind: "app" as const } : null,
                ].filter((m): m is NonNullable<typeof m> => m !== null);

                return (
                  <div key={pair.id} className="border border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex gap-0">
                      <div className="flex-1 p-2.5 space-y-1.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 w-5 shrink-0 text-center">{idx + 1}</span>
                          <select value={pair.e1.id} onChange={(ev) => onUpdateE1(pair.id, ev.target.value)}
                            className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                            {e1Options.map((e) => (
                              <option key={e.id} value={e.id}>{entryOptionLabel(e)}</option>
                            ))}
                          </select>
                          <div className="flex flex-col shrink-0">
                            <button onClick={() => onMovePair(pair.id, "up")} disabled={idx === 0}
                              className="text-gray-500 hover:text-gray-200 disabled:opacity-50 text-xs leading-none px-1 py-0.5 transition">▲</button>
                            <button onClick={() => onMovePair(pair.id, "down")} disabled={idx === group.pairs.length - 1}
                              className="text-gray-500 hover:text-gray-200 disabled:opacity-50 text-xs leading-none px-1 py-0.5 transition">▼</button>
                          </div>
                          <button onClick={() => onRemovePair(pair.id)}
                            className="text-xs text-red-400 hover:text-red-300 shrink-0 transition">削除</button>
                        </div>
                        <div className="flex items-center gap-1.5 pl-6">
                          <span className="text-gray-600 text-xs shrink-0">vs</span>
                          <select value={pair.e2?.id ?? ""} onChange={(ev) => onUpdateE2(pair.id, ev.target.value || null)}
                            className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500">
                            <option value="">不戦勝</option>
                            {e2Sorted.map((e) => {
                              const c: CompatibilityLevel = checkCompatibility(pair.e1, e, groupMismatch);
                              const prefix = c === "ok" ? "◎ " : c === "warn" ? "△ " : c === "ng" ? "✕ " : "";
                              return (
                                <option key={e.id} value={e.id}>{entryOptionLabel(e, prefix)}</option>
                              );
                            })}
                          </select>
                        </div>
                        {pair.e2 && compatText && (
                          <p className={`text-xs pl-6 font-medium ${COMPAT_COLORS[compat]}`}>
                            {COMPAT_LABEL[compat]} {compatText}
                          </p>
                        )}
                      </div>
                      {memos.length > 0 && (
                        <div className="w-44 shrink-0 border-l border-gray-700 bg-gray-900/40 p-2 space-y-1.5">
                          {memos.map((m, mi) => (
                            <div key={mi}>
                              <p className="text-[10px] text-gray-500">{m.kind === "admin" ? "📋" : "📝"} {m.name}</p>
                              <p className={`text-xs leading-tight ${m.kind === "admin" ? "text-yellow-200" : "text-gray-400 italic"}`}>{m.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={onAddPair} disabled={unassigned.length === 0 || (isOneMatch && group.pairs.length >= 1)}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-1.5 rounded text-xs transition">
            ＋ 手動で対戦を追加
          </button>
        </>
      )}
    </div>
  );
}

// ── CourtSection ──────────────────────────────────────────────────────────

function TournamentEditor({ eventId, entries, entryRuleIds, eventRules, tournaments, tournamentMatchFighterIds, rules, mismatchSettings, savedMatchPairs, bracketRuleCount, allMatchRows, timerPresets, ageCategories, courtCount, courtNames, onCreated, onAutoCreate, onNavigateToBracketRules }: {
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  tournaments: Tournament[];
  tournamentMatchFighterIds: Record<string, Set<string>>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  savedMatchPairs: Array<{ f1: string; f2: string; rules: string | null }>;
  bracketRuleCount: number;
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>;
  timerPresets: TimerPreset[];
  ageCategories?: AgeCategory[];
  courtCount: number;
  courtNames: string[];
  onCreated: () => void;
  onAutoCreate: () => void;
  onNavigateToBracketRules: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([
    { id: crypto.randomUUID(), name: "トーナメント1", type: "tournament", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff },
  ]);
  const [defaultRuleId, setDefaultRuleId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editingSortOrder, setEditingSortOrder] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const [startTime, setStartTime] = useState(() => roundedNowHHMM());
  const [intervalMin, setIntervalMin] = useState(1);
  const sectionRef = useRef<HTMLDivElement>(null);
  const newlyCreatedIdRef = useRef<string | null>(null);

  // 親から新しいトーナメントデータが来たらローカル順序リセット
  useEffect(() => { setLocalOrder(null); }, [tournaments]);

  // 新規作成後、対象トーナメントにスクロール
  useEffect(() => {
    if (!newlyCreatedIdRef.current) return;
    const el = document.getElementById(`tournament-${newlyCreatedIdRef.current}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      newlyCreatedIdRef.current = null;
    }
  }, [tournaments]);

  // fighter_id ごとの確定済みトーナメント出場回数
  const fighterMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [tid, fids] of Object.entries(tournamentMatchFighterIds)) {
      if (tid === editingTournamentId) continue;
      fids.forEach((fid) => { counts[fid] = (counts[fid] ?? 0) + 1; });
    }
    return counts;
  }, [tournamentMatchFighterIds, editingTournamentId]);

  // 編集中グループから fighter_id ごとの出場回数
  const groupFighterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const fighterIdsByGroup: Record<string, Set<string>> = {};
    for (const g of groups) {
      const fids = new Set<string>();
      for (const p of g.pairs) {
        if (p.e1.fighter_id) fids.add(p.e1.fighter_id);
        if (p.e2?.fighter_id) fids.add(p.e2.fighter_id);
      }
      fighterIdsByGroup[g.id] = fids;
    }
    for (const fids of Object.values(fighterIdsByGroup)) {
      fids.forEach((fid) => { counts[fid] = (counts[fid] ?? 0) + 1; });
    }
    return counts;
  }, [groups]);

  function getDesiredMatchCount(entry: Entry): number {
    const v = entry.extra_fields?.desired_match_count;
    if (typeof v === "string") { const n = parseInt(v, 10); return isNaN(n) ? 1 : n; }
    if (typeof v === "number") return v;
    return 1;
  }

  function getTotalMatchCount(entry: Entry): number {
    if (!entry.fighter_id) return 0;
    return (fighterMatchCounts[entry.fighter_id] ?? 0) + (groupFighterCounts[entry.fighter_id] ?? 0);
  }

  const filteredEntries = entries.filter((e) => {
    if (e.is_withdrawn) return false;
    if (defaultRuleId && !entryRuleIds[e.id]?.has(defaultRuleId)) return false;
    if (!e.fighter_id) return true;
    const desired = getDesiredMatchCount(e);
    const current = fighterMatchCounts[e.fighter_id] ?? 0;
    const inGroups = groupFighterCounts[e.fighter_id] ?? 0;
    return (current + inGroups) < desired;
  });

  const assignedIds = new Set(
    groups.flatMap((g) => g.pairs.flatMap((p) => [p.e1.id, p.e2?.id].filter((x): x is string => !!x))),
  );
  const unassigned = filteredEntries.filter((e) => !assignedIds.has(e.id));

  function autoAssignGroup(groupId: string, entriesToAssign: Entry[]) {
    const newPairs = pairsFromEntries(entriesToAssign);
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, pairs: [...g.pairs, ...newPairs] }));
  }

  /** 全自動対戦表作成: ルールごとにトーナメントを作成しペアリング */
  function autoCreateAll() {
    const displayRules = eventRules.length > 0 ? eventRules : [];
    // 未割当選手を取得（filteredEntries のうち、ルール絞込なしで全員）
    const allUnassigned = entries.filter((e) => {
      if (e.is_withdrawn) return false;
      if (!e.fighter_id) return true;
      const desired = getDesiredMatchCount(e);
      const current = fighterMatchCounts[e.fighter_id] ?? 0;
      return current < desired;
    });

    if (allUnassigned.length === 0) return;

    const newGroups: Group[] = [];

    if (displayRules.length > 0) {
      for (const rule of displayRules) {
        const ruleEntries = allUnassigned.filter((e) => entryRuleIds[e.id]?.has(rule.id));
        if (ruleEntries.length === 0) continue;
        const pairs = pairsFromEntries(ruleEntries);
        newGroups.push({
          id: crypto.randomUUID(),
          name: rule.name,
          type: "tournament",
          pairs,
          maxWeightDiff: mismatchSettings.maxWeightDiff,
          maxHeightDiff: mismatchSettings.maxHeightDiff,
        });
      }
      // ルールに属さない選手
      const noRuleEntries = allUnassigned.filter((e) => {
        const rids = entryRuleIds[e.id];
        return !rids || rids.size === 0 || !displayRules.some((r) => rids.has(r.id));
      });
      if (noRuleEntries.length > 0) {
        const pairs = pairsFromEntries(noRuleEntries);
        newGroups.push({
          id: crypto.randomUUID(),
          name: "ルール未設定",
          type: "tournament",
          pairs,
          maxWeightDiff: mismatchSettings.maxWeightDiff,
          maxHeightDiff: mismatchSettings.maxHeightDiff,
        });
      }
    } else {
      // ルールが設定されていない場合、全員で1つのトーナメント
      const pairs = pairsFromEntries(allUnassigned);
      newGroups.push({
        id: crypto.randomUUID(),
        name: "トーナメント1",
        type: "tournament",
        pairs,
        maxWeightDiff: mismatchSettings.maxWeightDiff,
        maxHeightDiff: mismatchSettings.maxHeightDiff,
      });
    }

    if (newGroups.length > 0) {
      setGroups(newGroups);
      setShowCreateForm(true);
    }
  }

  function addGroup(type: "tournament" | "one_match" = "tournament") {
    const existingOfType = groups.filter((g) => g.type === type).length;
    const n = existingOfType + 1;
    const name = type === "one_match" ? `ワンマッチ${n}` : `トーナメント${n}`;
    setGroups((prev) => [...prev, { id: crypto.randomUUID(), name, type, pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
  }

  function updateGroupMismatch(groupId: string, maxWeightDiff: number | null, maxHeightDiff: number | null) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, maxWeightDiff, maxHeightDiff }));
  }

  function removeGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function renameGroup(groupId: string, name: string) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, name }));
  }

  function addEmptyPair(groupId: string) {
    if (unassigned.length === 0) return;
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g,
      pairs: [...g.pairs, { id: crypto.randomUUID(), e1: unassigned[0], e2: null, matchLabel: "", ruleId: "" }],
    }));
  }

  function removePair(groupId: string, pairId: string) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : { ...g, pairs: g.pairs.filter((p) => p.id !== pairId) }));
  }

  function updateE1(groupId: string, pairId: string, entryId: string) {
    const e = entries.find((e) => e.id === entryId);
    if (!e) return;
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, pairs: g.pairs.map((p) => p.id !== pairId ? p : { ...p, e1: e }),
    }));
  }

  function updateE2(groupId: string, pairId: string, entryId: string | null) {
    const e = entryId ? entries.find((e) => e.id === entryId) ?? null : null;
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, pairs: g.pairs.map((p) => p.id !== pairId ? p : { ...p, e2: e }),
    }));
  }

  function updateField(groupId: string, pairId: string, field: "matchLabel" | "ruleId", value: string) {
    setGroups((prev) => prev.map((g) => g.id !== groupId ? g : {
      ...g, pairs: g.pairs.map((p) => p.id !== pairId ? p : { ...p, [field]: value }),
    }));
  }

  function movePair(groupId: string, pairId: string, dir: "up" | "down") {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g;
      const idx = g.pairs.findIndex((p) => p.id === pairId);
      if (idx < 0) return g;
      const newPairs = [...g.pairs];
      if (dir === "up" && idx > 0) {
        [newPairs[idx - 1], newPairs[idx]] = [newPairs[idx], newPairs[idx - 1]];
      } else if (dir === "down" && idx < newPairs.length - 1) {
        [newPairs[idx + 1], newPairs[idx]] = [newPairs[idx], newPairs[idx + 1]];
      }
      return { ...g, pairs: newPairs };
    }));
  }

  async function confirm() {
    const activeGroups = groups.filter((g) => g.pairs.length > 0);
    if (activeGroups.length === 0) return;
    setConfirming(true);
    const defaultRule = rules.find((r) => r.id === defaultRuleId);
    const responses = await Promise.all(
      activeGroups.map((g, groupIndex) => {
        const f = g.filters;
        // 1ペアのトーナメントは自動でワンマッチ扱いにする
        const effectiveType = g.type === "tournament" && g.pairs.length === 1 ? "one_match" : g.type;
        const payload = {
          courtName: g.name || "トーナメント",
          courtNum: "",
          type: effectiveType,
          pairs: g.pairs.map((p) => ({
            e1: p.e1,
            e2: p.e2,
            matchLabel: p.matchLabel || null,
            ruleName: (p.ruleId ? rules.find((r) => r.id === p.ruleId)?.name : null) ?? defaultRule?.name ?? null,
          })),
          eventId,
          sortOrder: editingSortOrder ?? (Math.max(0, ...tournaments.map(t => t.sort_order)) + groupIndex + 1),
          defaultRuleName: defaultRule?.name ?? null,
          maxWeightDiff: g.maxWeightDiff,
          maxHeightDiff: g.maxHeightDiff,
          filterMinWeight: f?.minWeight ? parseFloat(f.minWeight) : null,
          filterMaxWeight: f?.maxWeight ? parseFloat(f.maxWeight) : null,
          filterMinAge: f?.minAge ? parseInt(f.minAge) : null,
          filterMaxAge: f?.maxAge ? parseInt(f.maxAge) : null,
          filterSex: f?.sexFilter || null,
          filterExperience: f?.experienceFilter || null,
          filterMinGrade: f?.minGrade || null,
          filterMaxGrade: f?.maxGrade || null,
          filterMinHeight: f?.minHeight ? parseFloat(f.minHeight) : null,
          filterMaxHeight: f?.maxHeight ? parseFloat(f.maxHeight) : null,
        };
        // 編集中の場合は PUT（id, sort_order, created_at を保持）、新規の場合は POST
        if (editingTournamentId && groupIndex === 0) {
          return fetch(`/api/admin/tournaments/${editingTournamentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        return fetch("/api/admin/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      })
    );
    // エラーチェック（重複ワンマッチなど）
    const failedRes = responses.find((r) => !r.ok);
    if (failedRes) {
      const err = await failedRes.json();
      alert(err.error || "保存に失敗しました");
      setConfirming(false);
      return;
    }
    const created = await Promise.all(responses.map((r) => r.json()));
    if (!editingTournamentId && created[0]?.id) newlyCreatedIdRef.current = created[0].id;

    // 手動絞り込み条件を振り分けルールとして登録するか確認
    for (const g of activeGroups) {
      const f = g.filters;
      if (!f) continue;
      const hasFilter = !!(f.minWeight || f.maxWeight || f.minAge || f.maxAge || f.sexFilter || f.minGrade || f.maxGrade || f.minHeight || f.maxHeight);
      if (!hasFilter) continue;
      // 同名ルールが存在するか確認
      const existRes = await fetch(`/api/admin/bracket-rules?event_id=${eventId}`);
      if (existRes.ok) {
        const existingRules: Array<{ name: string }> = await existRes.json();
        if (existingRules.some(r => r.name === g.name)) continue;
      }
      const shouldSave = window.confirm(`この絞り込み条件を振り分けルールとして登録しますか？\n\n「${g.name}」`);
      if (shouldSave) {
        // minGrade/maxGrade から max_grade_diff を推定（範囲のサイズ）
        const minGradeNum = f.minGrade ? gradeToNumber(f.minGrade) : null;
        const maxGradeNum = f.maxGrade ? gradeToNumber(f.maxGrade) : null;
        const gradeDiff = (minGradeNum != null && maxGradeNum != null) ? Math.abs(maxGradeNum - minGradeNum) : null;
        await fetch("/api/admin/bracket-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            name: g.name,
            rule_id: defaultRuleId || null,
            min_weight: f.minWeight ? parseFloat(f.minWeight) : null,
            max_weight: f.maxWeight ? parseFloat(f.maxWeight) : null,
            min_age: f.minAge ? parseInt(f.minAge) : null,
            max_age: f.maxAge ? parseInt(f.maxAge) : null,
            sex_filter: f.sexFilter || null,
            min_grade: f.minGrade || null,
            max_grade: f.maxGrade || null,
            max_grade_diff: gradeDiff,
            min_height: f.minHeight ? parseFloat(f.minHeight) : null,
            max_height: f.maxHeight ? parseFloat(f.maxHeight) : null,
            max_weight_diff: g.maxWeightDiff,
            max_height_diff: g.maxHeightDiff,
          }),
        });
      }
    }

    setConfirming(false);
    setShowCreateForm(false);
    setEditingTournamentId(null);
    setEditingSortOrder(null);
    setGroups([{ id: crypto.randomUUID(), name: "トーナメント1", type: "tournament", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
    onCreated();
  }

  const totalPairs = groups.reduce((sum, g) => sum + g.pairs.length, 0);
  const activeGroups = groups.filter((g) => g.pairs.length > 0);
  const activeGroupCount = activeGroups.length;
  const activeTournamentCount = activeGroups.filter((g) => g.type === "tournament").length;
  const activeOneMatchCount = activeGroups.filter((g) => g.type === "one_match").length;
  const confirmLabel = (() => {
    const parts: string[] = [];
    if (activeTournamentCount > 0) parts.push(`${activeTournamentCount}トーナメント`);
    if (activeOneMatchCount > 0) parts.push(`${activeOneMatchCount}ワンマッチ`);
    return `登録する（${parts.join("・")}・計${totalPairs}対戦）`;
  })();

  const editFormTitle = editingTournamentId
    ? "対戦表編集"
    : "対戦表作成";

  const editForm = (
    <div className="bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-200">
          {editFormTitle}
          {!editingTournamentId && tournaments.length > 0 && <span className="text-gray-400 text-sm font-normal ml-2">（追加）</span>}
        </h2>
        <span className="text-xs text-gray-500">
          {defaultRuleId && filteredEntries.length < entries.length
            ? `対象${filteredEntries.length}名（ルール絞込）`
            : `参加者${entries.length}名`}
          {" / "}割当{assignedIds.size}名 / 未割当{unassigned.length}名
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 shrink-0">ルール絞込:</label>
        <select value={defaultRuleId} onChange={(e) => setDefaultRuleId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500">
          <option value="">すべて</option>
          {(eventRules.length > 0 ? eventRules : rules).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            entries={entries}
            unassigned={unassigned}
            allEntries={entries}
            rules={rules}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
            defaultRuleId={defaultRuleId}
            mismatchSettings={mismatchSettings}
            ageCategories={ageCategories}
            canRemove={groups.length > 1}
            existingPairs={[
              // 画面上の未保存ペア
              ...groups.flatMap((g) =>
                g.pairs.filter((p) => p.e1 && p.e2).map((p) => ({
                  e1Id: p.e1.id, e2Id: p.e2!.id, ruleId: p.ruleId, pairId: p.id,
                }))
              ),
              // DB保存済みペア（fighter_id → entry.id に変換）
              ...savedMatchPairs.map((m) => {
                const e1 = entries.find((e) => e.fighter_id === m.f1);
                const e2 = entries.find((e) => e.fighter_id === m.f2);
                const rule = rules.find((r) => r.name === m.rules);
                return e1 && e2 ? { e1Id: e1.id, e2Id: e2.id, ruleId: rule?.id ?? "", pairId: "" } : null;
              }).filter((p): p is NonNullable<typeof p> => p !== null),
            ]}
            getDesiredMatchCount={getDesiredMatchCount}
            getTotalMatchCount={getTotalMatchCount}
            onRename={(name) => renameGroup(group.id, name)}
            onRemove={() => removeGroup(group.id)}
            onAutoAssign={(entriesToAssign) => autoAssignGroup(group.id, entriesToAssign)}
            onUpdateMismatch={(w, h) => updateGroupMismatch(group.id, w, h)}
            onAddPair={() => addEmptyPair(group.id)}
            onRemovePair={(pairId) => removePair(group.id, pairId)}
            onMovePair={(pairId, dir) => movePair(group.id, pairId, dir)}
            onUpdateE1={(pairId, entryId) => updateE1(group.id, pairId, entryId)}
            onUpdateE2={(pairId, entryId) => updateE2(group.id, pairId, entryId)}
            onUpdateField={(pairId, field, value) => updateField(group.id, pairId, field, value)}
            onUpdateFilters={(filters) => {
              setGroups((prev) => prev.map((g2) => g2.id === group.id ? { ...g2, filters } : g2));
            }}
          />
        ))}
      </div>

      {unassigned.length > 0 && !groups.every((g) => g.type === "one_match") && groups.every((g) => g.pairs.length > 0) && (
        <div className="flex gap-2">
          <button onClick={() => addGroup("tournament")}
            className="flex-1 border border-dashed border-gray-600 hover:border-blue-500 rounded-lg py-2 text-xs text-gray-400 hover:text-blue-400 transition">
            ＋ トーナメントを追加
          </button>
          <button onClick={() => addGroup("one_match")}
            className="flex-1 border border-dashed border-gray-600 hover:border-green-500 rounded-lg py-2 text-xs text-gray-400 hover:text-green-400 transition">
            ＋ ワンマッチを追加
          </button>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={() => { setShowCreateForm(false); setEditingTournamentId(null); }}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition">
          キャンセル
        </button>
        <button onClick={confirm} disabled={confirming || totalPairs === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
          {confirming && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />}
          {confirming ? "保存中..." : confirmLabel}
        </button>
      </div>
    </div>
  );

  // 時間見積もり計算
  // コートごとの時間見積もりを計算
  const courtEstimates = useMemo(() => {
    const estimates: Array<{ courtLabel: string; courtNum: string; matchCount: number; estimate: ReturnType<typeof formatTimeEstimate> | null }> = [];
    for (let i = 1; i <= courtCount; i++) {
      const courtTournaments = tournaments.filter((t) => t.court === String(i));
      const matchCount = countActualMatches(allMatchRows, courtTournaments.map((t) => t.id));
      if (matchCount === 0) continue;

      let matchDurationSec = 120;
      let hasExtension = false;
      let extensionDurationSec = 0;
      for (const t of courtTournaments) {
        if (!t.default_rules) continue;
        const rule = rules.find((r) => r.name === t.default_rules);
        if (!rule) continue;
        const preset = rule.timer_preset_id ? timerPresets.find((p) => p.id === rule.timer_preset_id) : timerPresets.find((p) => p.rule_id === rule.id);
        if (preset) {
          matchDurationSec = preset.match_duration;
          hasExtension = preset.has_extension;
          extensionDurationSec = preset.extension_duration;
          break;
        }
      }

      const minutes = estimateMatchMinutes({
        matchCount,
        matchDurationSec,
        hasExtension,
        extensionDurationSec,
        intervalSec: intervalMin * 60,
      });
      const extensionSec = hasExtension ? extensionDurationSec * 0.5 : 0;
      const estimate = formatTimeEstimate({
        minutes,
        startTime,
        matchCount,
        matchDurationSec,
        extensionSec,
        intervalSec: intervalMin * 60,
      });
      estimates.push({
        courtLabel: courtNames[i - 1]?.trim() || `コート${i}`,
        courtNum: String(i),
        matchCount,
        estimate,
      });
    }
    return estimates;
  }, [tournaments, allMatchRows, courtCount, courtNames, rules, timerPresets, intervalMin, startTime]);

  return (
    <div ref={sectionRef} className="space-y-4">
      {/* 時間見積もりパネル（コートごと） */}
      {courtEstimates.length > 0 && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3 space-y-2">
          {courtEstimates.map((ce) => (
            <div key={ce.courtNum} className="text-sm text-gray-200">
              <span className="font-medium text-gray-300">{ce.courtLabel}</span>: {ce.matchCount}試合
              {ce.estimate && (
                <>
                  {" "}&mdash; 推定 <span className="font-medium text-white">{ce.estimate.duration}</span>
                  {ce.estimate.endTime && (
                    <span className="text-gray-400">（{startTime}開始 → <span className="text-white font-medium">{ce.estimate.endTime}</span>終了予定）</span>
                  )}
                </>
              )}
            </div>
          ))}
          {tournaments.some((t) => t.court === "") && (
            <div className="text-xs text-orange-400">※ コート未割当のトーナメントは見積もりに含まれていません</div>
          )}
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 text-gray-400">
              開始時刻:
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500 w-24"
              />
            </label>
            <label className="flex items-center gap-1.5 text-gray-400">
              試合間:
              <select
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-blue-500"
              >
                <option value={0}>0分</option>
                <option value={0.5}>30秒</option>
                <option value={1}>1分</option>
                <option value={2}>2分</option>
                <option value={3}>3分</option>
                <option value={5}>5分</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {(localOrder ? localOrder.map((id) => tournaments.find((t) => t.id === id)!).filter(Boolean) : tournaments).map((t, idx, arr) => {
        if (t.id === editingTournamentId) {
          return <div key={t.id}>{editForm}</div>;
        }
        const visibleArr = arr.filter((x) => x.id !== editingTournamentId);
        const visibleIdx = visibleArr.indexOf(t);
        const isReordering = reorderingId === t.id;
        return (
          <div key={t.id} id={`tournament-${t.id}`} className="flex gap-2 items-start">
            <div className="flex flex-col gap-1 pt-3 shrink-0">
              {isReordering ? (
                <div className="w-4 h-8 flex items-center justify-center">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <button disabled={visibleIdx === 0 || !!reorderingId}
                    onClick={() => {
                      const prev = visibleArr[visibleIdx - 1];
                      const newIds = visibleArr.map((x) => x.id);
                      [newIds[visibleIdx - 1], newIds[visibleIdx]] = [newIds[visibleIdx], newIds[visibleIdx - 1]];
                      setLocalOrder(newIds);
                      setReorderingId(t.id);
                      Promise.all([
                        fetch(`/api/admin/tournaments/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx - 1 }) }),
                        fetch(`/api/admin/tournaments/${prev.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx }) }),
                      ]).then(() => { setReorderingId(null); onCreated(); });
                    }}
                    className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed leading-none">▲</button>
                  <button disabled={visibleIdx === visibleArr.length - 1 || !!reorderingId}
                    onClick={() => {
                      const next = visibleArr[visibleIdx + 1];
                      const newIds = visibleArr.map((x) => x.id);
                      [newIds[visibleIdx + 1], newIds[visibleIdx]] = [newIds[visibleIdx], newIds[visibleIdx + 1]];
                      setLocalOrder(newIds);
                      setReorderingId(t.id);
                      Promise.all([
                        fetch(`/api/admin/tournaments/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx + 1 }) }),
                        fetch(`/api/admin/tournaments/${next.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: visibleIdx }) }),
                      ]).then(() => { setReorderingId(null); onCreated(); });
                    }}
                    className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed leading-none">▼</button>
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <ExistingTournamentSection
                tournament={t}
                eventId={eventId}
                entries={entries}
                rules={rules}
                mismatchSettings={mismatchSettings}
                courtCount={courtCount}
                courtNames={courtNames}
                onDeleted={onCreated}
                onCourtChanged={onCreated}
                onEdit={(id, initialGroups, initialDefaultRuleId, sortOrder) => {
                  setEditingTournamentId(id);
                  setEditingSortOrder(sortOrder ?? null);
                  setGroups(initialGroups);
                  if (initialDefaultRuleId !== undefined) setDefaultRuleId(initialDefaultRuleId);
                  setShowCreateForm(true);
                }}
              />
            </div>
          </div>
        );
      })}

      {/* 振り分けルールボタン: 未割当選手がいて、作成フォームが閉じている時に表示 */}
      {!editingTournamentId && !showCreateForm && filteredEntries.length > 0 && (
        <div className="space-y-2">
          {bracketRuleCount > 0 ? (
            <button
              onClick={onAutoCreate}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl py-3 text-sm font-medium text-white transition shadow-lg">
              登録済み振り分けルールで対戦表を作成（{filteredEntries.length}名）
            </button>
          ) : (
            <button
              onClick={onNavigateToBracketRules}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl py-3 text-sm font-medium text-white transition shadow-lg">
              振り分けルールを登録する
            </button>
          )}
        </div>
      )}

      {!editingTournamentId && (showCreateForm || tournaments.length === 0) ? (
        editForm
      ) : !editingTournamentId && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const n = tournaments.filter((t) => t.type !== "one_match").length + 1;
                setGroups([{ id: crypto.randomUUID(), name: `トーナメント${n}`, type: "tournament", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
                setShowCreateForm(true);
              }}
              className="flex-1 border border-dashed border-gray-600 hover:border-blue-500 rounded-xl py-3 text-sm text-gray-400 hover:text-blue-400 transition">
              ＋ トーナメントを追加
            </button>
            <button
              onClick={() => {
                const n = tournaments.filter((t) => t.type === "one_match").length + 1;
                setGroups([{ id: crypto.randomUUID(), name: `ワンマッチ${n}`, type: "one_match", pairs: [], maxWeightDiff: mismatchSettings.maxWeightDiff, maxHeightDiff: mismatchSettings.maxHeightDiff }]);
                setShowCreateForm(true);
              }}
              className="flex-1 border border-dashed border-gray-600 hover:border-green-500 rounded-xl py-3 text-sm text-gray-400 hover:text-green-400 transition">
              ＋ ワンマッチを追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ExistingTournamentSection ──────────────────────────────────────────

function ExistingTournamentSection({ tournament, eventId, entries, rules, mismatchSettings, courtCount, courtNames, onDeleted, onEdit, onCourtChanged }: {
  tournament: Tournament;
  eventId: string;
  entries: Entry[];
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  courtCount: number;
  courtNames: string[];
  onDeleted: () => void;
  onEdit: (id: string, initialGroups: Group[], initialDefaultRuleId?: string, sortOrder?: number) => void;
  onCourtChanged: () => void;
}) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [fighterMap, setFighterMap] = useState<Record<string, Fighter>>({});
  const [open, setOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const weightDiff = tournament.max_weight_diff;
  const heightDiff = tournament.max_height_diff;

  const withdrawnFighterIds = useMemo(
    () => new Set(entries.filter((e) => e.is_withdrawn && e.fighter_id).map((e) => e.fighter_id!)),
    [entries],
  );
  const affectedMatches = useMemo(
    () => matches.filter((m) =>
      m.status !== "done" && m.status !== "ongoing" &&
      !!m.fighter1_id && !!m.fighter2_id &&
      (withdrawnFighterIds.has(m.fighter1_id) || withdrawnFighterIds.has(m.fighter2_id))
    ),
    [matches, withdrawnFighterIds],
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("matches")
      .select("id, round, position, fighter1_id, fighter2_id, winner_id, status, match_label, rules, result_method, result_detail")
      .eq("tournament_id", tournament.id)
      .order("round").order("position");
    const matchList = data ?? [];
    setMatches(matchList);

    const matchFids = matchList
      .flatMap((m) => [m.fighter1_id, m.fighter2_id])
      .filter((id): id is string => !!id);

    if (matchFids.length > 0) {
      const { data: fs } = await supabase.from("fighters").select("*").in("id", matchFids);
      setFighterMap(Object.fromEntries((fs ?? []).map((f) => [f.id, f])));
    }
  }, [tournament.id, eventId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const pending = affectedMatches.filter((m) => m.status !== "done" && m.winner_id == null);
    if (pending.length === 0) return;
    Promise.all(
      pending.map((match) => {
        const f1Withdrawn = !!(match.fighter1_id && withdrawnFighterIds.has(match.fighter1_id));
        const winnerId = f1Withdrawn ? match.fighter2_id : match.fighter1_id;
        if (!winnerId) return Promise.resolve();
        return fetch(`/api/admin/matches/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winner_id: winnerId,
            status: "done",
          }),
        });
      })
    ).then(() => load());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectedMatches]);

  async function handleDelete() {
    if (!confirm(`「${tournament.name}」を削除して組み直しますか？\n進行中・完了済みのデータもすべて失われます。`)) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE" });
    if (!res.ok) { alert("削除に失敗しました"); setDeleting(false); return; }
    onDeleted();
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {tournament.name && (
            <span className="text-sm font-medium text-white">{tournament.name}</span>
          )}
          {tournament.type === "one_match" && (
            <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">ワンマッチ</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${
            tournament.status === "finished" ? "bg-green-900 text-green-300" :
            tournament.status === "ongoing"  ? "bg-yellow-900 text-yellow-300" :
            "bg-gray-700 text-gray-400"
          }`}>
            {tournament.status === "preparing" ? "準備中" : tournament.status === "ongoing" ? "進行中" : "終了"}
          </span>
          <select
            value={tournament.court}
            onChange={async (e) => {
              await fetch(`/api/admin/tournaments/${tournament.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ court: e.target.value }),
              });
              onCourtChanged();
            }}
            className="bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs text-white"
          >
            <option value="">未割当</option>
            {Array.from({ length: courtCount }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {courtNames[i]?.trim() || `コート${i + 1}`}
              </option>
            ))}
          </select>
          {tournament.court === "" && (
            <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded">コート未割当</span>
          )}
          {tournament.court !== "" && (
            <Link href={`/court/${tournament.court}`} target="_blank"
              className="text-xs bg-blue-700 hover:bg-blue-600 text-blue-100 px-2 py-0.5 rounded transition">
              アナウンス画面 ↗
            </Link>
          )}
          {tournament.default_rules && (
            <span className="text-xs text-gray-500">{tournament.default_rules}</span>
          )}
          {weightDiff != null && (
            <span className="text-xs text-gray-500">体重差 {weightDiff}kg以内</span>
          )}
          {heightDiff != null && (
            <span className="text-xs text-gray-500">身長差 {heightDiff}cm以内</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-gray-400 hover:text-gray-200">
            {open ? "▲ 折りたたむ" : "▼ 対戦一覧を表示"}
          </button>
          <button
            onClick={() => {
              const round1 = matches.filter((m) => m.round === 1);
              const restoredPairs: Pair[] = round1.map((m) => {
                const e1 = entries.find((e) => e.fighter_id === m.fighter1_id && !e.is_withdrawn);
                const e2Entry = m.fighter2_id ? entries.find((e) => e.fighter_id === m.fighter2_id) ?? null : null;
                const e2 = e2Entry?.is_withdrawn ? null : e2Entry;
                if (!e1) return null;
                const ruleId = rules.find((r) => r.name === m.rules)?.id ?? "";
                return { id: crypto.randomUUID(), e1, e2, matchLabel: m.match_label ?? "", ruleId };
              }).filter((p): p is Pair => p !== null);
              const restoredDefaultRuleId = rules.find((r) => r.name === tournament.default_rules)?.id ?? "";
              const restoredFilters: GroupFilters = {
                minWeight: tournament.filter_min_weight != null ? String(tournament.filter_min_weight) : "",
                maxWeight: tournament.filter_max_weight != null ? String(tournament.filter_max_weight) : "",
                minAge: tournament.filter_min_age != null ? String(tournament.filter_min_age) : "",
                maxAge: tournament.filter_max_age != null ? String(tournament.filter_max_age) : "",
                sexFilter: tournament.filter_sex ?? "",
                minGrade: tournament.filter_min_grade ?? "",
                maxGrade: tournament.filter_max_grade ?? "",
                experienceFilter: tournament.filter_experience ?? "",
                minHeight: tournament.filter_min_height != null ? String(tournament.filter_min_height) : "",
                maxHeight: tournament.filter_max_height != null ? String(tournament.filter_max_height) : "",
                nameFilter: "",
                matchCountFilter: "",
              };
              onEdit(tournament.id, [{
                id: crypto.randomUUID(),
                name: tournament.name ?? "トーナメント1",
                type: tournament.type ?? "tournament",
                pairs: restoredPairs,
                maxWeightDiff: weightDiff,
                maxHeightDiff: heightDiff,
                filters: restoredFilters,
              }], restoredDefaultRuleId, tournament.sort_order);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 transition">
            ← 登録前に戻る
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition">
            {deleting ? "削除中..." : "削除"}
          </button>
        </div>
      </div>

      {affectedMatches.length > 0 && (
        <div className="bg-orange-950 border border-orange-700 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-orange-200">⚠ 欠場選手がいます。必要に応じて「登録前に戻る」で組み直してください。</p>
          <div className="space-y-1">
            {affectedMatches.map((match) => {
              const f1Withdrawn = !!(match.fighter1_id && withdrawnFighterIds.has(match.fighter1_id));
              const withdrawnFId = f1Withdrawn ? match.fighter1_id : match.fighter2_id;
              const opponentFId = f1Withdrawn ? match.fighter2_id : match.fighter1_id;
              const withdrawnName = withdrawnFId ? fighterMap[withdrawnFId]?.name ?? "不明" : "不明";
              const opponentName = opponentFId ? fighterMap[opponentFId]?.name ?? "不明" : null;
              const label = match.match_label || `${match.round}回戦 第${match.position + 1}試合`;
              return (
                <div key={match.id} className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-xs text-orange-400 shrink-0">{label}</span>
                  <span className="text-gray-400 line-through">{withdrawnName}</span>
                  <span className="text-xs bg-orange-800 text-orange-200 px-1.5 py-0.5 rounded shrink-0">欠場</span>
                  {opponentName && <>
                    <span className="text-gray-500">→</span>
                    <span className="text-green-300 font-medium">{opponentName}</span>
                    <span className="text-xs text-green-500 shrink-0">不戦勝</span>
                  </>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <>
          {tournament.type === "one_match" && matches.length > 0 ? (
            <div className="space-y-2">
              {matches.filter((m) => m.round === 1).map((m) => {
                const f1 = m.fighter1_id ? fighterMap[m.fighter1_id] : null;
                const f2 = m.fighter2_id ? fighterMap[m.fighter2_id] : null;
                return (
                  <div key={m.id} className="border border-gray-700 rounded-lg p-3 flex items-center gap-3">
                    <span className={`text-sm font-medium ${m.winner_id === m.fighter1_id ? "text-green-400" : "text-white"}`}>
                      {f1?.name ?? "未定"}
                      {m.winner_id === m.fighter1_id && <span className="ml-1 text-xs text-green-400">勝</span>}
                    </span>
                    <span className="text-xs text-gray-500">vs</span>
                    <span className={`text-sm font-medium ${m.winner_id === m.fighter2_id ? "text-green-400" : "text-white"}`}>
                      {f2?.name ?? "未定"}
                      {m.winner_id === m.fighter2_id && <span className="ml-1 text-xs text-green-400">勝</span>}
                    </span>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                      m.status === "done" ? "bg-green-900 text-green-300" :
                      m.status === "ongoing" ? "bg-yellow-900 text-yellow-300" :
                      "bg-gray-700 text-gray-400"
                    }`}>
                      {m.status === "done" ? "終了" : m.status === "ongoing" ? "試合中" : m.status === "ready" ? "準備完了" : "待機中"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <BracketView
              matches={matches}
              nameMap={Object.fromEntries(Object.entries(fighterMap).map(([id, f]) => [id, f.name]))}
              affiliationMap={Object.fromEntries(
                Object.entries(fighterMap)
                  .filter(([, f]) => f.affiliation)
                  .map(([id, f]) => [id, f.affiliation!])
              )}
              withdrawnIds={withdrawnFighterIds}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── メインの BracketSection コンポーネント ──────────────────────────────

export type BracketSectionProps = {
  eventId: string;
  event: Event;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  eventRules: Rule[];
  tournaments: Tournament[];
  tournamentMatchFighterIds: Record<string, Set<string>>;
  rules: Rule[];
  mismatchSettings: MismatchSettings;
  savedMatchPairs: Array<{ f1: string; f2: string; rules: string | null }>;
  bracketRuleCount: number;
  allMatchRows: Array<{ tournament_id: string; fighter1_id: string | null; fighter2_id: string | null }>;
  timerPresets: TimerPreset[];
  ageCategories?: AgeCategory[];
  bracketSubTab: "courts" | "bracket-rules";
  hasEntryChanges: boolean;
  entryChangeSummary: string;
  allEntriesAssigned: boolean;
  showAutoDialog: boolean;
  onSetBracketSubTab: (tab: "courts" | "bracket-rules") => void;
  onSetShowAutoDialog: (show: boolean) => void;
  onNavigateStep: (s: 1 | 2 | 3) => void;
  onLoad: () => void;
  onHandleAutoCreateFromDialog: (autoGroups: AutoGroup[], eventId: string, evtRules: Rule[], reload: () => void) => void;
};

export function BracketSection({
  eventId,
  event,
  entries,
  entryRuleIds,
  eventRules,
  tournaments,
  tournamentMatchFighterIds,
  rules,
  mismatchSettings,
  savedMatchPairs,
  bracketRuleCount,
  allMatchRows,
  timerPresets,
  ageCategories,
  bracketSubTab,
  hasEntryChanges,
  entryChangeSummary,
  allEntriesAssigned,
  showAutoDialog,
  onSetBracketSubTab,
  onSetShowAutoDialog,
  onNavigateStep,
  onLoad,
  onHandleAutoCreateFromDialog,
}: BracketSectionProps) {
  function getCourtLabel(courtNum: number): string {
    return event.court_names?.[courtNum - 1]?.trim() || `コート${courtNum}`;
  }

  return (
    <div className="space-y-6">
      {/* 参加者変更警告 */}
      {hasEntryChanges && (
        <div className="bg-orange-950 border border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-orange-400 shrink-0">⚠</span>
          <p className="text-sm text-orange-200">
            参加者に変更があります（{entryChangeSummary}）。各コートの対戦表を確認してください。
          </p>
          <button onClick={() => onNavigateStep(1)} className="ml-auto shrink-0 text-xs text-orange-400 hover:text-orange-300">
            ① 参加者一覧を確認 →
          </button>
        </div>
      )}

      {/* 全員割り当て済み → ③ 試合番号設定へ誘導 */}
      {allEntriesAssigned && !hasEntryChanges && (
        <div className="bg-green-950 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-green-400 shrink-0">✅</span>
          <p className="text-sm text-green-300">全員の対戦表が確定しました。試合番号を設定してください。</p>
          <button onClick={() => onNavigateStep(3)} className="ml-auto shrink-0 text-xs text-green-400 hover:text-green-300 underline">
            ③ 試合番号設定へ →
          </button>
        </div>
      )}

      {/* 未締切の場合の案内（トーナメント未作成時のみ） */}
      {!event.entry_closed && tournaments.length === 0 && (
        <div className="bg-blue-950/50 border border-blue-700/50 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-blue-400 shrink-0">💡</span>
          <p className="text-sm text-blue-300">
            参加受付が終了していません。締め切ってから対戦表を作成することをおすすめします。
          </p>
          <button onClick={() => onNavigateStep(1)} className="ml-auto shrink-0 text-xs text-blue-400 hover:text-blue-300">
            ① 参加者管理へ →
          </button>
        </div>
      )}

      {/* サブタブ */}
      <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-gray-700">
        {([
          { key: "courts" as const, label: "対戦表" },
          { key: "bracket-rules" as const, label: "振り分けルール" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => onSetBracketSubTab(tab.key)}
            className={`py-2 text-sm font-medium transition ${bracketSubTab === tab.key ? "bg-blue-700 text-white" : "bg-gray-800 hover:bg-gray-750 text-gray-400 hover:text-gray-200"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {bracketSubTab === "courts" && (
        <>
          {/* ダッシュボード */}
          <DashboardPanel
            entries={entries}
            tournaments={tournaments}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
            tournamentMatchFighterIds={tournamentMatchFighterIds}
          />

          {/* 参加者分布パネル（ルール別） */}
          <RuleDistributionPanel
            entries={entries.filter(e => !e.is_withdrawn)}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
          />

          {/* 対戦表 */}
          <TournamentEditor
            eventId={eventId}
            entries={entries}
            entryRuleIds={entryRuleIds}
            eventRules={eventRules}
            tournaments={tournaments}
            tournamentMatchFighterIds={tournamentMatchFighterIds}
            rules={rules}
            mismatchSettings={mismatchSettings}
            savedMatchPairs={savedMatchPairs}
            bracketRuleCount={bracketRuleCount}
            allMatchRows={allMatchRows}
            timerPresets={timerPresets}
            ageCategories={ageCategories}
            courtCount={event.court_count}
            courtNames={event.court_names ?? []}
            onCreated={onLoad}
            onAutoCreate={() => onSetShowAutoDialog(true)}
            onNavigateToBracketRules={() => onSetBracketSubTab("bracket-rules")}
          />
        </>
      )}

      {bracketSubTab === "bracket-rules" && (
        <BracketRulesPanel
          eventId={eventId}
          rules={rules}
          courtCount={event.court_count}
          courtNames={event.court_names}
          ageCategories={ageCategories}
        />
      )}

      {/* 全自動作成ダイアログ */}
      {showAutoDialog && (
        <AutoCreateDialog
          eventId={eventId}
          entries={entries.filter((e) => !e.is_withdrawn)}
          entryRuleIds={entryRuleIds}
          rules={rules}
          courtCount={event.court_count}
          courtNames={event.court_names}
          onExecute={(autoGroups) => {
            onSetShowAutoDialog(false);
            onHandleAutoCreateFromDialog(autoGroups, eventId, eventRules, onLoad);
          }}
          onClose={() => onSetShowAutoDialog(false)}
        />
      )}
    </div>
  );
}
