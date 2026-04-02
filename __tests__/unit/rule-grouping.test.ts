/**
 * rule-grouping.ts 単体テスト
 *
 * ルール絞込時のフラット表示と、絞込なし時のルール別グルーピングを検証する。
 */
import { describe, it, expect } from "vitest";
import { buildRuleGroups } from "@/lib/rule-grouping";
import type { Entry, Rule } from "@/lib/types";

function makeEntry(id: string, name: string): Entry {
  return {
    id,
    event_id: "evt1",
    family_name: name,
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
  } as Entry;
}

function makeRule(id: string, name: string): Rule {
  return { id, name, description: null, event_id: null } as Rule;
}

const ruleA = makeRule("ruleA", "RFビギナー");
const ruleB = makeRule("ruleB", "RF一般エキスパートA");
const ruleC = makeRule("ruleC", "RFJr.エキスパート");

const e1 = makeEntry("e1", "山田");   // ruleA only
const e2 = makeEntry("e2", "田中");   // ruleA + ruleB (ダブルエントリー)
const e3 = makeEntry("e3", "鈴木");   // ruleB only
const e4 = makeEntry("e4", "井上");   // ruleC only
const e5 = makeEntry("e5", "加藤");   // no rules

const entryRuleIds: Record<string, Set<string>> = {
  e1: new Set(["ruleA"]),
  e2: new Set(["ruleA", "ruleB"]),
  e3: new Set(["ruleB"]),
  e4: new Set(["ruleC"]),
};

const allEntries = [e1, e2, e3, e4, e5];
const allRules = [ruleA, ruleB, ruleC];
const getDesired = () => 1;

describe("buildRuleGroups", () => {
  describe("ルール絞込なし（defaultRuleId = ''）", () => {
    it("ルール別にグループ化される", () => {
      const groups = buildRuleGroups(allEntries, allRules, "", entryRuleIds, getDesired);
      // ruleA: e1, e2 / ruleB: e2, e3 / ruleC: e4 / no-rule: e5 → 4グループ
      expect(groups.length).toBe(4);
      const ruleAGroup = groups.find((g) => g.rule?.id === "ruleA");
      expect(ruleAGroup?.entries.map((e) => e.id)).toEqual(["e1", "e2"]);
      const ruleBGroup = groups.find((g) => g.rule?.id === "ruleB");
      expect(ruleBGroup?.entries.map((e) => e.id)).toEqual(["e2", "e3"]);
      const noRuleGroup = groups.find((g) => g.rule === null);
      expect(noRuleGroup?.entries.map((e) => e.id)).toEqual(["e5"]);
    });
  });

  describe("ルール絞込あり（defaultRuleId = 'ruleA'）", () => {
    it("フラット表示（グルーピングなし）になる", () => {
      // filteredEntries は呼び出し側で絞り込み済みの想定（ruleAの参加者のみ）
      const filteredEntries = [e1, e2];
      const groups = buildRuleGroups(filteredEntries, allRules, "ruleA", entryRuleIds, getDesired);
      expect(groups.length).toBe(1);
      expect(groups[0].rule).toBeNull();
      expect(groups[0].entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    });

    it("ダブルエントリーの選手も含まれる", () => {
      const filteredEntries = [e1, e2]; // e2 は ruleA + ruleB
      const groups = buildRuleGroups(filteredEntries, allRules, "ruleA", entryRuleIds, getDesired);
      expect(groups[0].entries).toContain(e2);
    });
  });

  describe("ルールが1つだけの場合", () => {
    it("フラット表示になる", () => {
      const groups = buildRuleGroups([e1, e2], [ruleA], "", entryRuleIds, getDesired);
      expect(groups.length).toBe(1);
      expect(groups[0].rule).toBeNull();
    });
  });

  describe("totalDesired の計算", () => {
    it("各エントリーの希望試合数が合算される", () => {
      const getDesired2 = (e: Entry) => e.id === "e1" ? 2 : 1;
      const groups = buildRuleGroups([e1, e2], allRules, "ruleA", entryRuleIds, getDesired2);
      expect(groups[0].totalDesired).toBe(3); // 2 + 1
    });
  });
});
