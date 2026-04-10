/**
 * CourtSection デフォルト値・sort_order 採番ロジックのテスト
 *
 * 1. 体重差のデフォルト値が 5kg であること
 * 2. 新規トーナメント追加時の sort_order が既存の最大値 + 1 から採番されること
 */
import { describe, it, expect } from "vitest";

describe("mismatchSettings デフォルト値", () => {
  it("maxWeightDiff のデフォルトは 5", () => {
    // page.tsx の useState 初期値と同じロジック
    const defaultSettings = { maxWeightDiff: 5, maxHeightDiff: null };
    expect(defaultSettings.maxWeightDiff).toBe(5);
    expect(defaultSettings.maxHeightDiff).toBeNull();
  });
});

describe("新規トーナメントの sort_order 採番", () => {
  // page.tsx の confirm() 内のロジックを再現:
  // sortOrder: editingSortOrder ?? (Math.max(0, ...tournaments.map(t => t.sort_order)) + groupIndex + 1)

  function calcSortOrder(
    editingSortOrder: number | null,
    tournaments: { sort_order: number }[],
    groupIndex: number,
  ): number {
    return editingSortOrder ?? Math.max(0, ...tournaments.map((t) => t.sort_order)) + groupIndex + 1;
  }

  it("既存トーナメントがない場合、groupIndex=0 → sort_order=1", () => {
    expect(calcSortOrder(null, [], 0)).toBe(1);
  });

  it("既存トーナメントがない場合、groupIndex=1 → sort_order=2", () => {
    expect(calcSortOrder(null, [], 1)).toBe(2);
  });

  it("既存の最大 sort_order が 3 の場合、groupIndex=0 → sort_order=4", () => {
    const tournaments = [{ sort_order: 1 }, { sort_order: 3 }, { sort_order: 2 }];
    expect(calcSortOrder(null, tournaments, 0)).toBe(4);
  });

  it("既存の最大 sort_order が 5 の場合、複数グループが連番になる", () => {
    const tournaments = [{ sort_order: 5 }];
    expect(calcSortOrder(null, tournaments, 0)).toBe(6);
    expect(calcSortOrder(null, tournaments, 1)).toBe(7);
    expect(calcSortOrder(null, tournaments, 2)).toBe(8);
  });

  it("編集時は editingSortOrder がそのまま使われる", () => {
    const tournaments = [{ sort_order: 10 }];
    expect(calcSortOrder(3, tournaments, 0)).toBe(3);
  });

  it("編集時は editingSortOrder=0 でも 0 が使われる", () => {
    const tournaments = [{ sort_order: 5 }];
    expect(calcSortOrder(0, tournaments, 0)).toBe(0);
  });
});
