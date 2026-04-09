/**
 * 対戦表自動ペアリングロジック
 *
 * pairsFromEntries: 選手リストから自動でペアを生成する
 * - 2の累乗になるよう不戦勝を自動挿入
 * - 体格が平均から外れている選手を優先的に不戦勝に
 * - 残り選手を体格近似でペアリング
 */
import type { Entry } from "./types";

export type PairEntry = {
  id: string;
  e1: Entry;
  e2: Entry | null;
  matchLabel: string;
  ruleId: string;
};

/** 2選手間の体格乖離スコア（小さいほど近い） */
export function entryCompatScore(e1: Entry, e2: Entry): number {
  let s = 0;
  if (e1.weight && e2.weight) s += Math.abs(e1.weight - e2.weight) * 2;
  if (e1.height && e2.height) s += Math.abs(e1.height - e2.height) * 0.3;
  return s;
}

/** 次の2の累乗を返す（n以上の最小の2の累乗） */
function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * 選手リストからペアを自動生成する
 *
 * 1. 参加人数から必要な不戦勝数を計算（2の累乗にする）
 * 2. 体格が平均から外れている選手を優先的に不戦勝に
 * 3. 残りを体格近似でペアリング
 */
export function pairsFromEntries(chunk: Entry[]): PairEntry[] {
  if (chunk.length === 0) return [];
  if (chunk.length === 1) {
    return [{ id: crypto.randomUUID(), e1: chunk[0], e2: null, matchLabel: "", ruleId: "" }];
  }

  const n = chunk.length;
  const nextPow2 = nextPowerOf2(n);
  const byeCount = nextPow2 - n;

  // 体格の平均を計算
  const weights = chunk.filter((e) => e.weight != null).map((e) => e.weight as number);
  const heights = chunk.filter((e) => e.height != null).map((e) => e.height as number);
  const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
  const avgHeight = heights.length > 0 ? heights.reduce((a, b) => a + b, 0) / heights.length : 0;

  // 各選手の平均からの乖離スコアを計算
  const deviationScores = chunk.map((e) => {
    const wDev = e.weight != null ? Math.abs(e.weight - avgWeight) : 0;
    const hDev = e.height != null ? Math.abs(e.height - avgHeight) : 0;
    return { entry: e, score: wDev * 2 + hDev * 0.3 };
  });

  // 乖離スコアが大きい順にソート → 不戦勝対象を選ぶ
  deviationScores.sort((a, b) => b.score - a.score);

  const byeEntries = deviationScores.slice(0, byeCount).map((d) => d.entry);
  const byeIds = new Set(byeEntries.map((e) => e.id));
  const remainingEntries = chunk.filter((e) => !byeIds.has(e.id));

  const result: PairEntry[] = [];

  // 不戦勝ペアを先頭に
  for (const e of byeEntries) {
    result.push({ id: crypto.randomUUID(), e1: e, e2: null, matchLabel: "", ruleId: "" });
  }

  // 残りを体重順でソートしてペアリング
  const pool = [...remainingEntries].sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999));
  while (pool.length >= 2) {
    const e1 = pool.shift();
    if (!e1) break;
    let bestIdx = 0;
    let best = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = entryCompatScore(e1, pool[i]);
      if (s < best) {
        best = s;
        bestIdx = i;
      }
    }
    const e2 = pool.splice(bestIdx, 1)[0];
    result.push({ id: crypto.randomUUID(), e1, e2, matchLabel: "", ruleId: "" });
  }

  return result;
}

