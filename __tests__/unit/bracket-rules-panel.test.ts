import { describe, it, expect } from "vitest";
import { toFormState } from "@/components/bracket-rules-panel";
import type { BracketRule } from "@/lib/types";

function makeBracketRule(overrides: Partial<BracketRule> = {}): BracketRule {
  return {
    id: "br-1",
    event_id: "ev-1",
    name: "小学生軽量級",
    rule_id: "rule-1",
    min_age: 6,
    max_age: 12,
    min_weight: 20,
    max_weight: 40,
    min_height: 100,
    max_height: 150,
    min_grade: "小1",
    max_grade: "小6",
    max_grade_diff: 1,
    max_weight_diff: 10,
    max_height_diff: 15,
    sex_filter: "male",
    court_num: 2,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("toFormState", () => {
  it("全フィールドが正しく文字列に変換される", () => {
    const rule = makeBracketRule();
    const form = toFormState(rule);
    expect(form).toEqual({
      name: "小学生軽量級",
      rule_id: "rule-1",
      min_age: "6",
      max_age: "12",
      min_weight: "20",
      max_weight: "40",
      min_height: "100",
      max_height: "150",
      min_grade: "小1",
      max_grade: "小6",
      max_grade_diff: "1",
      max_weight_diff: "10",
      max_height_diff: "15",
      sex_filter: "male",
      court_num: "2",
    });
  });

  it("null フィールドは空文字列になる", () => {
    const rule = makeBracketRule({
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
    });
    const form = toFormState(rule);
    expect(form.rule_id).toBe("");
    expect(form.min_age).toBe("");
    expect(form.max_age).toBe("");
    expect(form.min_grade).toBe("");
    expect(form.max_grade).toBe("");
    expect(form.min_weight).toBe("");
    expect(form.max_weight).toBe("");
    expect(form.min_height).toBe("");
    expect(form.max_height).toBe("");
    expect(form.max_grade_diff).toBe("");
    expect(form.max_weight_diff).toBe("");
    expect(form.max_height_diff).toBe("");
    expect(form.sex_filter).toBe("");
    expect(form.court_num).toBe("");
  });

  it("複製時: toFormState の結果に名前を加工して新規作成用フォームを作れる", () => {
    const rule = makeBracketRule({ name: "中学生重量級" });
    const form = toFormState(rule);
    const duplicated = { ...form, name: rule.name + "（コピー）" };
    expect(duplicated.name).toBe("中学生重量級（コピー）");
    // 他のフィールドは元のまま
    expect(duplicated.min_age).toBe("6");
    expect(duplicated.sex_filter).toBe("male");
  });
});
