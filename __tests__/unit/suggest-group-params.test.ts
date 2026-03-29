/**
 * おすすめ振り分けのパラメータ引き継ぎテスト
 *
 * SuggestCreateDialog の GroupResult に maxWeightDiff / maxAgeDiff / ruleId が含まれ、
 * onExecute でフォールバック付きで使われることを検証する。
 */
import { describe, it, expect } from "vitest";
import { splitByAgeDiff } from "@/components/suggest-create-dialog";
import type { Entry } from "@/lib/types";

type GroupResult = {
  name: string;
  maxWeightDiff?: number | null;
  maxHeightDiff?: number | null;
  maxAgeDiff?: number | null;
  ruleId?: string;
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

describe("ruleId 引き継ぎ", () => {
  type PairEntry = { id: string; ruleId: string };
  type GroupResultWithPairs = GroupResult & { pairs: PairEntry[] };

  function applyRuleId(g: GroupResultWithPairs): PairEntry[] {
    return g.pairs.map(p => ({ ...p, ruleId: g.ruleId || p.ruleId || "" }));
  }

  it("GroupResult の ruleId がペアに反映される", () => {
    const group: GroupResultWithPairs = {
      name: "軽量級",
      ruleId: "rule-1",
      pairs: [
        { id: "p1", ruleId: "" },
        { id: "p2", ruleId: "" },
      ],
    };
    const result = applyRuleId(group);
    expect(result[0].ruleId).toBe("rule-1");
    expect(result[1].ruleId).toBe("rule-1");
  });

  it("GroupResult に ruleId がなければペア自身の ruleId を保持する", () => {
    const group: GroupResultWithPairs = {
      name: "軽量級",
      pairs: [
        { id: "p1", ruleId: "existing-rule" },
        { id: "p2", ruleId: "" },
      ],
    };
    const result = applyRuleId(group);
    expect(result[0].ruleId).toBe("existing-rule");
    expect(result[1].ruleId).toBe("");
  });
});

describe("splitByAgeDiff", () => {
  function makeEntry(id: string, age: number | null): Entry {
    return {
      id,
      event_id: "ev1",
      fighter_id: "f1",
      last_name: "テスト",
      first_name: id,
      last_name_kana: "テスト",
      first_name_kana: id,
      dojo: "",
      age,
      weight: null,
      height: null,
      sex: null,
      experience: null,
      rank: null,
      is_withdrawn: false,
      entry_number: null,
    };
  }

  it("maxAgeDiff が null の場合は分割しない", () => {
    const entries = [makeEntry("a", 10), makeEntry("b", 20)];
    const result = splitByAgeDiff(entries, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("年齢差が制限内なら分割しない", () => {
    const entries = [makeEntry("a", 10), makeEntry("b", 12), makeEntry("c", 13)];
    const result = splitByAgeDiff(entries, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
  });

  it("年齢差が制限を超える場合はサブグループに分割する", () => {
    const entries = [makeEntry("a", 8), makeEntry("b", 10), makeEntry("c", 15), makeEntry("d", 16)];
    const result = splitByAgeDiff(entries, 3);
    expect(result).toHaveLength(2);
    expect(result[0].map(e => e.first_name)).toEqual(["a", "b"]);
    expect(result[1].map(e => e.first_name)).toEqual(["c", "d"]);
  });

  it("年齢なしの選手は最後のグループに入る", () => {
    const entries = [makeEntry("a", 8), makeEntry("b", 15), makeEntry("c", null)];
    const result = splitByAgeDiff(entries, 3);
    expect(result).toHaveLength(2);
    // 年齢なしは最後のグループに
    expect(result[1].map(e => e.first_name)).toContain("c");
    expect(result[1].map(e => e.first_name)).toContain("b");
  });

  it("全員年齢なしの場合は1グループ", () => {
    const entries = [makeEntry("a", null), makeEntry("b", null)];
    const result = splitByAgeDiff(entries, 3);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("3グループに分割されるケース", () => {
    const entries = [
      makeEntry("a", 7), makeEntry("b", 8),
      makeEntry("c", 12), makeEntry("d", 13),
      makeEntry("e", 18), makeEntry("f", 19),
    ];
    const result = splitByAgeDiff(entries, 2);
    expect(result).toHaveLength(3);
  });
});
