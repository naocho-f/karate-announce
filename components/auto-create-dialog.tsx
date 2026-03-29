"use client";

import { useCallback, useEffect, useState } from "react";
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
  onExecute: (groups: AutoGroup[]) => void;
  onClose: () => void;
};

export function AutoCreateDialog({
  eventId,
  entries,
  entryRuleIds,
  rules,
  courtCount,
  courtNames,
  onExecute,
  onClose,
}: Props) {
  const [bracketRules, setBracketRules] = useState<BracketRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<AutoGroup[] | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/bracket-rules?event_id=${eventId}`);
    if (res.ok) {
      const data: BracketRule[] = await res.json();
      setBracketRules(data);
      setEnabledIds(new Set(data.map((r) => r.id)));
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { loadRules(); }, [loadRules]);

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

  function handleExecute() {
    if (!preview) return;
    onExecute(preview);
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
          <h2 className="text-lg font-medium text-white">全自動対戦表作成</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">&times;</button>
        </div>

        <p className="text-sm text-gray-400">
          対象: {entries.length}名
        </p>

        {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

        {!loading && bracketRules.length === 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400">
              振り分けルールが未設定です。②対戦表作成の上部にある「振り分けルール」タブで設定してください。
            </p>
            <p className="text-sm text-gray-400 mt-2">
              振り分けルールなしで作成すると、競技ルールごとに1つのトーナメントが作成されます。
            </p>
          </div>
        )}

        {/* 振り分けルール一覧 */}
        {bracketRules.length > 0 && (
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
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white">{rule.name}</span>
                  <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {rule.rule_id && (
                      <span>ルール: {rules.find((r) => r.id === rule.rule_id)?.name ?? "不明"}</span>
                    )}
                    {(rule.min_age != null || rule.max_age != null) && (
                      <span>年齢: {rule.min_age ?? ""}〜{rule.max_age ?? ""}</span>
                    )}
                    {(rule.min_weight != null || rule.max_weight != null) && (
                      <span>体重: {rule.min_weight ?? ""}〜{rule.max_weight ?? ""}kg</span>
                    )}
                    {rule.sex_filter && (
                      <span>性別: {rule.sex_filter === "male" ? "男" : "女"}</span>
                    )}
                    {rule.court_num != null && (
                      <span>コート: {getCourtLabel(rule.court_num)}</span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* プレビュー */}
        <div className="flex gap-2">
          <button
            onClick={handlePreview}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
          >
            振り分けプレビュー
          </button>
        </div>

        {preview && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">プレビュー結果</h3>

            {/* コート別試合数サマリー */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: courtCount }, (_, i) => i + 1).map((court) => (
                <span key={court} className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300">
                  {getCourtLabel(court)}: {courtMatchCounts[court] ?? 0}試合
                </span>
              ))}
            </div>

            {/* グループ一覧 */}
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

            {/* 実行ボタン */}
            <button
              onClick={handleExecute}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm py-2.5 rounded-lg font-medium transition shadow-lg"
            >
              この内容で対戦表を作成する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
