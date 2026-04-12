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
type ExtractFn = (e: Entry) => number;

function compareBy(a: Entry, b: Entry, extract: ExtractFn): number {
  const aV = extract(a);
  const bV = extract(b);
  return aV !== bV ? aV - bV : 0;
}

export function buildFilterSortComparator(filters: FilterState): (a: Entry, b: Entry) => number {
  const steps: ExtractFn[] = [];
  if (filters.minWeight || filters.maxWeight) steps.push((e) => e.weight ?? 999);
  if (filters.minAge || filters.maxAge) steps.push((e) => e.age ?? 999);
  if (filters.minGrade || filters.maxGrade) steps.push((e) => gradeToNumber(e.grade ?? null) ?? 999);
  if (filters.minHeight || filters.maxHeight) steps.push((e) => e.height ?? 999);
  // デフォルト: 年齢昇順
  steps.push((e) => e.age ?? 999);

  return (a: Entry, b: Entry) => {
    for (const extract of steps) {
      const diff = compareBy(a, b, extract);
      if (diff !== 0) return diff;
    }
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
function matchAgeCategoryFilter(entry: Entry, minCat: AgeCategory | null, maxCat: AgeCategory | null): boolean {
  if (entry.age == null) return false;
  if (minCat && entry.age < minCat.minAge) return false;
  if (maxCat && maxCat.maxAge != null && entry.age > maxCat.maxAge) return false;
  return true;
}

function matchGradeNumber(eNum: number, minNum: number | null, maxNum: number | null): boolean {
  if (minNum != null && eNum < minNum) return false;
  if (maxNum != null && eNum > maxNum) return false;
  return true;
}

function matchApproxAge(entry: Entry, minNum: number | null, maxNum: number | null): boolean {
  if (entry.age == null) return false;
  if (minNum != null && entry.age < minNum + 5) return false;
  if (maxNum != null && entry.age > maxNum + 6) return false;
  return true;
}

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
    if (hasAgeCategoryFilter) return matchAgeCategoryFilter(entry, minCat, maxCat);

    const eNum = gradeToNumber(entry.grade ?? null);
    if (eNum != null) return matchGradeNumber(eNum, minNum, maxNum);

    if (entry.grade && findAgeCategory(entry.grade, ageCategories)) {
      return matchApproxAge(entry, minNum, maxNum);
    }

    return false;
  };
}
