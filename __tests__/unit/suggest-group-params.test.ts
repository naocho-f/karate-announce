/**
 * おすすめ振り分けのパラメータ引き継ぎテスト
 *
 * SuggestCreateDialog の GroupResult に maxWeightDiff が含まれ、
 * onExecute でフォールバック付きで使われることを検証する。
 */
import { describe, it, expect } from "vitest";

type GroupResult = {
  name: string;
  maxWeightDiff?: number | null;
  maxHeightDiff?: number | null;
};

type MismatchSettings = {
  maxWeightDiff: number | null;
  maxHeightDiff: number | null;
};

/**
 * page.tsx の onExecute 内で行われるフォールバックロジックを再現
 */
function applyFallback(g: GroupResult, mismatchSettings: MismatchSettings) {
  return {
    maxWeightDiff: g.maxWeightDiff ?? mismatchSettings.maxWeightDiff,
    maxHeightDiff: g.maxHeightDiff ?? mismatchSettings.maxHeightDiff,
  };
}

describe("おすすめ振り分けパラメータ引き継ぎ", () => {
  it("ダイアログで設定した maxWeightDiff がグループに引き継がれる", () => {
    const group: GroupResult = { name: "軽量級", maxWeightDiff: 5 };
    const mismatchSettings: MismatchSettings = { maxWeightDiff: 10, maxHeightDiff: null };

    const result = applyFallback(group, mismatchSettings);
    expect(result.maxWeightDiff).toBe(5);
  });

  it("ダイアログで未設定の場合はグローバル設定にフォールバックする", () => {
    const group: GroupResult = { name: "全階級" };
    const mismatchSettings: MismatchSettings = { maxWeightDiff: 10, maxHeightDiff: 15 };

    const result = applyFallback(group, mismatchSettings);
    expect(result.maxWeightDiff).toBe(10);
    expect(result.maxHeightDiff).toBe(15);
  });

  it("ダイアログで null を設定した場合はグローバル設定にフォールバックする", () => {
    const group: GroupResult = { name: "全階級", maxWeightDiff: null, maxHeightDiff: null };
    const mismatchSettings: MismatchSettings = { maxWeightDiff: 8, maxHeightDiff: 20 };

    const result = applyFallback(group, mismatchSettings);
    // null ?? value は value を返す（null は nullish なのでフォールバック）
    expect(result.maxWeightDiff).toBe(8);
    expect(result.maxHeightDiff).toBe(20);
  });

  it("両方とも null の場合は null のまま", () => {
    const group: GroupResult = { name: "全階級", maxWeightDiff: null };
    const mismatchSettings: MismatchSettings = { maxWeightDiff: null, maxHeightDiff: null };

    const result = applyFallback(group, mismatchSettings);
    expect(result.maxWeightDiff).toBeNull();
    expect(result.maxHeightDiff).toBeNull();
  });

  it("ダイアログで 0 を設定した場合はフォールバックしない（0 は有効値）", () => {
    const group: GroupResult = { name: "制限なし", maxWeightDiff: 0 };
    const mismatchSettings: MismatchSettings = { maxWeightDiff: 10, maxHeightDiff: null };

    const result = applyFallback(group, mismatchSettings);
    // 0 は nullish ではないのでフォールバックしない
    expect(result.maxWeightDiff).toBe(0);
  });
});
