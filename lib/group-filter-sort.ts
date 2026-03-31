/**
 * グループフィルタのソート・マッチ数フィルタのユーティリティ
 *
 * GroupSection のインラインロジックをテスト可能な形で切り出したもの。
 */

import { gradeToNumber } from "@/lib/grade-options";
import { entryFullName, type Entry } from "@/lib/types";

type FilterState = {
  minGrade: string;
  maxGrade: string;
  minAge: string;
  maxAge: string;
  minWeight: string;
  maxWeight: string;
  minHeight: string;
  maxHeight: string;
};

/**
 * フィルタに応じたソート比較関数を返す。
 * 年代→年齢→体重→身長の優先順でソートし、フィルタなしなら氏名順。
 */
export function buildFilterSortComparator(filters: FilterState): (a: Entry, b: Entry) => number {
  return (a: Entry, b: Entry) => {
    // 年代フィルタ: 学年順
    if (filters.minGrade || filters.maxGrade) {
      const aNum = gradeToNumber(a.grade ?? null) ?? 999;
      const bNum = gradeToNumber(b.grade ?? null) ?? 999;
      if (aNum !== bNum) return aNum - bNum;
    }
    // 年齢フィルタ: 年齢順
    if (filters.minAge || filters.maxAge) {
      const aAge = a.age ?? 999;
      const bAge = b.age ?? 999;
      if (aAge !== bAge) return aAge - bAge;
    }
    // 体重フィルタ: 体重順
    if (filters.minWeight || filters.maxWeight) {
      const aW = a.weight ?? 999;
      const bW = b.weight ?? 999;
      if (aW !== bW) return aW - bW;
    }
    // 身長フィルタ: 身長順
    if (filters.minHeight || filters.maxHeight) {
      const aH = a.height ?? 999;
      const bH = b.height ?? 999;
      if (aH !== bH) return aH - bH;
    }
    // フィルタなし: 氏名順
    return entryFullName(a).localeCompare(entryFullName(b), "ja");
  };
}

/**
 * 試合決定数フィルタ
 * - "unmet": 希望試合数に達していない選手のみ
 * - "0"〜"9": その試合数の選手のみ
 * - "": フィルタなし
 */
export function matchCountFilterPredicate(
  matchCountFilter: string,
  getTotalMatchCount: (entry: Entry) => number,
  getDesiredMatchCount: (entry: Entry) => number,
): (entry: Entry) => boolean {
  if (matchCountFilter === "unmet") {
    return (entry) => getTotalMatchCount(entry) < getDesiredMatchCount(entry);
  }
  if (matchCountFilter !== "") {
    const n = parseInt(matchCountFilter);
    return (entry) => getTotalMatchCount(entry) === n;
  }
  return () => true;
}
