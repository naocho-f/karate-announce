/**
 * グループフィルタのソート・マッチ数フィルタのユーティリティ
 *
 * GroupSection のインラインロジックをテスト可能な形で切り出したもの。
 */

import { gradeToNumber, findAgeCategory, type AgeCategory } from "@/lib/grade-options";
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
 * 体重→年齢→年代→身長の優先順でソートし、デフォルトは年齢昇順。
 * 同値のフォールバックは氏名順。
 */
export function buildFilterSortComparator(filters: FilterState): (a: Entry, b: Entry) => number {
  return (a: Entry, b: Entry) => {
    // 体重フィルタ: 体重順（最優先）
    if (filters.minWeight || filters.maxWeight) {
      const aW = a.weight ?? 999;
      const bW = b.weight ?? 999;
      if (aW !== bW) return aW - bW;
    }
    // 年齢フィルタ: 年齢順
    if (filters.minAge || filters.maxAge) {
      const aAge = a.age ?? 999;
      const bAge = b.age ?? 999;
      if (aAge !== bAge) return aAge - bAge;
    }
    // 年代フィルタ: 学年順
    if (filters.minGrade || filters.maxGrade) {
      const aNum = gradeToNumber(a.grade ?? null) ?? 999;
      const bNum = gradeToNumber(b.grade ?? null) ?? 999;
      if (aNum !== bNum) return aNum - bNum;
    }
    // 身長フィルタ: 身長順
    if (filters.minHeight || filters.maxHeight) {
      const aH = a.height ?? 999;
      const bH = b.height ?? 999;
      if (aH !== bH) return aH - bH;
    }
    // デフォルト: 年齢昇順
    const aAge = a.age ?? 999;
    const bAge = b.age ?? 999;
    if (aAge !== bAge) return aAge - bAge;
    // 同年齢: 氏名順
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

/**
 * 年代区分フィルタの判定関数を返す。
 *
 * - 年齢ベース区分がフィルタに含まれる場合: エントリーの age で比較
 *   - 下限 → その区分の minAge を下限値として使用
 *   - 上限 → その区分の maxAge を上限値として使用
 * - 学年ベース同士: gradeToNumber() で数値化して範囲比較
 * - 混在（学年エントリーに年齢フィルタ等）: age があれば年齢で比較
 */
export function gradeFilterPredicate(
  minGrade: string,
  maxGrade: string,
  ageCategories?: AgeCategory[],
): (entry: Entry) => boolean {
  if (!minGrade && !maxGrade) return () => true;

  const minCat = minGrade ? findAgeCategory(minGrade, ageCategories) : null;
  const maxCat = maxGrade ? findAgeCategory(maxGrade, ageCategories) : null;
  const hasAgeCategoryFilter = !!(minCat || maxCat);

  const minNum = minGrade ? gradeToNumber(minGrade) : null;
  const maxNum = maxGrade ? gradeToNumber(maxGrade) : null;

  return (entry: Entry) => {
    const eNum = gradeToNumber(entry.grade ?? null);

    // 年齢ベース区分がフィルタに含まれる場合 → age で比較
    if (hasAgeCategoryFilter) {
      if (entry.age == null) return false;
      if (minCat && entry.age < minCat.minAge) return false;
      if (maxCat && maxCat.maxAge != null && entry.age > maxCat.maxAge) return false;
      return true;
    }

    // 学年ベース同士
    if (eNum != null) {
      if (minNum != null && eNum < minNum) return false;
      if (maxNum != null && eNum > maxNum) return false;
      return true;
    }

    // エントリーが年齢ベース区分（一般・シニア等）→ 概算年齢で比較
    if (entry.grade && findAgeCategory(entry.grade, ageCategories)) {
      if (entry.age == null) return false;
      const approxMinAge = minNum != null ? minNum + 5 : null;
      const approxMaxAge = maxNum != null ? maxNum + 6 : null;
      if (approxMinAge != null && entry.age < approxMinAge) return false;
      if (approxMaxAge != null && entry.age > approxMaxAge) return false;
      return true;
    }

    // どちらにも該当しない → 除外
    return false;
  };
}
