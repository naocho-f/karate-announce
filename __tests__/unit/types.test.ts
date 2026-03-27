/**
 * types.ts ユーティリティ関数テスト
 */
import { describe, it, expect } from "vitest";
import { fighterFullName, fighterFullReading, entryFullName, entryFullReading } from "@/lib/types";
import type { Fighter, Entry } from "@/lib/types";

function makeFighter(overrides: Partial<Fighter> = {}): Fighter {
  return {
    id: "f1", name: "テスト選手", name_reading: null,
    family_name: null, given_name: null,
    family_name_reading: null, given_name_reading: null,
    dojo_id: "d1", affiliation: null, affiliation_reading: null,
    weight: null, height: null, age_info: null, experience: null,
    extra_fields: {}, created_at: "",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1", event_id: "ev1", family_name: "山田",
    given_name: null, family_name_reading: null, given_name_reading: null,
    dojo_name: null, dojo_name_reading: null, school_name: null, school_name_reading: null,
    sex: null, weight: null, height: null, birth_date: null, age: null,
    grade: null, experience: null, memo: null, admin_memo: null,
    is_withdrawn: false, is_test: false, fighter_id: null,
    extra_fields: {}, form_version: null, created_at: "",
    ...overrides,
  };
}

describe("fighterFullName", () => {
  it("姓名分割済み → 結合", () => {
    expect(fighterFullName(makeFighter({ family_name: "田中", given_name: "太郎" }))).toBe("田中 太郎");
  });

  it("姓のみ → 姓を返す", () => {
    expect(fighterFullName(makeFighter({ family_name: "田中" }))).toBe("田中");
  });

  it("分割なし → name を返す", () => {
    expect(fighterFullName(makeFighter({ name: "テスト選手" }))).toBe("テスト選手");
  });
});

describe("fighterFullReading", () => {
  it("読み分割済み → 結合", () => {
    expect(fighterFullReading(makeFighter({
      family_name_reading: "たなか", given_name_reading: "たろう",
    }))).toBe("たなか たろう");
  });

  it("姓読みのみ → 姓読みを返す", () => {
    expect(fighterFullReading(makeFighter({
      family_name_reading: "たなか",
    }))).toBe("たなか");
  });

  it("読みなし → name_reading を返す", () => {
    expect(fighterFullReading(makeFighter({ name_reading: "てすと" }))).toBe("てすと");
  });

  it("全て null → null", () => {
    expect(fighterFullReading(makeFighter())).toBeNull();
  });
});

describe("entryFullName", () => {
  it("姓名あり → 結合", () => {
    expect(entryFullName(makeEntry({ family_name: "鈴木", given_name: "花子" }))).toBe("鈴木 花子");
  });

  it("姓のみ → 姓を返す", () => {
    expect(entryFullName(makeEntry({ family_name: "鈴木" }))).toBe("鈴木");
  });
});

describe("entryFullReading", () => {
  it("読み分割済み → 結合", () => {
    expect(entryFullReading(makeEntry({
      family_name_reading: "すずき", given_name_reading: "はなこ",
    }))).toBe("すずき はなこ");
  });

  it("姓読みのみ", () => {
    expect(entryFullReading(makeEntry({ family_name_reading: "すずき" }))).toBe("すずき");
  });

  it("読みなし → null", () => {
    expect(entryFullReading(makeEntry())).toBeNull();
  });
});
