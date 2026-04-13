/**
 * match-utils.ts 単体テスト
 */
import { describe, it, expect } from "vitest";
import { matchLabelNum, matchLabelToShort } from "@/lib/match-utils";

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

describe("matchLabelToShort", () => {
  it("「A第1試合」→「A-1」", () => {
    expect(matchLabelToShort("A第1試合")).toBe("A-1");
  });

  it("「B第12試合」→「B-12」", () => {
    expect(matchLabelToShort("B第12試合")).toBe("B-12");
  });

  it("「Aコート第3試合」→「Aコート-3」", () => {
    expect(matchLabelToShort("Aコート第3試合")).toBe("Aコート-3");
  });

  it("「コート2第5試合」→「コート2-5」", () => {
    expect(matchLabelToShort("コート2第5試合")).toBe("コート2-5");
  });

  it("数字のみのラベル → そのまま返す", () => {
    expect(matchLabelToShort("3")).toBe("3");
  });

  it("パターンに合わない → そのまま返す", () => {
    expect(matchLabelToShort("決勝")).toBe("決勝");
  });

  it("null → 空文字", () => {
    expect(matchLabelToShort(null)).toBe("");
  });

  it("空文字 → 空文字", () => {
    expect(matchLabelToShort("")).toBe("");
  });
});
