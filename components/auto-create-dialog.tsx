"use client";

import { useEffect, useState } from "react";
import type { BracketRule, Entry, Rule } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import { groupEntriesByRules, assignCourts, type AutoGroup } from "@/lib/auto-bracket";

type Props = {
  eventId: string;
  entries: Entry[];
  entryRuleIds: Record<string, Set<string>>;
  rules: Rule[];
  courtCount: number;
  courtNames: string[] | null;
  onExecute: (groups: AutoGroup[]) => void | Promise<void>;
  onClose: () => void;
};

function rangeStr(min: unknown, max: unknown, label: string, unit = ""): string | null {
  if (min == null && max == null) return null;
  return `${label}: ${min ?? ""}〜${max ?? ""}${unit}`;
}

function ruleDetailParts(rule: BracketRule, rules: Rule[], getCourtLabel: (n: number) => string): string[] {
  const parts: string[] = [];
  if (rule.rule_id) parts.push(`ルール: ${rules.find((r) => r.id === rule.rule_id)?.name ?? "不明"}`);
  const age = rangeStr(rule.min_age, rule.max_age, "年齢");
  if (age) parts.push(age);
  const weight = rangeStr(rule.min_weight, rule.max_weight, "体重", "kg");
  if (weight) parts.push(weight);
  const grade = rangeStr(rule.min_grade, rule.max_grade, "年代");
  if (grade) parts.push(grade);
  if (rule.sex_filter) parts.push(`性別: ${rule.sex_filter === "male" ? "男" : "女"}`);
  if (rule.court_num != null) parts.push(`コート: ${getCourtLabel(rule.court_num)}`);
  return parts;
}

function BracketRuleCheckList({
  bracketRules,
  rules,
  enabledIds,
  toggleRule,
  getCourtLabel,
}: {
  bracketRules: BracketRule[];
  rules: Rule[];
  enabledIds: Set<string>;
  toggleRule: (id: string) => void;
  getCourtLabel: (n: number) => string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-300">振り分けルール</h3>
      {bracketRules.map((rule) => (
        <label
          key={rule.id}
          className="flex items-center gap-3 bg-gray-800/50 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-gray-600 transition"
        >
          <input
            type="checkbox"
            checked={enabledIds.has(rule.id)}
            onChange={() => toggleRule(rule.id)}
            aria-label={rule.name}
            className="rounded"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm text-white">{rule.name}</span>
            <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {ruleDetailParts(rule, rules, getCourtLabel).map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
          </div>
        </label>
      ))}
    </div>
  );
}

function PreviewResults({
  preview,
  courtCount,
  courtMatchCounts,
  getCourtLabel,
}: {
  preview: AutoGroup[];
  courtCount: number;
  courtMatchCounts: Record<number, number>;
  getCourtLabel: (n: number) => string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-300">プレビュー結果</h3>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: courtCount }, (_, i) => i + 1).map((court) => (
          <span key={court} className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300">
            {getCourtLabel(court)}: {courtMatchCounts[court] ?? 0}試合
          </span>
        ))}
      </div>
      {preview.map((group) => (
        <div key={group.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-white">{group.name}</span>
            <span className="text-xs text-gray-400">
              {group.courtNum ? getCourtLabel(group.courtNum) : "コート未定"} / {group.entries.length}名 / {group.pairs.length}対戦
            </span>
          </div>
          <div className="text-xs text-gray-400 flex flex-wrap gap-1">
            {group.entries.map((e) => (
              <span key={e.id} className="bg-gray-700 rounded px-1.5 py-0.5">
                {entryFullName(e)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AutoCreateDialog({ eventId, entries, entryRuleIds, rules, courtCount, courtNames, onExecute, onClose }: Props) {
  const [bracketRules, setBracketRules] = useState<BracketRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<AutoGroup[] | null>(null);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadRules() {
      setLoading(true);
      const res = await fetch(`/api/admin/bracket-rules?event_id=${eventId}`);
      if (res.ok && !cancelled) {
        const data: BracketRule[] = await res.json();
        setBracketRules(data);
        setEnabledIds(new Set(data.map((r) => r.id)));
      }
      if (!cancelled) setLoading(false);
    }
    void loadRules();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function getCourtLabel(num: number): string {
    if (courtNames && courtNames[num - 1]) return courtNames[num - 1];
    return `コート${num}`;
  }

  function toggleRule(id: string) {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null); // プレビューをリセット
  }

  function handlePreview() {
    const activeRules = bracketRules.filter((r) => enabledIds.has(r.id));
    const groups = groupEntriesByRules(entries, activeRules, entryRuleIds);
    const assigned = assignCourts(groups, courtCount);
    setPreview(assigned);
  }

  async function handleExecute() {
    if (!preview) return;
    setExecuting(true);
    await onExecute(preview);
    setExecuting(false);
  }

  // 各コートの試合数を集計
  const courtMatchCounts: Record<number, number> = {};
  if (preview) {
    for (const g of preview) {
      const court = g.courtNum ?? 0;
      courtMatchCounts[court] = (courtMatchCounts[court] ?? 0) + g.pairs.length;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">
            全自動対戦表作成 <span className="text-sm text-gray-400 font-normal ml-2">対象: {entries.length}名</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">
            &times;
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

        {!loading && bracketRules.length === 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-400 space-y-2">
            <p>振り分けルールが未設定です。②対戦表作成の上部にある「振り分けルール」タブで設定してください。</p>
            <p>振り分けルールなしで作成すると、競技ルールごとに1つのトーナメントが作成されます。</p>
          </div>
        )}

        {bracketRules.length > 0 && (
          <BracketRuleCheckList
            bracketRules={bracketRules}
            rules={rules}
            enabledIds={enabledIds}
            toggleRule={toggleRule}
            getCourtLabel={getCourtLabel}
          />
        )}

        <button
          onClick={handlePreview}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
        >
          振り分けプレビュー
        </button>

        {preview && (
          <div className="space-y-3">
            <PreviewResults preview={preview} courtCount={courtCount} courtMatchCounts={courtMatchCounts} getCourtLabel={getCourtLabel} />

            {/* 実行ボタン */}
            <button
              onClick={() => void handleExecute()}
              disabled={executing}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm py-2.5 rounded-lg font-medium transition shadow-lg disabled:opacity-50"
            >
              {executing ? "作成中..." : "この内容で対戦表を作成する"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
