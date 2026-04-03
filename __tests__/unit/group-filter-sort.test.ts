/**
 * group-filter-sort.ts 単体テスト
 *
 * 試合決定数フィルタとフィルタに応じたソートのロジックを検証する。
 */
import { describe, it, expect } from "vitest";
import { buildFilterSortComparator, matchCountFilterPredicate, gradeFilterPredicate } from "@/lib/group-filter-sort";
import type { AgeCategory } from "@/lib/grade-options";
import type { Entry } from "@/lib/types";

// ── ヘルパー: 最小限の Entry を作る ──

function makeEntry(overrides: Partial<Entry> & { id: string; family_name: string }): Entry {
  return {
    event_id: "evt1",
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
    fighter_id: null,
    email: null,
    phone: null,
    guardian_name: null,
    emergency_phone: null,
    is_test: false,
    custom_fields: null,
    created_at: "2026-01-01",
    submitted_at: null,
    ...overrides,
  } as Entry;
}

// ── matchCountFilterPredicate ──

describe("matchCountFilterPredicate", () => {
  const entries = [
    makeEntry({ id: "a", family_name: "山田" }),
    makeEntry({ id: "b", family_name: "田中" }),
    makeEntry({ id: "c", family_name: "鈴木" }),
  ];

  const getTotalMatchCount = (e: Entry) => {
    if (e.id === "a") return 1; // 1/3 = 未達
    if (e.id === "b") return 2; // 2/2 = 達成
    return 0; // 0/1 = 未達
  };
  const getDesiredMatchCount = (e: Entry) => {
    if (e.id === "a") return 3;
    if (e.id === "b") return 2;
    return 1;
  };

  it('空文字の場合は全選手を返す', () => {
    const pred = matchCountFilterPredicate("", getTotalMatchCount, getDesiredMatchCount);
    const result = entries.filter(pred);
    expect(result).toHaveLength(3);
  });

  it('"unmet" で希望試合数に達していない選手のみ返す', () => {
    const pred = matchCountFilterPredicate("unmet", getTotalMatchCount, getDesiredMatchCount);
    const result = entries.filter(pred);
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it('"0" で0試合の選手のみ返す', () => {
    const pred = matchCountFilterPredicate("0", getTotalMatchCount, getDesiredMatchCount);
    const result = entries.filter(pred);
    expect(result.map((e) => e.id)).toEqual(["c"]);
  });

  it('"1" で1試合の選手のみ返す', () => {
    const pred = matchCountFilterPredicate("1", getTotalMatchCount, getDesiredMatchCount);
    const result = entries.filter(pred);
    expect(result.map((e) => e.id)).toEqual(["a"]);
  });

  it('"2" で2試合の選手のみ返す', () => {
    const pred = matchCountFilterPredicate("2", getTotalMatchCount, getDesiredMatchCount);
    const result = entries.filter(pred);
    expect(result.map((e) => e.id)).toEqual(["b"]);
  });

  it('"5" で該当なしの場合は空配列', () => {
    const pred = matchCountFilterPredicate("5", getTotalMatchCount, getDesiredMatchCount);
    const result = entries.filter(pred);
    expect(result).toHaveLength(0);
  });
});

// ── buildFilterSortComparator ──

describe("buildFilterSortComparator", () => {
  const noFilter = { minGrade: "", maxGrade: "", minAge: "", maxAge: "", minWeight: "", maxWeight: "", minHeight: "", maxHeight: "" };

  const entryA = makeEntry({ id: "a", family_name: "山田", age: 25, weight: 70, height: 170, grade: "小1" });
  const entryB = makeEntry({ id: "b", family_name: "あいう", age: 20, weight: 60, height: 180, grade: "小3" });
  const entryC = makeEntry({ id: "c", family_name: "田中", age: 30, weight: 80, height: 160, grade: "小2" });

  it("フィルタなしの場合は年齢昇順", () => {
    // 氏名順だと あいう(30) < 山田(25) < 田中(20) になるが、年齢順を期待
    const young = makeEntry({ id: "y", family_name: "田中", age: 20, weight: 70, height: 170, grade: "小1" });
    const mid = makeEntry({ id: "m", family_name: "山田", age: 25, weight: 60, height: 180, grade: "小3" });
    const old = makeEntry({ id: "o", family_name: "あいう", age: 30, weight: 80, height: 160, grade: "小2" });
    const cmp = buildFilterSortComparator(noFilter);
    const sorted = [old, young, mid].sort(cmp);
    expect(sorted.map((e) => e.age)).toEqual([20, 25, 30]);
  });

  it("フィルタなしで年齢が同じ場合は氏名順", () => {
    const e1 = makeEntry({ id: "x", family_name: "山田", age: 25 });
    const e2 = makeEntry({ id: "y", family_name: "あいう", age: 25 });
    const cmp = buildFilterSortComparator(noFilter);
    const sorted = [e1, e2].sort(cmp);
    expect(sorted.map((e) => e.id)).toEqual(["y", "x"]);
  });

  it("年齢フィルタ設定時は年齢順", () => {
    const cmp = buildFilterSortComparator({ ...noFilter, minAge: "18" });
    const sorted = [entryA, entryB, entryC].sort(cmp);
    expect(sorted.map((e) => e.age)).toEqual([20, 25, 30]);
  });

  it("体重フィルタ設定時は体重順", () => {
    const cmp = buildFilterSortComparator({ ...noFilter, minWeight: "50" });
    const sorted = [entryA, entryB, entryC].sort(cmp);
    expect(sorted.map((e) => e.weight)).toEqual([60, 70, 80]);
  });

  it("身長フィルタ設定時は身長順", () => {
    const cmp = buildFilterSortComparator({ ...noFilter, maxHeight: "200" });
    const sorted = [entryA, entryB, entryC].sort(cmp);
    expect(sorted.map((e) => e.height)).toEqual([160, 170, 180]);
  });

  it("年代フィルタ設定時は学年順（gradeToNumber）", () => {
    const cmp = buildFilterSortComparator({ ...noFilter, minGrade: "小1" });
    const sorted = [entryA, entryB, entryC].sort(cmp);
    // 小1=1, 小2=2, 小3=3
    expect(sorted.map((e) => e.grade)).toEqual(["小1", "小2", "小3"]);
  });

  it("複数フィルタ設定時は体重→年齢→年代→身長の優先順", () => {
    // 年齢フィルタ+年代フィルタ → 年齢が先に適用される
    const e1 = makeEntry({ id: "x", family_name: "X", age: 10, weight: 40, grade: "小4" });
    const e2 = makeEntry({ id: "y", family_name: "Y", age: 9, weight: 35, grade: "小4" });
    const e3 = makeEntry({ id: "z", family_name: "Z", age: 10, weight: 38, grade: "小3" });
    const cmp = buildFilterSortComparator({ ...noFilter, minGrade: "小3", maxGrade: "小4", minAge: "8" });
    const sorted = [e1, e2, e3].sort(cmp);
    // 年齢順: Y(9), then X(10) and Z(10) are same age → 年代順: Z(小3), X(小4)
    expect(sorted.map((e) => e.id)).toEqual(["y", "z", "x"]);
  });

  it("null値は末尾に配置される", () => {
    const e1 = makeEntry({ id: "a", family_name: "A", weight: 60 });
    const e2 = makeEntry({ id: "b", family_name: "B", weight: null });
    const e3 = makeEntry({ id: "c", family_name: "C", weight: 50 });
    const cmp = buildFilterSortComparator({ ...noFilter, minWeight: "40" });
    const sorted = [e1, e2, e3].sort(cmp);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("体重+年齢フィルタ同時設定時は体重が優先される", () => {
    const light = makeEntry({ id: "l", family_name: "L", age: 30, weight: 55 });
    const heavy = makeEntry({ id: "h", family_name: "H", age: 20, weight: 75 });
    const mid = makeEntry({ id: "m", family_name: "M", age: 25, weight: 65 });
    const cmp = buildFilterSortComparator({ ...noFilter, minWeight: "50", minAge: "18" });
    const sorted = [heavy, light, mid].sort(cmp);
    // 体重順: 55, 65, 75（年齢順なら 20, 25, 30）
    expect(sorted.map((e) => e.weight)).toEqual([55, 65, 75]);
  });

  it("age が null のエントリーはデフォルトソートで末尾", () => {
    const withAge = makeEntry({ id: "a", family_name: "A", age: 25 });
    const noAge = makeEntry({ id: "b", family_name: "B", age: null });
    const cmp = buildFilterSortComparator(noFilter);
    const sorted = [noAge, withAge].sort(cmp);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("weight が null のエントリーは体重ソートで末尾", () => {
    const withWeight = makeEntry({ id: "a", family_name: "A", weight: 60 });
    const noWeight = makeEntry({ id: "b", family_name: "B", weight: null });
    const cmp = buildFilterSortComparator({ ...noFilter, minWeight: "50" });
    const sorted = [noWeight, withWeight].sort(cmp);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("元の配列を変異させない", () => {
    const entries = [entryC, entryA, entryB];
    const original = [...entries];
    const cmp = buildFilterSortComparator({ ...noFilter, minAge: "18" });
    const sorted = [...entries].sort(cmp);
    expect(entries).toEqual(original);
    expect(sorted).not.toEqual(entries);
  });
});

// ── gradeFilterPredicate ──

describe("gradeFilterPredicate", () => {
  const ageCategories: AgeCategory[] = [
    { label: "16歳未満", minAge: 0, maxAge: 15 },
    { label: "一般", minAge: 19, maxAge: 44 },
    { label: "シニア", minAge: 45, maxAge: null },
  ];

  // 学年ベースのエントリー
  const child = makeEntry({ id: "child", family_name: "子供", grade: "小3", age: 9 });
  const teen = makeEntry({ id: "teen", family_name: "中学", grade: "中2", age: 14 });
  // 年齢ベースのエントリー
  const adult = makeEntry({ id: "adult", family_name: "大人", grade: "一般", age: 30 });
  const senior = makeEntry({ id: "senior", family_name: "年配", grade: "シニア", age: 60 });
  // 年齢なしのエントリー
  const noAge = makeEntry({ id: "noage", family_name: "不明", grade: "一般", age: null });

  describe("年齢ベース区分でフィルタ", () => {
    it("下限に「一般」→ age >= 19 の選手のみ通過", () => {
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      expect(pred(child)).toBe(false);   // age 9 < 19
      expect(pred(teen)).toBe(false);    // age 14 < 19
      expect(pred(adult)).toBe(true);    // age 30 >= 19
      expect(pred(senior)).toBe(true);   // age 60 >= 19
    });

    it("上限に「一般」→ age <= 44 の選手のみ通過", () => {
      const pred = gradeFilterPredicate("", "一般", ageCategories);
      expect(pred(child)).toBe(true);    // age 9 <= 44
      expect(pred(adult)).toBe(true);    // age 30 <= 44
      expect(pred(senior)).toBe(false);  // age 60 > 44
    });

    it("下限「一般」上限「一般」→ 19 <= age <= 44", () => {
      const pred = gradeFilterPredicate("一般", "一般", ageCategories);
      expect(pred(child)).toBe(false);
      expect(pred(adult)).toBe(true);
      expect(pred(senior)).toBe(false);
    });

    it("年齢がnullの場合は除外", () => {
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      expect(pred(noAge)).toBe(false);
    });
  });

  describe("学年ベースでフィルタ", () => {
    it("下限「小1」上限「小6」→ 学年が範囲内の選手のみ通過", () => {
      const pred = gradeFilterPredicate("小1", "小6", ageCategories);
      expect(pred(child)).toBe(true);   // 小3 → gradeToNumber=3, range 1-6
      expect(pred(teen)).toBe(false);   // 中2 → gradeToNumber=8, > 6
    });

    it("学年ベースフィルタで年齢ベース区分のエントリーは除外されない", () => {
      const pred = gradeFilterPredicate("年少", "", ageCategories);
      expect(pred(child)).toBe(true);   // 小3: 学年ベース、範囲内
      expect(pred(adult)).toBe(true);   // 一般: 年齢ベース区分 → 通過
      expect(pred(senior)).toBe(true);  // シニア: 年齢ベース区分 → 通過
    });
  });

  describe("学年エントリーに年齢ベースフィルタ", () => {
    it("学年エントリーでもageで比較される", () => {
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      // child: grade=小3, age=9 → 9 < 19 → false
      expect(pred(child)).toBe(false);
      // adult: grade=一般, age=30 → 30 >= 19 → true
      expect(pred(adult)).toBe(true);
    });

    it("年齢ベースフィルタで学年エントリーの age が null の場合は除外", () => {
      const noAgeChild = makeEntry({ id: "nac", family_name: "不明", grade: "小3", age: null });
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      expect(pred(noAgeChild)).toBe(false);
    });
  });

  describe("混合フィルタ（学年+年齢ベース）", () => {
    it("下限=学年, 上限=年齢ベース（年少〜シニア）→ 全員通過", () => {
      const pred = gradeFilterPredicate("年少", "シニア", ageCategories);
      expect(pred(child)).toBe(true);   // age 9, シニアの maxAge=null なので通過
      expect(pred(teen)).toBe(true);    // age 14
      expect(pred(adult)).toBe(true);   // age 30
      expect(pred(senior)).toBe(true);  // age 60
    });

    it("下限=学年, 上限=一般 → age <= 44 のみ通過", () => {
      const pred = gradeFilterPredicate("年少", "一般", ageCategories);
      expect(pred(child)).toBe(true);   // age 9 <= 44
      expect(pred(adult)).toBe(true);   // age 30 <= 44
      expect(pred(senior)).toBe(false); // age 60 > 44
    });
  });

  describe("上限のみ設定", () => {
    it("上限=学年ベース（高3）→ 学年が高3以下のみ通過、年齢ベース区分は概算年齢で判定", () => {
      const pred = gradeFilterPredicate("", "高3", ageCategories);
      expect(pred(child)).toBe(true);   // 小3=3 <= 高3=12
      expect(pred(teen)).toBe(true);    // 中2=8 <= 12
      // 高3=12 → 概算上限18歳。一般(age=30)・シニア(age=60)は18超なので除外
      expect(pred(adult)).toBe(false);
      expect(pred(senior)).toBe(false);
    });

    it("上限=学年ベース（高3）→ 概算年齢以下の年齢ベース区分は通過", () => {
      // 16歳未満カテゴリで age=15 → 概算上限18歳以下なので通過
      const youngAdult = makeEntry({ id: "ya", family_name: "若者", grade: "16歳未満", age: 15 });
      const pred = gradeFilterPredicate("", "高3", ageCategories);
      expect(pred(youngAdult)).toBe(true);
    });

    it("上限=シニア（maxAge: null）→ 全員通過", () => {
      const pred = gradeFilterPredicate("", "シニア", ageCategories);
      expect(pred(child)).toBe(true);
      expect(pred(teen)).toBe(true);
      expect(pred(adult)).toBe(true);
      expect(pred(senior)).toBe(true);
    });
  });

  describe("エッジケース", () => {
    it("grade が null のエントリーは学年フィルタで除外", () => {
      const noGrade = makeEntry({ id: "ng", family_name: "不明", grade: null, age: 25 });
      const pred = gradeFilterPredicate("小1", "", ageCategories);
      expect(pred(noGrade)).toBe(false);
    });

    it("grade が null のエントリーは年齢ベースフィルタで age があれば比較", () => {
      const noGrade = makeEntry({ id: "ng", family_name: "不明", grade: null, age: 25 });
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      // hasAgeCategoryFilter=true, age=25 >= 19 → true
      expect(pred(noGrade)).toBe(true);
    });

    it("ageCategories が undefined でも学年ベースフィルタは動作する", () => {
      const pred = gradeFilterPredicate("小1", "小6", undefined);
      expect(pred(child)).toBe(true);
      expect(pred(teen)).toBe(false);
    });

    it("境界値: age が minAge と一致 → 通過", () => {
      const boundary = makeEntry({ id: "b", family_name: "B", grade: "一般", age: 19 });
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      expect(pred(boundary)).toBe(true);
    });

    it("境界値: age が maxAge と一致 → 通過", () => {
      const boundary = makeEntry({ id: "b", family_name: "B", grade: "一般", age: 44 });
      const pred = gradeFilterPredicate("", "一般", ageCategories);
      expect(pred(boundary)).toBe(true);
    });

    it("境界値: age が minAge - 1 → 除外", () => {
      const belowMin = makeEntry({ id: "b", family_name: "B", grade: "一般", age: 18 });
      const pred = gradeFilterPredicate("一般", "", ageCategories);
      expect(pred(belowMin)).toBe(false);
    });

    it("境界値: age が maxAge + 1 → 除外", () => {
      const aboveMax = makeEntry({ id: "b", family_name: "B", grade: "一般", age: 45 });
      const pred = gradeFilterPredicate("", "一般", ageCategories);
      expect(pred(aboveMax)).toBe(false);
    });
  });
});
