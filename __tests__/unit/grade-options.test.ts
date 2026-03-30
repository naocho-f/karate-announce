/**
 * grade-options.ts 単体テスト
 *
 * 年代区分の選択肢生成とgradeToNumber変換ロジックを検証する
 */
import { describe, it, expect } from "vitest";
import {
  getGradeOptions,
  gradeToNumber,
  FIXED_GRADE_OPTIONS,
  DEFAULT_AGE_CATEGORIES,
  type AgeCategory,
} from "@/lib/grade-options";

// ──────────────────────────────────────────────
// FIXED_GRADE_OPTIONS
// ──────────────────────────────────────────────

describe("FIXED_GRADE_OPTIONS", () => {
  it("should contain 12 fixed grade options (kindergarten + elementary + middle school)", () => {
    expect(FIXED_GRADE_OPTIONS).toHaveLength(12);
  });

  it("should start with kindergarten grades", () => {
    expect(FIXED_GRADE_OPTIONS[0]).toEqual({ label: "年少", value: "年少" });
    expect(FIXED_GRADE_OPTIONS[1]).toEqual({ label: "年中", value: "年中" });
    expect(FIXED_GRADE_OPTIONS[2]).toEqual({ label: "年長", value: "年長" });
  });

  it("should include all elementary school grades", () => {
    const elementary = FIXED_GRADE_OPTIONS.slice(3, 9);
    expect(elementary).toEqual([
      { label: "小1", value: "小1" },
      { label: "小2", value: "小2" },
      { label: "小3", value: "小3" },
      { label: "小4", value: "小4" },
      { label: "小5", value: "小5" },
      { label: "小6", value: "小6" },
    ]);
  });

  it("should include all middle school grades", () => {
    const middle = FIXED_GRADE_OPTIONS.slice(9, 12);
    expect(middle).toEqual([
      { label: "中1", value: "中1" },
      { label: "中2", value: "中2" },
      { label: "中3", value: "中3" },
    ]);
  });
});

// ──────────────────────────────────────────────
// DEFAULT_AGE_CATEGORIES
// ──────────────────────────────────────────────

describe("DEFAULT_AGE_CATEGORIES", () => {
  it("should have 3 default categories", () => {
    expect(DEFAULT_AGE_CATEGORIES).toHaveLength(3);
  });

  it("should have correct default values", () => {
    expect(DEFAULT_AGE_CATEGORIES[0]).toEqual({ label: "18歳未満", minAge: 16, maxAge: 17 });
    expect(DEFAULT_AGE_CATEGORIES[1]).toEqual({ label: "一般", minAge: 18, maxAge: 59 });
    expect(DEFAULT_AGE_CATEGORIES[2]).toEqual({ label: "シニア", minAge: 60, maxAge: null });
  });
});

// ──────────────────────────────────────────────
// getGradeOptions
// ──────────────────────────────────────────────

describe("getGradeOptions", () => {
  it("should return fixed + default age categories when called without arguments", () => {
    const options = getGradeOptions();
    expect(options).toHaveLength(12 + 3); // 12 fixed + 3 default
    expect(options[0].value).toBe("年少");
    expect(options[11].value).toBe("中3");
    expect(options[12].value).toBe("18歳未満");
    expect(options[13].value).toBe("一般");
    expect(options[14].value).toBe("シニア");
  });

  it("should use custom age categories when provided", () => {
    const custom: AgeCategory[] = [
      { label: "ジュニア", minAge: 15, maxAge: 17 },
      { label: "アダルト", minAge: 18, maxAge: null },
    ];
    const options = getGradeOptions(custom);
    expect(options).toHaveLength(12 + 2); // 12 fixed + 2 custom
    expect(options[12].value).toBe("ジュニア");
    expect(options[13].value).toBe("アダルト");
  });

  it("should return only fixed options when empty age categories provided", () => {
    const options = getGradeOptions([]);
    expect(options).toHaveLength(12);
    expect(options[0].value).toBe("年少");
    expect(options[11].value).toBe("中3");
  });

  it("should have matching label and value for all options", () => {
    const options = getGradeOptions();
    for (const opt of options) {
      expect(opt.label).toBe(opt.value);
    }
  });
});

// ──────────────────────────────────────────────
// gradeToNumber
// ──────────────────────────────────────────────

describe("gradeToNumber", () => {
  it("should return null for null or empty input", () => {
    expect(gradeToNumber(null)).toBeNull();
    expect(gradeToNumber("")).toBeNull();
  });

  it("should handle kindergarten grades", () => {
    expect(gradeToNumber("年少")).toBe(-2);
    expect(gradeToNumber("年中")).toBe(-1);
    expect(gradeToNumber("年長")).toBe(0);
  });

  it("should handle elementary school grades", () => {
    expect(gradeToNumber("小1")).toBe(1);
    expect(gradeToNumber("小2")).toBe(2);
    expect(gradeToNumber("小3")).toBe(3);
    expect(gradeToNumber("小4")).toBe(4);
    expect(gradeToNumber("小5")).toBe(5);
    expect(gradeToNumber("小6")).toBe(6);
  });

  it("should handle middle school grades", () => {
    expect(gradeToNumber("中1")).toBe(7);
    expect(gradeToNumber("中2")).toBe(8);
    expect(gradeToNumber("中3")).toBe(9);
  });

  it("should handle high school grades", () => {
    expect(gradeToNumber("高1")).toBe(10);
    expect(gradeToNumber("高2")).toBe(11);
    expect(gradeToNumber("高3")).toBe(12);
  });

  it("should handle numeric strings", () => {
    expect(gradeToNumber("5")).toBe(5);
    expect(gradeToNumber("10")).toBe(10);
  });

  it("should return null for age-based categories", () => {
    expect(gradeToNumber("18歳未満")).toBeNull();
    expect(gradeToNumber("一般")).toBeNull();
    expect(gradeToNumber("シニア")).toBeNull();
  });

  it("should return null for unrecognized strings", () => {
    expect(gradeToNumber("abc")).toBeNull();
    expect(gradeToNumber("大学1")).toBeNull();
  });
});
