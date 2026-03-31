/**
 * grade-options.ts 単体テスト
 *
 * 年代区分の選択肢生成とgradeToNumber変換ロジックを検証する
 */
import { describe, it, expect } from "vitest";
import {
  getGradeOptions,
  gradeToNumber,
  isAgeCategoryLabel,
  findAgeCategory,
  FIXED_GRADE_OPTIONS,
  DEFAULT_AGE_CATEGORIES,
  type AgeCategory,
} from "@/lib/grade-options";

// ──────────────────────────────────────────────
// FIXED_GRADE_OPTIONS
// ──────────────────────────────────────────────

describe("FIXED_GRADE_OPTIONS", () => {
  it("should contain 15 fixed grade options (kindergarten + elementary + middle + high school)", () => {
    expect(FIXED_GRADE_OPTIONS).toHaveLength(15);
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

  it("should include all high school grades", () => {
    const high = FIXED_GRADE_OPTIONS.slice(12, 15);
    expect(high).toEqual([
      { label: "高1", value: "高1" },
      { label: "高2", value: "高2" },
      { label: "高3", value: "高3" },
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
    expect(options).toHaveLength(15 + 3); // 15 fixed + 3 default
    expect(options[0].value).toBe("年少");
    expect(options[11].value).toBe("中3");
    expect(options[12].value).toBe("高1");
    expect(options[14].value).toBe("高3");
    expect(options[15].value).toBe("18歳未満");
    expect(options[16].value).toBe("一般");
    expect(options[17].value).toBe("シニア");
  });

  it("should use custom age categories when provided", () => {
    const custom: AgeCategory[] = [
      { label: "ジュニア", minAge: 15, maxAge: 17 },
      { label: "アダルト", minAge: 18, maxAge: null },
    ];
    const options = getGradeOptions(custom);
    expect(options).toHaveLength(15 + 2); // 15 fixed + 2 custom
    expect(options[15].value).toBe("ジュニア");
    expect(options[16].value).toBe("アダルト");
  });

  it("should return only fixed options when empty age categories provided", () => {
    const options = getGradeOptions([]);
    expect(options).toHaveLength(15);
    expect(options[0].value).toBe("年少");
    expect(options[14].value).toBe("高3");
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

  it("should support range filtering with gradeToNumber (minGrade/maxGrade)", () => {
    // 小1〜小4の範囲フィルタリング
    const minNum = gradeToNumber("小1")!;
    const maxNum = gradeToNumber("小4")!;
    expect(minNum).toBe(1);
    expect(maxNum).toBe(4);

    // 範囲内
    expect(gradeToNumber("小1")! >= minNum && gradeToNumber("小1")! <= maxNum).toBe(true);
    expect(gradeToNumber("小3")! >= minNum && gradeToNumber("小3")! <= maxNum).toBe(true);
    expect(gradeToNumber("小4")! >= minNum && gradeToNumber("小4")! <= maxNum).toBe(true);

    // 範囲外
    expect(gradeToNumber("年長")! >= minNum && gradeToNumber("年長")! <= maxNum).toBe(false);
    expect(gradeToNumber("小5")! >= minNum && gradeToNumber("小5")! <= maxNum).toBe(false);
    expect(gradeToNumber("中1")! >= minNum && gradeToNumber("中1")! <= maxNum).toBe(false);
  });

  it("should support cross-level range (kindergarten to elementary)", () => {
    const minNum = gradeToNumber("年長")!;
    const maxNum = gradeToNumber("小2")!;
    expect(minNum).toBe(0);
    expect(maxNum).toBe(2);

    expect(gradeToNumber("年長")! >= minNum && gradeToNumber("年長")! <= maxNum).toBe(true);
    expect(gradeToNumber("小1")! >= minNum && gradeToNumber("小1")! <= maxNum).toBe(true);
    expect(gradeToNumber("小2")! >= minNum && gradeToNumber("小2")! <= maxNum).toBe(true);
    expect(gradeToNumber("年中")! >= minNum && gradeToNumber("年中")! <= maxNum).toBe(false);
    expect(gradeToNumber("小3")! >= minNum && gradeToNumber("小3")! <= maxNum).toBe(false);
  });
});

// ──────────────────────────────────────────────
// isAgeCategoryLabel
// ──────────────────────────────────────────────

describe("isAgeCategoryLabel", () => {
  it("should return true for default age category labels", () => {
    expect(isAgeCategoryLabel("18歳未満")).toBe(true);
    expect(isAgeCategoryLabel("一般")).toBe(true);
    expect(isAgeCategoryLabel("シニア")).toBe(true);
  });

  it("should return false for grade-based labels", () => {
    expect(isAgeCategoryLabel("小1")).toBe(false);
    expect(isAgeCategoryLabel("中3")).toBe(false);
    expect(isAgeCategoryLabel("年少")).toBe(false);
  });

  it("should use custom age categories when provided", () => {
    const custom: AgeCategory[] = [
      { label: "ジュニア", minAge: 15, maxAge: 17 },
    ];
    expect(isAgeCategoryLabel("ジュニア", custom)).toBe(true);
    expect(isAgeCategoryLabel("一般", custom)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// findAgeCategory
// ──────────────────────────────────────────────

describe("findAgeCategory", () => {
  it("should find default age category by label", () => {
    const cat = findAgeCategory("一般");
    expect(cat).toEqual({ label: "一般", minAge: 18, maxAge: 59 });
  });

  it("should return null for grade-based labels", () => {
    expect(findAgeCategory("小1")).toBeNull();
    expect(findAgeCategory("中3")).toBeNull();
  });

  it("should return null for unknown labels", () => {
    expect(findAgeCategory("不明")).toBeNull();
  });

  it("should use custom age categories when provided", () => {
    const custom: AgeCategory[] = [
      { label: "ジュニア", minAge: 15, maxAge: 17 },
      { label: "マスターズ", minAge: 40, maxAge: null },
    ];
    expect(findAgeCategory("ジュニア", custom)).toEqual({ label: "ジュニア", minAge: 15, maxAge: 17 });
    expect(findAgeCategory("マスターズ", custom)).toEqual({ label: "マスターズ", minAge: 40, maxAge: null });
    expect(findAgeCategory("一般", custom)).toBeNull();
  });
});
