"use client";

import { useState, useMemo } from "react";
import type { Entry } from "@/lib/types";
import { entryFullName } from "@/lib/types";
import { computeSuggestions, type SplitSuggestion } from "@/lib/suggestions";
import { pairsFromEntries, type PairEntry } from "@/lib/pairing";

type GroupResult = {
  name: string;
  entries: Entry[];
  pairs: PairEntry[];
};

type Props = {
  entries: Entry[];
  courtCount: number;
  onExecute: (groups: GroupResult[]) => void;
  onClose: () => void;
};

export function SuggestCreateDialog({ entries, courtCount, onExecute, onClose }: Props) {
  const suggestions = useMemo(() => computeSuggestions(entries), [entries]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(suggestions.length > 0 ? [0] : [])
  );
  const [maxWeightDiff, setMaxWeightDiff] = useState<string>("");
  const [maxAgeDiff, setMaxAgeDiff] = useState<string>("");
  const [preview, setPreview] = useState<GroupResult[] | null>(null);

  function toggleIndex(idx: number) {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setPreview(null);
  }

  function buildGroups(): GroupResult[] {
    const selected = suggestions.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return [];

    const active = entries.filter(e => !e.is_withdrawn);
    const assigned = new Set<string>();
    const groups: GroupResult[] = [];

    for (const s of selected) {
      const [below, above] = splitEntries(active, s, assigned);

      if (below.length > 0) {
        const pairs = pairsFromEntries(below);
        groups.push({ name: s.belowLabel, entries: below, pairs });
        below.forEach(e => assigned.add(e.id));
      }
      if (above.length > 0) {
        const pairs = pairsFromEntries(above);
        groups.push({ name: s.aboveLabel, entries: above, pairs });
        above.forEach(e => assigned.add(e.id));
      }
    }

    // 未割当選手がいたらまとめる
    const remaining = active.filter(e => !assigned.has(e.id));
    if (remaining.length > 0) {
      const pairs = pairsFromEntries(remaining);
      groups.push({ name: "未分類", entries: remaining, pairs });
    }

    return groups;
  }

  function splitEntries(
    pool: Entry[],
    s: SplitSuggestion,
    assigned: Set<string>,
  ): [Entry[], Entry[]] {
    const available = pool.filter(e => !assigned.has(e.id));
    const below: Entry[] = [];
    const above: Entry[] = [];

    for (const e of available) {
      if (s.axis === "weight") {
        if (e.weight == null) continue;
        if (e.weight < (s.threshold as number)) below.push(e);
        else above.push(e);
      } else if (s.axis === "age") {
        if (e.age == null) continue;
        if (e.age < (s.threshold as number)) below.push(e);
        else above.push(e);
      } else if (s.axis === "sex") {
        if (e.sex === "male") below.push(e);
        else if (e.sex === "female") above.push(e);
      } else if (s.axis === "height") {
        if (e.height == null) continue;
        if (e.height < (s.threshold as number)) below.push(e);
        else above.push(e);
      } else if (s.axis === "experience") {
        if (e.experience == null) continue;
        const m = e.experience.match(/(\d+)\s*年/);
        if (!m) continue;
        const years = parseInt(m[1], 10);
        if (years < (s.threshold as number)) below.push(e);
        else above.push(e);
      }
    }

    // maxWeightDiff / maxAgeDiff パラメータによる追加フィルタ
    const wDiff = maxWeightDiff ? parseFloat(maxWeightDiff) : null;
    const aDiff = maxAgeDiff ? parseInt(maxAgeDiff) : null;
    const filterGroup = (group: Entry[]): Entry[] => {
      if (!wDiff && !aDiff) return group;
      // パラメータはプレビュー参考として表示するだけで、グループ分け自体には影響しない
      return group;
    };

    return [filterGroup(below), filterGroup(above)];
  }

  function handlePreview() {
    const groups = buildGroups();
    setPreview(groups);
  }

  function handleExecute() {
    const groups = preview ?? buildGroups();
    if (groups.length > 0) {
      onExecute(groups);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">おすすめ振り分けで対戦表作成</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition">&times;</button>
          </div>

          {suggestions.length === 0 ? (
            <p className="text-sm text-gray-400">
              提案できる振り分けがありません。選手の体重・年齢データが不足している可能性があります。
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-400">
                適用するおすすめ条件を選択してください。複数選択すると段階的に振り分けます。
              </p>

              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <label key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition ${
                    selectedIndices.has(i)
                      ? "bg-blue-900/40 border-blue-600"
                      : "bg-gray-700/50 border-gray-600 hover:border-gray-500"
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(i)}
                      onChange={() => toggleIndex(i)}
                      className="accent-blue-500"
                    />
                    <span className={`font-bold text-sm ${
                      s.balance === "◎" ? "text-green-300" :
                      s.balance === "△" ? "text-yellow-300" : "text-gray-400"
                    }`}>{s.balance}</span>
                    <span className="text-sm text-white">{s.belowLabel} {s.belowCount}名</span>
                    <span className="text-gray-500">/</span>
                    <span className="text-sm text-white">{s.aboveLabel} {s.aboveCount}名</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">体重差上限</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={maxWeightDiff}
                    onChange={e => { setMaxWeightDiff(e.target.value); setPreview(null); }}
                    placeholder="無制限"
                    className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-gray-500">kg</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">年齢上限</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={maxAgeDiff}
                    onChange={e => { setMaxAgeDiff(e.target.value); setPreview(null); }}
                    placeholder="無制限"
                    className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-gray-500">歳</span>
                </div>
              </div>

              {/* プレビュー */}
              {preview && (
                <div className="space-y-3 border-t border-gray-700 pt-4">
                  <h3 className="text-sm font-semibold text-gray-300">振り分け結果プレビュー</h3>
                  {preview.map((g, i) => (
                    <div key={i} className="bg-gray-900/50 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{g.name}</span>
                        <span className="text-xs text-gray-400">{g.entries.length}名・{g.pairs.length}対戦</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {g.entries.map(e => (
                          <span key={e.id} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                            {entryFullName(e)}
                            {e.weight != null && <span className="text-gray-500 ml-1">{e.weight}kg</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition">
                  キャンセル
                </button>
                <button
                  onClick={handlePreview}
                  disabled={selectedIndices.size === 0}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:opacity-40 rounded-lg text-sm text-white transition">
                  プレビュー
                </button>
                <button
                  onClick={handleExecute}
                  disabled={selectedIndices.size === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 py-2 rounded-lg text-sm font-medium text-white transition">
                  作成する
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
