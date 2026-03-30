/**
 * 振り分けルールに基づく全自動対戦表作成ロジック
 *
 * groupEntriesByRules: 振り分けルールに従ってエントリーをグループ分け
 * assignCourts: グループにコートを割り当て
 */
import type { Entry, BracketRule } from "./types";
import { pairsFromEntries, type PairEntry } from "./pairing";
import { gradeToNumber } from "./grade-options";

export type AutoGroup = {
  id: string;
  name: string;
  ruleId: string | null;       // 対象の競技ルールID
  courtNum: number | null;     // 割り当てコート（null=自動）
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

/** エントリーが振り分けルールの条件に合致するか判定 */
function matchesRule(
  entry: Entry,
  rule: BracketRule,
  entryRuleIds: Record<string, Set<string>>,
): boolean {
  // 競技ルール条件
  if (rule.rule_id) {
    const rids = entryRuleIds[entry.id];
    if (!rids || !rids.has(rule.rule_id)) return false;
  }

  // 年齢条件
  const age = getAge(entry);
  if (rule.min_age != null && (age == null || age < rule.min_age)) return false;
  if (rule.max_age != null && (age == null || age > rule.max_age)) return false;

  // 体重条件
  if (rule.min_weight != null && (entry.weight == null || entry.weight < rule.min_weight)) return false;
  if (rule.max_weight != null && (entry.weight == null || entry.weight > rule.max_weight)) return false;

  // 身長条件
  if (rule.min_height != null && (entry.height == null || entry.height < rule.min_height)) return false;
  if (rule.max_height != null && (entry.height == null || entry.height > rule.max_height)) return false;

  // 性別条件
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
export function groupEntriesByRules(
  entries: Entry[],
  bracketRules: BracketRule[],
  entryRuleIds: Record<string, Set<string>>,
): AutoGroup[] {
  // ルールを sort_order 順に処理
  const sortedRules = [...bracketRules].sort((a, b) => a.sort_order - b.sort_order);
  const assignedIds = new Set<string>();
  const groups: AutoGroup[] = [];

  for (const rule of sortedRules) {
    const matching = entries.filter(
      (e) => !assignedIds.has(e.id) && matchesRule(e, rule, entryRuleIds),
    );

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
export function assignCourts(
  groups: AutoGroup[],
  courtCount: number,
): AutoGroup[] {
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
