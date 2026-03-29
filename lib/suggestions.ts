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

export function computeBalance(below: number, above: number): "◎" | "△" | "✕" {
  const diff = Math.abs(below - above);
  const total = below + above;
  return diff <= 1 ? "◎" : diff <= Math.max(2, Math.floor(total * 0.25)) ? "△" : "✕";
}

export function computeSuggestions(ents: Entry[]): SplitSuggestion[] {
  const active = ents.filter(e => !e.is_withdrawn);
  const results: SplitSuggestion[] = [];

  // 体重（メイン分割軸）
  const weightEntries = active.filter(e => e.weight != null);
  if (weightEntries.length >= 2) {
    for (const t of [45, 50, 55, 60, 65, 70, 75, 80]) {
      const below = weightEntries.filter(e => e.weight! < t).length;
      const above = weightEntries.filter(e => e.weight! >= t).length;
      if (below === 0 || above === 0) continue;
      results.push({ axis: "weight", threshold: t, belowLabel: `${t}kg未満`, aboveLabel: `${t}kg以上`, belowCount: below, aboveCount: above, balance: computeBalance(below, above) });
    }
  }

  // 年齢
  const ageEntries = active.filter(e => e.age != null);
  if (ageEntries.length >= 2) {
    for (const t of [15, 18, 20, 25, 30, 31, 35, 40, 45]) {
      const below = ageEntries.filter(e => e.age! < t).length;
      const above = ageEntries.filter(e => e.age! >= t).length;
      if (below === 0 || above === 0) continue;
      results.push({ axis: "age", threshold: t, belowLabel: `${t}歳未満`, aboveLabel: `${t}歳以上`, belowCount: below, aboveCount: above, balance: computeBalance(below, above) });
    }
  }

  // 性別
  const sexEntries = active.filter(e => e.sex === "male" || e.sex === "female");
  if (sexEntries.length >= 2) {
    const males = sexEntries.filter(e => e.sex === "male").length;
    const females = sexEntries.filter(e => e.sex === "female").length;
    if (males > 0 && females > 0) {
      results.push({ axis: "sex", threshold: "sex", belowLabel: "男子", aboveLabel: "女子", belowCount: males, aboveCount: females, balance: computeBalance(males, females) });
    }
  }

  // 身長
  const heightEntries = active.filter(e => e.height != null);
  if (heightEntries.length >= 2) {
    for (const t of [155, 160, 165, 170, 175, 180]) {
      const below = heightEntries.filter(e => e.height! < t).length;
      const above = heightEntries.filter(e => e.height! >= t).length;
      if (below === 0 || above === 0) continue;
      results.push({ axis: "height", threshold: t, belowLabel: `${t}cm未満`, aboveLabel: `${t}cm以上`, belowCount: below, aboveCount: above, balance: computeBalance(below, above) });
    }
  }

  // 経験（年数パターンを抽出して分割）
  const expEntries = active.filter(e => e.experience != null);
  if (expEntries.length >= 2) {
    const parseExpYears = (exp: string): number | null => {
      const m = exp.match(/(\d+)\s*年/);
      return m ? parseInt(m[1], 10) : null;
    };
    const withYears = expEntries.map(e => ({ entry: e, years: parseExpYears(e.experience!) })).filter(x => x.years != null) as { entry: Entry; years: number }[];
    if (withYears.length >= 2) {
      for (const t of [3, 5, 7, 10]) {
        const below = withYears.filter(x => x.years < t).length;
        const above = withYears.filter(x => x.years >= t).length;
        if (below === 0 || above === 0) continue;
        results.push({ axis: "experience", threshold: t, belowLabel: `${t}年未満`, aboveLabel: `${t}年以上`, belowCount: below, aboveCount: above, balance: computeBalance(below, above) });
      }
    }
  }

  const nonPoor = results.filter(r => r.balance !== "✕");
  return (nonPoor.length > 0 ? nonPoor : results)
    .sort((a, b) => {
      const order = { "◎": 0, "△": 1, "✕": 2 };
      if (order[a.balance] !== order[b.balance]) return order[a.balance] - order[b.balance];
      return Math.abs(a.belowCount - a.aboveCount) - Math.abs(b.belowCount - b.aboveCount);
    })
    .slice(0, 8);
}
