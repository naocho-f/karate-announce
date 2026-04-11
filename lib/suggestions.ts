/**
 * おすすめ振り分け（階級分け提案）ロジック
 *
 * computeSuggestions: 選手リストから年齢・体重・性別・身長・経験で分割したときの人数バランスを評価
 * computeBalance: 2グループの人数バランスを評価
 */
import type { Entry } from "./types";

export type SplitSuggestion = {
  axis: "age" | "weight" | "sex" | "experience" | "height";
  threshold: number | string;
  belowLabel: string;
  aboveLabel: string;
  belowCount: number;
  aboveCount: number;
  balance: "◎" | "△" | "✕";
};

function computeBalance(below: number, above: number): "◎" | "△" | "✕" {
  const diff = Math.abs(below - above);
  const total = below + above;
  return diff <= 1 ? "◎" : diff <= Math.max(2, Math.floor(total * 0.25)) ? "△" : "✕";
}

function numericSplits(
  entries: Entry[],
  axis: SplitSuggestion["axis"],
  getValue: (e: Entry) => number | null | undefined,
  thresholds: number[],
  unit: string,
): SplitSuggestion[] {
  const valid = entries.filter((e) => getValue(e) != null);
  if (valid.length < 2) return [];
  const results: SplitSuggestion[] = [];
  for (const t of thresholds) {
    const below = valid.filter((e) => (getValue(e) as number) < t).length;
    const above = valid.length - below;
    if (below === 0 || above === 0) continue;
    results.push({
      axis,
      threshold: t,
      belowLabel: `${t}${unit}未満`,
      aboveLabel: `${t}${unit}以上`,
      belowCount: below,
      aboveCount: above,
      balance: computeBalance(below, above),
    });
  }
  return results;
}

function sexSplits(entries: Entry[]): SplitSuggestion[] {
  const sexEntries = entries.filter((e) => e.sex === "male" || e.sex === "female");
  if (sexEntries.length < 2) return [];
  const males = sexEntries.filter((e) => e.sex === "male").length;
  const females = sexEntries.length - males;
  if (males === 0 || females === 0) return [];
  return [{ axis: "sex", threshold: "sex", belowLabel: "男子", aboveLabel: "女子", belowCount: males, aboveCount: females, balance: computeBalance(males, females) }];
}

function experienceSplits(entries: Entry[]): SplitSuggestion[] {
  const parseExpYears = (exp: string): number | null => {
    const m = exp.match(/(\d+)\s*年/);
    return m ? parseInt(m[1], 10) : null;
  };
  const withYears = entries
    .filter((e) => e.experience != null)
    .map((e) => ({ entry: e, years: parseExpYears(e.experience as string) }))
    .filter((x): x is { entry: Entry; years: number } => x.years != null);
  if (withYears.length < 2) return [];
  const results: SplitSuggestion[] = [];
  for (const t of [3, 5, 7, 10]) {
    const below = withYears.filter((x) => x.years < t).length;
    const above = withYears.length - below;
    if (below === 0 || above === 0) continue;
    results.push({ axis: "experience", threshold: t, belowLabel: `${t}年未満`, aboveLabel: `${t}年以上`, belowCount: below, aboveCount: above, balance: computeBalance(below, above) });
  }
  return results;
}

export function computeSuggestions(ents: Entry[]): SplitSuggestion[] {
  const active = ents.filter((e) => !e.is_withdrawn);
  const results: SplitSuggestion[] = [
    ...numericSplits(active, "weight", (e) => e.weight, [45, 50, 55, 60, 65, 70, 75, 80], "kg"),
    ...numericSplits(active, "age", (e) => e.age, [15, 18, 20, 25, 30, 31, 35, 40, 45], "歳"),
    ...sexSplits(active),
    ...numericSplits(active, "height", (e) => e.height, [155, 160, 165, 170, 175, 180], "cm"),
    ...experienceSplits(active),
  ];

  const nonPoor = results.filter((r) => r.balance !== "✕");
  const balanceOrder = { "◎": 0, "△": 1, "✕": 2 };
  return (nonPoor.length > 0 ? nonPoor : results)
    .sort((a, b) => {
      if (balanceOrder[a.balance] !== balanceOrder[b.balance]) return balanceOrder[a.balance] - balanceOrder[b.balance];
      return Math.abs(a.belowCount - a.aboveCount) - Math.abs(b.belowCount - b.aboveCount);
    })
    .slice(0, 8);
}
