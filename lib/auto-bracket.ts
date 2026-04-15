/**
 * 振り分けルールに基づく全自動対戦表作成ロジック
 *
 * groupEntriesByRules: 振り分けルールに従ってエントリーをグループ分け
 * assignCourts: グループにコートを割り当て
 */
import type { Entry, BracketRule } from "./types";
import { pairsFromEntries, type PairEntry } from "./pairing";
import { gradeToNumber, findAgeCategory } from "./grade-options";

export type AutoGroup = {
  id: string;
  name: string;
  ruleId: string | null; // 対象の競技ルールID
  courtNum: number | null; // 割り当てコート（null=自動）
  entries: Entry[];
  pairs: PairEntry[];
  maxWeightDiff: number | null;
  maxHeightDiff: number | null;
};

/** エントリーの年齢を取得する（birth_date or age フィールド） */
function getAge(entry: Entry, referenceDate?: Date): number | null {
  if (entry.age != null) return entry.age;
  if (!entry.birth_date) return null;
  const ref = referenceDate ?? new Date();
  const birth = new Date(entry.birth_date);
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDiff = ref.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// gradeToNumber は lib/grade-options.ts からインポート

/** 競技ルール条件 */
function matchesRuleId(entry: Entry, rule: BracketRule, entryRuleIds: Record<string, Set<string>>): boolean {
  if (!rule.rule_id) return true;
  const rids = entryRuleIds[entry.id];
  return !!(rids && rids.has(rule.rule_id));
}

/** 年齢条件 */
function matchesAge(entry: Entry, rule: BracketRule): boolean {
  const age = getAge(entry);
  if (rule.min_age != null && (age == null || age < rule.min_age)) return false;
  if (rule.max_age != null && (age == null || age > rule.max_age)) return false;
  return true;
}

/** 範囲条件（体重・身長） */
function matchesRange(value: number | null | undefined, min: number | null | undefined, max: number | null | undefined): boolean {
  if (min != null && (value == null || value < min)) return false;
  if (max != null && (value == null || value > max)) return false;
  return true;
}

/** 学年ベースのエントリーに対する年代条件 */
function matchesGradeByNumber(entryGradeNum: number, rule: BracketRule): boolean {
  if (rule.min_grade != null) {
    const minNum = gradeToNumber(rule.min_grade);
    if (minNum != null && entryGradeNum < minNum) return false;
  }
  if (rule.max_grade != null) {
    const maxNum = gradeToNumber(rule.max_grade);
    if (maxNum != null && entryGradeNum > maxNum) return false;
  }
  return true;
}

/** 年齢カテゴリベースで年代条件を判定 */
function matchesAgeByCategoryRange(entryAge: number, minCat: { minAge: number } | null, maxCat: { maxAge: number | null } | null): boolean {
  if (minCat && entryAge < minCat.minAge) return false;
  if (maxCat && maxCat.maxAge != null && entryAge > maxCat.maxAge) return false;
  return true;
}

/** 数値学年から推定年齢で比較 */
function matchesAgeByGradeEstimate(entryAge: number, rule: BracketRule): boolean {
  if (rule.min_grade != null) {
    const minNum = gradeToNumber(rule.min_grade);
    if (minNum != null && entryAge < minNum + 5) return false;
  }
  if (rule.max_grade != null) {
    const maxNum = gradeToNumber(rule.max_grade);
    if (maxNum != null && entryAge > maxNum + 6) return false;
  }
  return true;
}

/** 年齢ベース区分のエントリーに対する年代条件 */
function matchesGradeByAge(entryAge: number | null, rule: BracketRule): boolean {
  const minCat = rule.min_grade ? findAgeCategory(rule.min_grade) : null;
  const maxCat = rule.max_grade ? findAgeCategory(rule.max_grade) : null;

  if (minCat || maxCat) {
    if (entryAge == null) return false;
    return matchesAgeByCategoryRange(entryAge, minCat, maxCat);
  }

  if (entryAge == null) return false;
  return matchesAgeByGradeEstimate(entryAge, rule);
}

/** 年代条件 */
function matchesGrade(entry: Entry, rule: BracketRule): boolean {
  if (rule.min_grade == null && rule.max_grade == null) return true;
  const entryGradeNum = gradeToNumber(entry.grade);
  if (entryGradeNum != null) return matchesGradeByNumber(entryGradeNum, rule);
  return matchesGradeByAge(getAge(entry), rule);
}

/** エントリーが振り分けルールの条件に合致するか判定 */
function matchesRule(entry: Entry, rule: BracketRule, entryRuleIds: Record<string, Set<string>>): boolean {
  if (!matchesRuleId(entry, rule, entryRuleIds)) return false;
  if (!matchesAge(entry, rule)) return false;
  if (!matchesRange(entry.weight, rule.min_weight, rule.max_weight)) return false;
  if (!matchesRange(entry.height, rule.min_height, rule.max_height)) return false;
  if (!matchesGrade(entry, rule)) return false;
  if (rule.sex_filter && entry.sex !== rule.sex_filter) return false;
  return true;
}

/**
 * 学年差制限に基づいてエントリーをサブグループに分割する
 * max_grade_diff が設定されている場合、学年差が閾値を超える選手を別グループに分ける
 */
function splitByGradeDiff(entries: Entry[], maxGradeDiff: number): Entry[][] {
  if (entries.length <= 1) return [entries];

  // 学年が取得できる選手を学年順にソート
  const withGrade = entries
    .map((e) => ({ entry: e, grade: gradeToNumber(e.grade) }))
    .filter((x): x is { entry: Entry; grade: number } => x.grade != null)
    .sort((a, b) => a.grade - b.grade);

  const noGrade = entries.filter((e) => gradeToNumber(e.grade) == null);

  if (withGrade.length === 0) return [entries];

  // 連続する学年差が閾値以内のグループにまとめる
  const groups: Entry[][] = [];
  let currentGroup: Entry[] = [withGrade[0].entry];
  let groupMinGrade = withGrade[0].grade;

  for (let i = 1; i < withGrade.length; i++) {
    const diff = withGrade[i].grade - groupMinGrade;
    if (diff <= maxGradeDiff) {
      currentGroup.push(withGrade[i].entry);
    } else {
      groups.push(currentGroup);
      currentGroup = [withGrade[i].entry];
      groupMinGrade = withGrade[i].grade;
    }
  }
  groups.push(currentGroup);

  // 学年なし選手は最大グループに追加
  if (noGrade.length > 0) {
    const largest = groups.reduce((a, b) => (a.length >= b.length ? a : b), groups[0]);
    largest.push(...noGrade);
  }

  return groups;
}

/**
 * 振り分けルールに基づいてエントリーをグループ分けする
 *
 * 1. sort_order 順にルールを処理
 * 2. 各ルールの条件に合致する未割当選手をグループ化
 * 3. max_grade_diff がある場合はサブグループに分割
 * 4. どのルールにも合致しなかった選手は「未分類」として返す
 */
export function groupEntriesByRules(entries: Entry[], bracketRules: BracketRule[], entryRuleIds: Record<string, Set<string>>): AutoGroup[] {
  // ルールを sort_order 順に処理
  const sortedRules = [...bracketRules].sort((a, b) => a.sort_order - b.sort_order);
  const assignedIds = new Set<string>();
  const groups: AutoGroup[] = [];

  for (const rule of sortedRules) {
    const matching = entries.filter((e) => !assignedIds.has(e.id) && matchesRule(e, rule, entryRuleIds));

    if (matching.length === 0) continue;

    // 学年差制限がある場合はサブグループに分割
    if (rule.max_grade_diff != null) {
      const subGroups = splitByGradeDiff(matching, rule.max_grade_diff);
      subGroups.forEach((sub, idx) => {
        const name = subGroups.length > 1 ? `${rule.name}（${idx + 1}）` : rule.name;
        const pairs = pairsFromEntries(sub);
        groups.push({
          id: crypto.randomUUID(),
          name,
          ruleId: rule.rule_id,
          courtNum: rule.court_num,
          entries: sub,
          pairs,
          maxWeightDiff: rule.max_weight_diff,
          maxHeightDiff: rule.max_height_diff,
        });
        sub.forEach((e) => assignedIds.add(e.id));
      });
    } else {
      const pairs = pairsFromEntries(matching);
      groups.push({
        id: crypto.randomUUID(),
        name: rule.name,
        ruleId: rule.rule_id,
        courtNum: rule.court_num,
        entries: matching,
        pairs,
        maxWeightDiff: rule.max_weight_diff,
        maxHeightDiff: rule.max_height_diff,
      });
      matching.forEach((e) => assignedIds.add(e.id));
    }
  }

  // 未分類（どのルールにも合致しなかった選手）
  const unmatched = entries.filter((e) => !assignedIds.has(e.id));
  if (unmatched.length > 0) {
    const pairs = pairsFromEntries(unmatched);
    groups.push({
      id: crypto.randomUUID(),
      name: "未分類",
      ruleId: null,
      courtNum: null,
      entries: unmatched,
      pairs,
      maxWeightDiff: null,
      maxHeightDiff: null,
    });
  }

  return groups;
}

/**
 * グループにコートを割り当てる
 *
 * - courtNum が指定されているグループはそのコートに固定
 * - courtNum が null のグループは試合数が最小のコートに割り当て
 * - コート間の試合数差が全体の30%以上の場合、null グループを調整
 */
export function assignCourts(groups: AutoGroup[], courtCount: number): AutoGroup[] {
  if (courtCount <= 0) return groups;

  // 各コートの試合数をカウント
  const courtMatchCounts: number[] = Array(courtCount).fill(0);

  // 固定コートのグループを先に処理
  const fixed: AutoGroup[] = [];
  const flexible: AutoGroup[] = [];

  for (const g of groups) {
    if (g.courtNum != null && g.courtNum >= 1 && g.courtNum <= courtCount) {
      fixed.push(g);
      courtMatchCounts[g.courtNum - 1] += g.pairs.length;
    } else {
      flexible.push(g);
    }
  }

  // flexible グループを試合数が少ないコートに割り当て
  const result: AutoGroup[] = [...fixed];
  for (const g of flexible) {
    const minIdx = courtMatchCounts.indexOf(Math.min(...courtMatchCounts));
    const courtNum = minIdx + 1;
    result.push({ ...g, courtNum: courtNum });
    courtMatchCounts[minIdx] += g.pairs.length;
  }

  return result;
}
