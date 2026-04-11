import { describe, it, expect } from "vitest";
import { bracketQuality, buildBracketPreview, entryOptionLabel } from "@/components/_bracket-shared";
import type { Entry } from "@/lib/types";

function makeEntry(id: string, overrides?: Partial<Entry>): Entry {
  return {
    id, event_id: "ev1", family_name: "田中", given_name: "太郎",
    family_name_reading: "タナカ", given_name_reading: "タロウ",
    created_at: "2026-01-01", is_test: false, is_withdrawn: false,
    fighter_id: null, school_name: null, dojo_name: null,
    weight: null, height: null, age: null, sex: null, grade: null,
    experience: null, extra_fields: null, email: null, phone: null,
    birthday: null, tenant_id: null,
    ...overrides,
  } as Entry;
}

describe("bracketQuality", () => {
  it("0対戦は isClean=true", () => {
    expect(bracketQuality(0).isClean).toBe(true);
  });

  it("2の累乗は isClean=true", () => {
    expect(bracketQuality(1).isClean).toBe(true);
    expect(bracketQuality(2).isClean).toBe(true);
    expect(bracketQuality(4).isClean).toBe(true);
    expect(bracketQuality(8).isClean).toBe(true);
    expect(bracketQuality(16).isClean).toBe(true);
  });

  it("2の累乗でない値は isClean=false", () => {
    const q = bracketQuality(3);
    expect(q.isClean).toBe(false);
    expect(q.nextCleanPairs).toBe(4);
    expect(q.prevCleanPairs).toBe(2);
    expect(q.addNeeded).toBe(1);
    expect(q.removeNeeded).toBe(1);
  });

  it("5対戦の場合", () => {
    const q = bracketQuality(5);
    expect(q.isClean).toBe(false);
    expect(q.nextCleanPairs).toBe(8);
    expect(q.prevCleanPairs).toBe(4);
    expect(q.addNeeded).toBe(3);
    expect(q.removeNeeded).toBe(1);
  });
});

describe("buildBracketPreview", () => {
  it("空の配列は空のプレビューを返す", () => {
    const result = buildBracketPreview([]);
    expect(result.matches).toHaveLength(0);
    expect(Object.keys(result.nameMap)).toHaveLength(0);
  });

  it("2ペアでラウンド1とラウンド2の試合を生成する", () => {
    const e1 = makeEntry("e1", { family_name: "鈴木", given_name: "一" });
    const e2 = makeEntry("e2", { family_name: "佐藤", given_name: "二" });
    const e3 = makeEntry("e3", { family_name: "田中", given_name: "三" });
    const e4 = makeEntry("e4", { family_name: "山田", given_name: "四" });
    const pairs = [
      { id: "p1", e1, e2, matchLabel: "", ruleId: "" },
      { id: "p2", e1: e3, e2: e4, matchLabel: "", ruleId: "" },
    ];
    const result = buildBracketPreview(pairs);
    const round1 = result.matches.filter((m) => m.round === 1);
    const round2 = result.matches.filter((m) => m.round === 2);
    expect(round1).toHaveLength(2);
    expect(round2).toHaveLength(1);
    expect(result.nameMap["e1"]).toBe("鈴木 一");
    expect(result.nameMap["e3"]).toBe("田中 三");
  });

  it("不戦勝ペア（e2がnull）を処理できる", () => {
    const e1 = makeEntry("e1");
    const pairs = [{ id: "p1", e1, e2: null, matchLabel: "", ruleId: "" }];
    const result = buildBracketPreview(pairs);
    expect(result.matches[0].fighter2_id).toBeNull();
  });
});

describe("entryOptionLabel", () => {
  it("名前と所属を含む", () => {
    const e = makeEntry("e1", { family_name: "田中", given_name: "太郎", school_name: "東京道場" });
    const label = entryOptionLabel(e);
    expect(label).toContain("田中 太郎");
    expect(label).toContain("東京道場");
  });

  it("体重・身長・年齢を含む", () => {
    const e = makeEntry("e1", { weight: 65.5, height: 170, age: 25 });
    const label = entryOptionLabel(e);
    expect(label).toContain("65.5kg");
    expect(label).toContain("170cm");
    expect(label).toContain("25歳");
  });

  it("prefixを付けられる", () => {
    const e = makeEntry("e1", { family_name: "鈴木", given_name: "花" });
    const label = entryOptionLabel(e, "★ ");
    expect(label).toContain("★ 鈴木 花");
  });

  it("経験年数を含む", () => {
    const e = makeEntry("e1", { experience: "5年" });
    const label = entryOptionLabel(e);
    expect(label).toContain("[5年]");
  });
});
