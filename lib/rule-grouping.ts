import type { Entry, Rule } from "@/lib/types";

export type RuleGroup = {
  rule: Rule | null;
  entries: Entry[];
  totalDesired: number;
};

/**
 * 未割当選手をルール別にグループ化する。
 * - defaultRuleId が指定されている場合（ルール絞込時）はフラット表示
 * - ルールが1つ以下の場合もフラット表示
 */
export function buildRuleGroups(
  entries: Entry[],
  allRules: Rule[],
  defaultRuleId: string,
  entryRuleIds: Record<string, Set<string>>,
  getDesiredMatchCount: (e: Entry) => number,
): RuleGroup[] {
  const ruleGroups: RuleGroup[] = [];

  if (!defaultRuleId && allRules.length > 0) {
    for (const rule of allRules) {
      const ruleEntries = entries.filter((e) => entryRuleIds[e.id]?.has(rule.id));
      if (ruleEntries.length > 0) {
        const totalDesired = ruleEntries.reduce((sum, e) => sum + getDesiredMatchCount(e), 0);
        ruleGroups.push({ rule, entries: ruleEntries, totalDesired });
      }
    }
    // ルールに属さない選手
    const noRuleEntries = entries.filter((e) => {
      const rids = entryRuleIds[e.id];
      return !rids || rids.size === 0 || !allRules.some((r) => rids.has(r.id));
    });
    if (noRuleEntries.length > 0) {
      const totalDesired = noRuleEntries.reduce((sum, e) => sum + getDesiredMatchCount(e), 0);
      ruleGroups.push({ rule: null, entries: noRuleEntries, totalDesired });
    }
  }

  // ルール絞込時 or ルールが1つ以下の場合はフラット表示
  if (ruleGroups.length <= 1) {
    ruleGroups.length = 0;
    const totalDesired = entries.reduce((sum, e) => sum + getDesiredMatchCount(e), 0);
    ruleGroups.push({ rule: null, entries, totalDesired });
  }

  return ruleGroups;
}
