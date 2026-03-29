/**
 * lib/suggestions.ts 単体テスト
 *
 * computeSuggestions / computeBalance の検証
 */
import { describe, it, expect } from "vitest";
import { computeSuggestions, computeBalance, type SplitSuggestion } from "@/lib/suggestions";
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

describe("computeBalance", () => {
  it("差が1以下なら◎を返す", () => {
    expect(computeBalance(5, 5)).toBe("◎");
    expect(computeBalance(4, 5)).toBe("◎");
  });

  it("差が中程度なら△を返す", () => {
    expect(computeBalance(3, 5)).toBe("△");
  });

  it("差が大きいなら✕を返す", () => {
    expect(computeBalance(1, 10)).toBe("✕");
  });
});

describe("computeSuggestions", () => {
  it("空の配列に対して空を返す", () => {
    expect(computeSuggestions([])).toEqual([]);
  });

  it("選手1名の場合は提案なし", () => {
    const entries = [makeEntry("1", { weight: 60 })];
    expect(computeSuggestions(entries)).toEqual([]);
  });

  it("体重が異なる2名の場合、体重で分割提案を返す", () => {
    const entries = [
      makeEntry("1", { weight: 40 }),
      makeEntry("2", { weight: 70 }),
    ];
    const suggestions = computeSuggestions(entries);
    expect(suggestions.length).toBeGreaterThan(0);
    const weightSuggestion = suggestions.find(s => s.axis === "weight");
    expect(weightSuggestion).toBeDefined();
    expect(weightSuggestion!.belowCount).toBeGreaterThan(0);
    expect(weightSuggestion!.aboveCount).toBeGreaterThan(0);
  });

  it("年齢が異なる選手の場合、年齢で分割提案を返す", () => {
    const entries = [
      makeEntry("1", { age: 10 }),
      makeEntry("2", { age: 30 }),
    ];
    const suggestions = computeSuggestions(entries);
    const ageSuggestion = suggestions.find(s => s.axis === "age");
    expect(ageSuggestion).toBeDefined();
  });

  it("性別が混在する場合、性別分割提案を返す", () => {
    const entries = [
      makeEntry("1", { sex: "male" }),
      makeEntry("2", { sex: "female" }),
    ];
    const suggestions = computeSuggestions(entries);
    const sexSuggestion = suggestions.find(s => s.axis === "sex");
    expect(sexSuggestion).toBeDefined();
    expect(sexSuggestion!.belowLabel).toBe("男子");
    expect(sexSuggestion!.aboveLabel).toBe("女子");
  });

  it("欠場選手は除外される", () => {
    const entries = [
      makeEntry("1", { weight: 40 }),
      makeEntry("2", { weight: 70, is_withdrawn: true }),
    ];
    const suggestions = computeSuggestions(entries);
    expect(suggestions).toEqual([]);
  });

  it("バランスが良い提案が優先的にソートされる", () => {
    const entries = [
      makeEntry("1", { weight: 40, age: 10 }),
      makeEntry("2", { weight: 55, age: 10 }),
      makeEntry("3", { weight: 60, age: 25 }),
      makeEntry("4", { weight: 80, age: 25 }),
    ];
    const suggestions = computeSuggestions(entries);
    if (suggestions.length >= 2) {
      const order = { "◎": 0, "△": 1, "✕": 2 };
      for (let i = 1; i < suggestions.length; i++) {
        expect(order[suggestions[i].balance]).toBeGreaterThanOrEqual(order[suggestions[i - 1].balance]);
      }
    }
  });

  it("最大8件まで返す", () => {
    // 多数の年齢・体重バリエーションがある選手
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry(String(i), { weight: 30 + i * 3, age: 10 + i * 2, height: 140 + i * 2 })
    );
    const suggestions = computeSuggestions(entries);
    expect(suggestions.length).toBeLessThanOrEqual(8);
  });

  it("身長で分割提案を返す", () => {
    const entries = [
      makeEntry("1", { height: 150 }),
      makeEntry("2", { height: 180 }),
    ];
    const suggestions = computeSuggestions(entries);
    const heightSuggestion = suggestions.find(s => s.axis === "height");
    expect(heightSuggestion).toBeDefined();
  });

  it("経験年数で分割提案を返す", () => {
    const entries = [
      makeEntry("1", { experience: "2年" }),
      makeEntry("2", { experience: "8年" }),
    ];
    const suggestions = computeSuggestions(entries);
    const expSuggestion = suggestions.find(s => s.axis === "experience");
    expect(expSuggestion).toBeDefined();
  });
});
