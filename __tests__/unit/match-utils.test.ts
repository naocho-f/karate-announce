/**
 * match-utils.ts 単体テスト
 */
import { describe, it, expect } from "vitest";
import { matchLabelNum } from "@/lib/match-utils";

describe("matchLabelNum", () => {
  it("数字を含むラベルから数値を抽出", () => {
    expect(matchLabelNum("第3試合")).toBe(3);
    expect(matchLabelNum("第12試合")).toBe(12);
    expect(matchLabelNum("試合1")).toBe(1);
  });

  it("数字がないラベル → Infinity", () => {
    expect(matchLabelNum("決勝")).toBe(Infinity);
  });

  it("null → Infinity", () => {
    expect(matchLabelNum(null)).toBe(Infinity);
  });
});
