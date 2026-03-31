/**
 * group-filter-sort.ts 単体テスト
 *
 * 試合決定数フィルタとフィルタに応じたソートのロジックを検証する。
 */
import { describe, it, expect } from "vitest";
import { buildFilterSortComparator, matchCountFilterPredicate } from "@/lib/group-filter-sort";
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

  it("フィルタなしの場合は氏名順", () => {
    const cmp = buildFilterSortComparator(noFilter);
    const sorted = [entryA, entryB, entryC].sort(cmp);
    // あいう < 山田 < 田中 (Japanese locale)
    expect(sorted.map((e) => e.id)).toEqual(["b", "a", "c"]);
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

  it("複数フィルタ設定時は年代→年齢→体重→身長の優先順", () => {
    // 同学年で年齢が違うケース
    const e1 = makeEntry({ id: "x", family_name: "X", age: 10, weight: 40, grade: "小4" });
    const e2 = makeEntry({ id: "y", family_name: "Y", age: 9, weight: 35, grade: "小4" });
    const e3 = makeEntry({ id: "z", family_name: "Z", age: 10, weight: 38, grade: "小3" });
    const cmp = buildFilterSortComparator({ ...noFilter, minGrade: "小3", maxGrade: "小4", minAge: "8" });
    const sorted = [e1, e2, e3].sort(cmp);
    // 小学3年(Z) first, then 小学4年 sorted by age: Y(9), X(10)
    expect(sorted.map((e) => e.id)).toEqual(["z", "y", "x"]);
  });

  it("null値は末尾に配置される", () => {
    const e1 = makeEntry({ id: "a", family_name: "A", weight: 60 });
    const e2 = makeEntry({ id: "b", family_name: "B", weight: null });
    const e3 = makeEntry({ id: "c", family_name: "C", weight: 50 });
    const cmp = buildFilterSortComparator({ ...noFilter, minWeight: "40" });
    const sorted = [e1, e2, e3].sort(cmp);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
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
