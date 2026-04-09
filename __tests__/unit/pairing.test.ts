/**
 * pairing.ts 単体テスト
 *
 * 自動ペアリングロジックを検証する:
 * - 2の累乗になるよう不戦勝が自動挿入される
 * - 体格が平均から外れた選手が不戦勝になる
 * - 残り選手が体格近似でペアリングされる
 */
import { describe, it, expect } from "vitest";
import { pairsFromEntries, entryCompatScore } from "@/lib/pairing";
import type { Entry } from "@/lib/types";

function makeEntry(id: string, overrides?: Partial<Entry>): Entry {
  return {
    id,
    event_id: "ev-1",
    family_name: `選手${id}`,
    given_name: null,
    family_name_reading: null,
    given_name_reading: null,
    dojo_name: null,
    dojo_name_reading: null,
    school_name: null,
    school_name_reading: null,
    sex: null,
    weight: null,
    height: null,
    birth_date: null,
    age: null,
    grade: null,
    experience: null,
    memo: null,
    admin_memo: null,
    is_withdrawn: false,
    is_test: false,
    fighter_id: null,
    extra_fields: {},
    form_version: null,
    created_at: "",
    ...overrides,
  };
}

describe("entryCompatScore", () => {
  it("体重差のみ", () => {
    const e1 = makeEntry("1", { weight: 50 });
    const e2 = makeEntry("2", { weight: 60 });
    expect(entryCompatScore(e1, e2)).toBe(20); // |50-60| * 2 = 20
  });

  it("身長差のみ", () => {
    const e1 = makeEntry("1", { height: 150 });
    const e2 = makeEntry("2", { height: 160 });
    expect(entryCompatScore(e1, e2)).toBeCloseTo(3); // |150-160| * 0.3 = 3
  });

  it("体重・身長両方", () => {
    const e1 = makeEntry("1", { weight: 50, height: 150 });
    const e2 = makeEntry("2", { weight: 60, height: 160 });
    expect(entryCompatScore(e1, e2)).toBeCloseTo(23); // 20 + 3
  });

  it("体重なし → 0", () => {
    const e1 = makeEntry("1", { weight: null });
    const e2 = makeEntry("2", { weight: 60 });
    expect(entryCompatScore(e1, e2)).toBe(0);
  });
});

