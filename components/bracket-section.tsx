"use client";

import { useMemo, useState } from "react";
import type { Entry, Event, Rule, TimerPreset, Tournament } from "@/lib/types";
import type { MismatchSettings } from "@/lib/compatibility";
import { BracketRulesPanel } from "@/components/bracket-rules-panel";
import { AutoCreateDialog } from "@/components/auto-create-dialog";
import { computeSuggestions } from "@/lib/suggestions";
import type { AutoGroup } from "@/lib/auto-bracket";
import type { AgeCategory } from "@/lib/grade-options";
import { TournamentEditor } from "@/components/_tournament-editor";

// ── ダッシュボードパネル ──────────────────────────────────────────────────

function DashboardPanel({
  entries,
  tournaments,
  eventRules,
  entryRuleIds,
  tournamentMatchFighterIds,
}: {
  entries: Entry[];
  tournaments: Tournament[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
  tournamentMatchFighterIds: Record<string, Set<string>>;
}) {
  const assignedFighterIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(tournamentMatchFighterIds).forEach((ids) => ids.forEach((id) => s.add(id)));
    return s;
  }, [tournamentMatchFighterIds]);

  const fighterMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const fids of Object.values(tournamentMatchFighterIds)) {
      fids.forEach((fid) => {
        counts[fid] = (counts[fid] ?? 0) + 1;
      });
    }
    return counts;
  }, [tournamentMatchFighterIds]);

  const activeEntries = entries.filter((e) => !e.is_withdrawn);

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
    const relevant = ruleId ? activeEntries.filter((e) => entryRuleIds[e.id]?.has(ruleId)) : activeEntries;
    const unassigned = relevant.filter((e) => !e.fighter_id || !assignedFighterIds.has(e.fighter_id)).length;
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

  const matchCountInfo =
    matchCountSummary.totalDesired > matchCountSummary.totalAssigned ? (
      <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-400">希望試合数:</span>
        <span className="text-sm text-white">
          合計 {matchCountSummary.totalDesired}試合 / 設定済 {matchCountSummary.totalAssigned}試合
        </span>
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

  const cards = eventRules.map((rule) => {
    const stats = buildStats(rule.id);
    return {
      key: rule.id,
      label: rule.name,
      total: stats.total,
      unassigned: stats.unassigned,
      tournamentCount: tournamentCountByRuleName[rule.name] ?? 0,
    };
  });

  if (cards.every((c) => c.total === 0)) return null;

  return (
    <div className="space-y-3">
      {matchCountInfo}
      {cards.map((c) => (
        <DashboardCard
          key={c.key}
          label={c.label}
          total={c.total}
          unassigned={c.unassigned}
          tournamentCount={c.tournamentCount}
        />
      ))}
    </div>
  );
}

function DashboardCard({
  label,
  total,
  unassigned,
  tournamentCount,
  oneMatchCount,
}: {
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
          {tournamentCount > 0 || (oneMatchCount ?? 0) > 0 ? (
            <span className="text-xs text-gray-400">
              {[
                tournamentCount > 0 ? `${tournamentCount}トーナメント` : null,
                (oneMatchCount ?? 0) > 0 ? `${oneMatchCount}ワンマッチ` : null,
              ]
                .filter(Boolean)
                .join("・")}
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
function RuleDistributionPanel({
  entries,
  eventRules,
  entryRuleIds,
}: {
  entries: Entry[];
  eventRules: Rule[];
  entryRuleIds: Record<string, Set<string>>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const sections = useMemo(() => {
    if (eventRules.length === 0) {
      const suggestions = computeSuggestions(entries);
      if (suggestions.length === 0) return [];
      return [{ label: "全参加者", count: entries.length, suggestions }];
    }
    return eventRules
      .map((rule) => {
        const ruleEntries = entries.filter((e) => entryRuleIds[e.id]?.has(rule.id));
        const suggestions = computeSuggestions(ruleEntries);
        return { label: rule.name, count: ruleEntries.length, suggestions };
      })
      .filter((s) => s.suggestions.length > 0);
  }, [entries, eventRules, entryRuleIds]);

  if (sections.length === 0) return null;

  const axisLabels: Record<string, string> = {
    weight: "体重",
    age: "年齢",
    sex: "性別",
    height: "身長",
    experience: "経験",
  };
  const axisOrder = ["weight", "age", "sex", "height", "experience"];

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/50 transition"
      >
        <span>
          {"💡"} 参加者の分布（{entries.length}名）
        </span>
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
                <p className="text-xs font-medium text-gray-400 mb-2">
                  {section.label}（{section.count}名）
                </p>
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
                            <span
                              key={i}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${isReference ? "bg-gray-700/30 opacity-60" : "bg-gray-700/60"}`}
                            >
                              <span
                                className={
                                  isReference
                                    ? "text-gray-500 font-bold"
                                    : s.balance === "◎"
                                      ? "text-green-400 font-bold"
                                      : s.balance === "△"
                                        ? "text-yellow-400 font-bold"
                                        : "text-gray-500 font-bold"
                                }
                              >
                                {s.balance}
                              </span>
                              <span className={isReference ? "text-gray-500" : "text-gray-300"}>
                                {s.belowLabel} {s.belowCount}名
                              </span>
                              <span className="text-gray-600">/</span>
                              <span className={isReference ? "text-gray-500" : "text-gray-300"}>
                                {s.aboveLabel} {s.aboveCount}名
                              </span>
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
  onHandleAutoCreateFromDialog: (
    autoGroups: AutoGroup[],
    eventId: string,
    evtRules: Rule[],
    reload: () => void,
  ) => void;
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
  return (
    <div className="space-y-6">
      {hasEntryChanges && (
        <div className="bg-orange-950 border border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-orange-400 shrink-0">⚠</span>
          <p className="text-sm text-orange-200">
            参加者に変更があります（{entryChangeSummary}）。各コートの対戦表を確認してください。
          </p>
          <button
            onClick={() => onNavigateStep(1)}
            className="ml-auto shrink-0 text-xs text-orange-400 hover:text-orange-300"
          >
            ① 参加者一覧を確認 →
          </button>
        </div>
      )}

      {allEntriesAssigned && !hasEntryChanges && (
        <div className="bg-green-950 border border-green-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-green-400 shrink-0">✅</span>
          <p className="text-sm text-green-300">全員の対戦表が確定しました。試合番号を設定してください。</p>
          <button
            onClick={() => onNavigateStep(3)}
            className="ml-auto shrink-0 text-xs text-green-400 hover:text-green-300 underline"
          >
            ③ 試合番号設定へ →
          </button>
        </div>
      )}

      {!event.entry_closed && tournaments.length === 0 && (
        <div className="bg-blue-950/50 border border-blue-700/50 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-blue-400 shrink-0">💡</span>
          <p className="text-sm text-blue-300">
            参加受付が終了していません。締め切ってから対戦表を作成することをおすすめします。
          </p>
          <button
            onClick={() => onNavigateStep(1)}
            className="ml-auto shrink-0 text-xs text-blue-400 hover:text-blue-300"
          >
            ① 参加者管理へ →
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-gray-700">
        {[
          { key: "courts" as const, label: "対戦表" },
          { key: "bracket-rules" as const, label: "振り分けルール" },
        ].map((tab) => (
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
          <DashboardPanel
            entries={entries}
            tournaments={tournaments}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
            tournamentMatchFighterIds={tournamentMatchFighterIds}
          />

          <RuleDistributionPanel
            entries={entries.filter((e) => !e.is_withdrawn)}
            eventRules={eventRules}
            entryRuleIds={entryRuleIds}
          />

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
