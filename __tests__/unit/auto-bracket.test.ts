/**
 * auto-bracket.ts 単体テスト
 *
 * 振り分けルールに基づくグループ分け・コート割り当てロジックを検証する
 */
import { describe, it, expect } from "vitest";
import { groupEntriesByRules, assignCourts, matchesRule, type AutoGroup } from "@/lib/auto-bracket";
import type { Entry, BracketRule } from "@/lib/types";

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

function makeRule(id: string, overrides?: Partial<BracketRule>): BracketRule {
  return {
    id,
    event_id: "ev-1",
    name: `ルール${id}`,
    rule_id: null,
    min_age: null,
    max_age: null,
    min_weight: null,
    max_weight: null,
    min_height: null,
    max_height: null,
    min_grade: null,
    max_grade: null,
    max_grade_diff: null,
    max_weight_diff: null,
    max_height_diff: null,
    sex_filter: null,
    court_num: null,
    sort_order: 0,
    created_at: "",
    ...overrides,
  };
}

describe("groupEntriesByRules", () => {
  it("ルールなし → 全員が未分類グループ", () => {
    const entries = [makeEntry("A"), makeEntry("B"), makeEntry("C")];
    const groups = groupEntriesByRules(entries, [], {});
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("未分類");
    expect(groups[0].entries).toHaveLength(3);
  });

  it("年齢範囲で振り分け", () => {
    const entries = [
      makeEntry("A", { age: 8 }),
      makeEntry("B", { age: 10 }),
      makeEntry("C", { age: 25 }),
      makeEntry("D", { age: 30 }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_age: 6, max_age: 12, sort_order: 0 }),
      makeRule("R2", { name: "大人", min_age: 18, max_age: null, sort_order: 1 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(2);

    const kids = groups.find((g) => g.name === "小学生");
    expect(kids).toBeTruthy();
    expect(kids!.entries.map((e) => e.id).sort()).toEqual(["A", "B"]);

    const adults = groups.find((g) => g.name === "大人");
    expect(adults).toBeTruthy();
    expect(adults!.entries.map((e) => e.id).sort()).toEqual(["C", "D"]);
  });

  it("体重範囲で振り分け", () => {
    const entries = [
      makeEntry("A", { weight: 30 }),
      makeEntry("B", { weight: 45 }),
      makeEntry("C", { weight: 70 }),
    ];
    const rules = [
      makeRule("R1", { name: "軽量級", min_weight: null, max_weight: 50, sort_order: 0 }),
      makeRule("R2", { name: "重量級", min_weight: 50, max_weight: null, sort_order: 1 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(2);

    const light = groups.find((g) => g.name === "軽量級");
    expect(light!.entries.map((e) => e.id).sort()).toEqual(["A", "B"]);

    const heavy = groups.find((g) => g.name === "重量級");
    expect(heavy!.entries.map((e) => e.id)).toEqual(["C"]);
  });

  it("性別で振り分け", () => {
    const entries = [
      makeEntry("A", { sex: "male" }),
      makeEntry("B", { sex: "female" }),
      makeEntry("C", { sex: "male" }),
    ];
    const rules = [
      makeRule("R1", { name: "男子", sex_filter: "male", sort_order: 0 }),
      makeRule("R2", { name: "女子", sex_filter: "female", sort_order: 1 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(2);

    const male = groups.find((g) => g.name === "男子");
    expect(male!.entries).toHaveLength(2);
    const female = groups.find((g) => g.name === "女子");
    expect(female!.entries).toHaveLength(1);
  });

  it("競技ルールIDで振り分け", () => {
    const entries = [makeEntry("A"), makeEntry("B"), makeEntry("C")];
    const entryRuleIds: Record<string, Set<string>> = {
      A: new Set(["rule-kata"]),
      B: new Set(["rule-kumite"]),
      C: new Set(["rule-kata", "rule-kumite"]),
    };
    const rules = [
      makeRule("R1", { name: "形", rule_id: "rule-kata", sort_order: 0 }),
      makeRule("R2", { name: "組手", rule_id: "rule-kumite", sort_order: 1 }),
    ];
    const groups = groupEntriesByRules(entries, rules, entryRuleIds);

    const kata = groups.find((g) => g.name === "形");
    // A, C は形にマッチ（sort_order=0 が先に処理されるので A, C が先に取られる）
    expect(kata!.entries.map((e) => e.id).sort()).toEqual(["A", "C"]);

    const kumite = groups.find((g) => g.name === "組手");
    // B のみ（Cは形で割当済み）
    expect(kumite!.entries.map((e) => e.id)).toEqual(["B"]);
  });

  it("sort_order 順に処理される（先に処理されたルールが優先）", () => {
    const entries = [
      makeEntry("A", { age: 10, weight: 30 }),
    ];
    const rules = [
      makeRule("R1", { name: "ルール1", min_age: 8, max_age: 12, sort_order: 0 }),
      makeRule("R2", { name: "ルール2", min_weight: 20, max_weight: 40, sort_order: 1 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    // sort_order=0 のルール1が先に処理されるのでAはルール1に入る
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("ルール1");
  });

  it("どのルールにも合致しない選手が未分類になる", () => {
    const entries = [
      makeEntry("A", { age: 10 }),
      makeEntry("B", { age: 15 }), // 13-17歳のルールがないので未分類
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_age: 6, max_age: 12, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("小学生");
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[1].name).toBe("未分類");
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[1].entries[0].id).toBe("B");
  });

  it("学年差制限でサブグループに分割される", () => {
    const entries = [
      makeEntry("A", { grade: "小1" }),
      makeEntry("B", { grade: "小2" }),
      makeEntry("C", { grade: "小5" }),
      makeEntry("D", { grade: "小6" }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_age: null, max_age: null, max_grade_diff: 1, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    // 小1,小2 は学年差1以内 → グループ1
    // 小5,小6 は学年差1以内 → グループ2
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("小学生（1）");
    expect(groups[0].entries.map((e) => e.id).sort()).toEqual(["A", "B"]);
    expect(groups[1].name).toBe("小学生（2）");
    expect(groups[1].entries.map((e) => e.id).sort()).toEqual(["C", "D"]);
  });

  it("年代範囲（min_grade/max_grade）で振り分け", () => {
    const entries = [
      makeEntry("A", { grade: "小1" }),
      makeEntry("B", { grade: "小3" }),
      makeEntry("C", { grade: "小5" }),
      makeEntry("D", { grade: "中1" }),
    ];
    const rules = [
      makeRule("R1", { name: "小学低学年", min_grade: "小1", max_grade: "小3", sort_order: 0 }),
      makeRule("R2", { name: "小学高学年", min_grade: "小4", max_grade: "小6", sort_order: 1 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(3); // 低学年, 高学年, 未分類(中1)

    const low = groups.find((g) => g.name === "小学低学年");
    expect(low).toBeTruthy();
    expect(low!.entries.map((e) => e.id).sort()).toEqual(["A", "B"]);

    const high = groups.find((g) => g.name === "小学高学年");
    expect(high).toBeTruthy();
    expect(high!.entries.map((e) => e.id)).toEqual(["C"]);

    const unmatched = groups.find((g) => g.name === "未分類");
    expect(unmatched).toBeTruthy();
    expect(unmatched!.entries.map((e) => e.id)).toEqual(["D"]);
  });

  it("年代範囲: gradeがnullの選手はマッチしない", () => {
    const entries = [
      makeEntry("A", { grade: "小2" }),
      makeEntry("B", { grade: null }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_grade: "小1", max_grade: "小6", sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(2); // 小学生, 未分類
    expect(groups[0].name).toBe("小学生");
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].entries[0].id).toBe("A");
    expect(groups[1].name).toBe("未分類");
    expect(groups[1].entries[0].id).toBe("B");
  });

  it("年代範囲: min_gradeのみ指定（下限のみ）", () => {
    const entries = [
      makeEntry("A", { grade: "小3" }),
      makeEntry("B", { grade: "中2" }),
    ];
    const rules = [
      makeRule("R1", { name: "小4以上", min_grade: "小4", max_grade: null, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    // 小3は小4未満なのでマッチしない、中2(=8)は小4(=4)以上なのでマッチ
    const matched = groups.find((g) => g.name === "小4以上");
    expect(matched).toBeTruthy();
    expect(matched!.entries.map((e) => e.id)).toEqual(["B"]);
  });

  it("年代範囲 + 学年差制限の組み合わせ", () => {
    const entries = [
      makeEntry("A", { grade: "小1" }),
      makeEntry("B", { grade: "小2" }),
      makeEntry("C", { grade: "小5" }),
      makeEntry("D", { grade: "小6" }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_grade: "小1", max_grade: "小6", max_grade_diff: 1, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    // 4人が年代範囲にマッチし、学年差1でサブグループ分割
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("小学生（1）");
    expect(groups[0].entries.map((e) => e.id).sort()).toEqual(["A", "B"]);
    expect(groups[1].name).toBe("小学生（2）");
    expect(groups[1].entries.map((e) => e.id).sort()).toEqual(["C", "D"]);
  });

  it("複合条件（年齢＋性別＋体重）", () => {
    const entries = [
      makeEntry("A", { age: 10, sex: "male", weight: 30 }),
      makeEntry("B", { age: 10, sex: "female", weight: 30 }),
      makeEntry("C", { age: 25, sex: "male", weight: 70 }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生男子", min_age: 6, max_age: 12, sex_filter: "male", sort_order: 0 }),
      makeRule("R2", { name: "小学生女子", min_age: 6, max_age: 12, sex_filter: "female", sort_order: 1 }),
      makeRule("R3", { name: "一般", min_age: 18, max_age: null, sort_order: 2 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.name === "小学生男子")!.entries[0].id).toBe("A");
    expect(groups.find((g) => g.name === "小学生女子")!.entries[0].id).toBe("B");
    expect(groups.find((g) => g.name === "一般")!.entries[0].id).toBe("C");
  });

  it("maxWeightDiff / maxHeightDiff がグループに引き継がれる", () => {
    const entries = [makeEntry("A", { age: 10 })];
    const rules = [
      makeRule("R1", { name: "テスト", min_age: 6, max_age: 12, max_weight_diff: 5, max_height_diff: 10, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups[0].maxWeightDiff).toBe(5);
    expect(groups[0].maxHeightDiff).toBe(10);
  });

  it("courtNum がグループに引き継がれる", () => {
    const entries = [makeEntry("A", { age: 10 })];
    const rules = [
      makeRule("R1", { name: "テスト", min_age: 6, max_age: 12, court_num: 2, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups[0].courtNum).toBe(2);
  });

  it("各グループにペアが生成される", () => {
    const entries = [
      makeEntry("A", { age: 10, weight: 30 }),
      makeEntry("B", { age: 10, weight: 35 }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_age: 6, max_age: 12, sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, {});
    expect(groups[0].pairs).toHaveLength(1);
    expect(groups[0].pairs[0].e1).toBeTruthy();
    expect(groups[0].pairs[0].e2).toBeTruthy();
  });
});

describe("matchesRule — 数値学年ルール vs 年齢区分エントリー", () => {
  it("10歳・一般は小1-小6ルールにマッチする", () => {
    const entry = makeEntry("e1", { grade: "一般", age: 10 });
    const rule = makeRule("R1", { min_grade: "小1", max_grade: "小6" });
    expect(matchesRule(entry, rule, { "e1": new Set() })).toBe(true);
  });

  it("25歳・一般は小1-小6ルールにマッチしない", () => {
    const entry = makeEntry("e2", { grade: "一般", age: 25 });
    const rule = makeRule("R1", { min_grade: "小1", max_grade: "小6" });
    expect(matchesRule(entry, rule, { "e2": new Set() })).toBe(false);
  });

  it("5歳・一般は小1-小6ルールにマッチしない（下限未満）", () => {
    const entry = makeEntry("e3", { grade: "一般", age: 5 });
    const rule = makeRule("R1", { min_grade: "小1", max_grade: "小6" });
    expect(matchesRule(entry, rule, { "e3": new Set() })).toBe(false);
  });

  it("groupEntriesByRules 経由でも正しく分類される", () => {
    const entries = [
      makeEntry("e1", { grade: "一般", age: 10 }),
      makeEntry("e2", { grade: "一般", age: 25 }),
    ];
    const rules = [
      makeRule("R1", { name: "小学生", min_grade: "小1", max_grade: "小6", sort_order: 0 }),
    ];
    const groups = groupEntriesByRules(entries, rules, { "e1": new Set(), "e2": new Set() });
    const matched = groups.find((g) => g.name === "小学生");
    expect(matched).toBeDefined();
    expect(matched!.entries.some((e) => e.id === "e1")).toBe(true);
    expect(matched!.entries.some((e) => e.id === "e2")).toBe(false);
  });
});

describe("assignCourts", () => {
  function makeGroup(overrides?: Partial<AutoGroup>): AutoGroup {
    return {
      id: crypto.randomUUID(),
      name: "テスト",
      ruleId: null,
      courtNum: null,
      entries: [],
      pairs: [],
      maxWeightDiff: null,
      maxHeightDiff: null,
      ...overrides,
    };
  }

  it("固定コートのグループはそのまま", () => {
    const groups = [
      makeGroup({ name: "A", courtNum: 1, pairs: Array(3).fill({}) as AutoGroup["pairs"] }),
      makeGroup({ name: "B", courtNum: 2, pairs: Array(3).fill({}) as AutoGroup["pairs"] }),
    ];
    const result = assignCourts(groups, 2);
    expect(result.find((g) => g.name === "A")!.courtNum).toBe(1);
    expect(result.find((g) => g.name === "B")!.courtNum).toBe(2);
  });

  it("courtNum=null のグループは試合数最小のコートに割り当て", () => {
    const groups = [
      makeGroup({ name: "A", courtNum: 1, pairs: Array(5).fill({}) as AutoGroup["pairs"] }),
      makeGroup({ name: "B", courtNum: null, pairs: Array(3).fill({}) as AutoGroup["pairs"] }),
    ];
    const result = assignCourts(groups, 2);
    // コート1は5試合、コート2は0試合 → Bはコート2に
    expect(result.find((g) => g.name === "B")!.courtNum).toBe(2);
  });

  it("複数の flexible グループがバランスよく分散", () => {
    const groups = [
      makeGroup({ name: "A", courtNum: null, pairs: Array(4).fill({}) as AutoGroup["pairs"] }),
      makeGroup({ name: "B", courtNum: null, pairs: Array(3).fill({}) as AutoGroup["pairs"] }),
      makeGroup({ name: "C", courtNum: null, pairs: Array(2).fill({}) as AutoGroup["pairs"] }),
    ];
    const result = assignCourts(groups, 2);
    // A(4) → コート1(4), B(3) → コート2(3), C(2) → コート2? いや、コート2=3 > コート1=4ではないので...
    // A(4) → コート1(0→4), B(3) → コート2(0→3), C(2) → コート2(3→5)? いや min は コート2=3 < コート1=4なので C→コート2
    // 実際: A→コート1(4), B→コート2(3), C→コート2(3+2=5)
    // → コート1=4, コート2=5 ではなく正しくは A→1(4), B→2(3), C→2(5)
    // でも本来は C→コート1(4+2=6) vs コート2=3 のどちらか。min(4,3)=3なのでコート2に行く
    const court1Count = result.filter((g) => g.courtNum === 1).reduce((s, g) => s + g.pairs.length, 0);
    const court2Count = result.filter((g) => g.courtNum === 2).reduce((s, g) => s + g.pairs.length, 0);
    expect(court1Count).toBe(4);
    expect(court2Count).toBe(5);
  });

  it("courtCount=0 の場合はそのまま返す", () => {
    const groups = [makeGroup({ name: "A" })];
    const result = assignCourts(groups, 0);
    expect(result).toEqual(groups);
  });
});