describe("pairsFromEntries", () => {
  it("空配列 → 空", () => {
    expect(pairsFromEntries([])).toEqual([]);
  });

  it("1人 → 不戦勝1つ", () => {
    const pairs = pairsFromEntries([makeEntry("A")]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].e2).toBeNull();
  });

  it("2人 → 1ペア（2の累乗、不戦勝なし）", () => {
    const pairs = pairsFromEntries([makeEntry("A", { weight: 50 }), makeEntry("B", { weight: 55 })]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].e1).toBeTruthy();
    expect(pairs[0].e2).toBeTruthy();
  });

  it("4人 → 2ペア（2の累乗、不戦勝なし）", () => {
    const entries = [
      makeEntry("A", { weight: 50 }),
      makeEntry("B", { weight: 55 }),
      makeEntry("C", { weight: 60 }),
      makeEntry("D", { weight: 65 }),
    ];
    const pairs = pairsFromEntries(entries);
    expect(pairs).toHaveLength(2);
    const byes = pairs.filter((p) => p.e2 === null);
    expect(byes).toHaveLength(0);
  });

  it("3人 → 2ペア（nextPow2=4、不戦勝1つ）", () => {
    const entries = [
      makeEntry("A", { weight: 50 }),
      makeEntry("B", { weight: 55 }),
      makeEntry("C", { weight: 60 }),
    ];
    const pairs = pairsFromEntries(entries);
    expect(pairs).toHaveLength(2); // 4/2 = 2ペア
    const byes = pairs.filter((p) => p.e2 === null);
    expect(byes).toHaveLength(1);
  });

  it("5人 → 4ペア（nextPow2=8、不戦勝3つ）", () => {
    const entries = [
      makeEntry("A", { weight: 40, height: 140 }),
      makeEntry("B", { weight: 50, height: 155 }),
      makeEntry("C", { weight: 55, height: 160 }),
      makeEntry("D", { weight: 60, height: 165 }),
      makeEntry("E", { weight: 80, height: 180 }),
    ];
    const pairs = pairsFromEntries(entries);
    expect(pairs).toHaveLength(4); // 8/2 = 4ペア
    const byes = pairs.filter((p) => p.e2 === null);
    expect(byes).toHaveLength(3); // 8 - 5 = 3不戦勝
  });

  it("6人 → 4ペア（nextPow2=8、不戦勝2つ）", () => {
    const entries = [
      makeEntry("A", { weight: 40, height: 140 }),
      makeEntry("B", { weight: 50, height: 155 }),
      makeEntry("C", { weight: 55, height: 160 }),
      makeEntry("D", { weight: 60, height: 165 }),
      makeEntry("E", { weight: 70, height: 175 }),
      makeEntry("F", { weight: 80, height: 180 }),
    ];
    const pairs = pairsFromEntries(entries);
    expect(pairs).toHaveLength(4); // 8/2 = 4ペア
    const byes = pairs.filter((p) => p.e2 === null);
    expect(byes).toHaveLength(2); // 8 - 6 = 2不戦勝
  });

  it("体格が平均から外れた選手が不戦勝になる", () => {
    // 平均体重: (40+50+55+60+90)/5 = 59, 平均身長: (140+155+160+165+190)/5 = 162
    // 乖離スコア: A=|40-59|*2+|140-162|*0.3=38+6.6=44.6, E=|90-59|*2+|190-162|*0.3=62+8.4=70.4
    // E, A, D が乖離大 → 不戦勝
    const entries = [
      makeEntry("A", { weight: 40, height: 140 }),
      makeEntry("B", { weight: 50, height: 155 }),
      makeEntry("C", { weight: 55, height: 160 }),
      makeEntry("D", { weight: 60, height: 165 }),
      makeEntry("E", { weight: 90, height: 190 }),
    ];
    const pairs = pairsFromEntries(entries);
    const byePlayerIds = pairs.filter((p) => p.e2 === null).map((p) => p.e1.id);
    // E（最も乖離大）は不戦勝に含まれるべき
    expect(byePlayerIds).toContain("E");
    // A（2番目に乖離大）も不戦勝に含まれるべき
    expect(byePlayerIds).toContain("A");
  });

  it("8人（2の累乗）→ 4ペア、不戦勝なし", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry(String(i), { weight: 50 + i * 5 })
    );
    const pairs = pairsFromEntries(entries);
    expect(pairs).toHaveLength(4);
    const byes = pairs.filter((p) => p.e2 === null);
    expect(byes).toHaveLength(0);
  });

  it("全選手が漏れなく配置される", () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      makeEntry(String(i), { weight: 50 + i * 5 })
    );
    const pairs = pairsFromEntries(entries);
    const allIds = pairs.flatMap((p) => [p.e1.id, p.e2?.id].filter(Boolean));
    // 全7人が配置されている
    expect(new Set(allIds).size).toBe(7);
  });

  it("不戦勝ペアが先頭に配置される", () => {
    const entries = [
      makeEntry("A", { weight: 40 }),
      makeEntry("B", { weight: 50 }),
      makeEntry("C", { weight: 55 }),
    ];
    const pairs = pairsFromEntries(entries);
    // 不戦勝が先頭にある
    const firstBye = pairs.findIndex((p) => p.e2 === null);
    const firstNonBye = pairs.findIndex((p) => p.e2 !== null);
    if (firstBye >= 0 && firstNonBye >= 0) {
      expect(firstBye).toBeLessThan(firstNonBye);
    }
  });

  it("ペア総数が2の累乗の半分になる", () => {
    // 検証: n人の場合、ペア数 = nextPow2(n) / 2
    function nextPow2(n: number): number {
      if (n <= 1) return 1;
      let p = 1;
      while (p < n) p <<= 1;
      return p;
    }
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16]) {
      const entries = Array.from({ length: n }, (_, i) =>
        makeEntry(String(i), { weight: 50 + i * 3 })
      );
      const pairs = pairsFromEntries(entries);
      const expectedPairs = nextPow2(n) / 2;
      expect(pairs).toHaveLength(expectedPairs);
    }
  });
});

