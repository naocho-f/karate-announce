"use client";

import { useState } from "react";
import type { Entry, Match } from "@/lib/types";
import { entryFullName } from "@/lib/types";

export type Pair = {
  id: string;
  e1: Entry;
  e2: Entry | null;
  matchLabel: string;
  ruleId: string;
};

export type GroupFilters = {
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

export type Group = {
  id: string;
  name: string;
  type: "tournament" | "one_match";
  pairs: Pair[];
  maxWeightDiff: number | null;
  maxHeightDiff: number | null;
  filters?: GroupFilters;
};

export type MatchRow = Omit<Match, "tournament_id" | "fighter1" | "fighter2" | "winner">;

export function bracketQuality(pairCount: number): {
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
  return {
    isClean: false,
    nextCleanPairs: next,
    prevCleanPairs: prev,
    addNeeded: next - pairCount,
    removeNeeded: pairCount - prev,
  };
}

export function buildBracketPreview(pairs: Pair[]): {
  matches: MatchRow[];
  nameMap: Record<string, string>;
  affiliationMap: Record<string, string>;
} {
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
      match_number: 0,
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
        match_number: 0,
        rules: null,
        result_method: null,
        result_detail: null,
      });
    }
    r++;
  }
  return { matches: allMatches, nameMap, affiliationMap };
}

export function entryOptionLabel(e: Entry, prefix = ""): string {
  const name = entryFullName(e);
  const aff = [e.school_name, e.dojo_name].filter(Boolean).join(" ");
  const body = [
    e.weight ? `${parseFloat(String(e.weight))}kg` : null,
    e.height ? `${parseFloat(String(e.height))}cm` : null,
    e.age != null ? `${e.age}歳` : null,
  ]
    .filter(Boolean)
    .join("/");
  const exp = e.experience ? `[${e.experience}]` : "";
  return [prefix + name, aff, body, exp].filter(Boolean).join("  ");
}

export function BracketQualityBadge({ pairCount }: { pairCount: number }) {
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-xs font-medium rounded px-2 py-1 flex items-center gap-1 transition ${
          isYellow
            ? "bg-yellow-900/60 text-yellow-200 border border-yellow-600 hover:bg-yellow-800/60"
            : "bg-red-900/60 text-red-200 border border-red-700 hover:bg-red-800/60"
        }`}
      >
        <span>⚠ {pairCount}対戦 — 不規則</span>
        <span className="text-[10px] opacity-70">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-3 space-y-1.5">
          <p className="text-xs text-white font-medium">{pairCount}対戦 — ブラケットが不規則</p>
          <p className="text-xs text-gray-400">2の累乗でないため、一部のラウンドで試合数が揃いません。</p>
          <div className="border-t border-gray-700 pt-1.5 space-y-1">
            <p className="text-xs text-gray-300">
              推奨: <span className="text-white font-medium">{q.prevCleanPairs}対戦</span>（{q.prevCleanPairs * 2}
              名以下）または <span className="text-white font-medium">{q.nextCleanPairs}対戦</span>（{q.nextCleanPairs * 2}名以下）
            </p>
            <p className="text-xs text-yellow-300">{hint}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-300 pt-0.5">
            キャンセル
          </button>
        </div>
      )}
    </span>
  );
}
