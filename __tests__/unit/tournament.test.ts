/**
 * tournament.ts 単体テスト
 * 仕様書: docs/BRACKET_SPEC.md
 *
 * ラウンド計算・ラウンド名を検証する。
 */
import { describe, it, expect } from "vitest";
import { totalRounds, roundName } from "@/lib/tournament";

describe("tournament", () => {

  describe("totalRounds", () => {
    it("2人 → 1ラウンド", () => expect(totalRounds(2)).toBe(1));
    it("3人 → 2ラウンド", () => expect(totalRounds(3)).toBe(2));
    it("4人 → 2ラウンド", () => expect(totalRounds(4)).toBe(2));
    it("5人 → 3ラウンド", () => expect(totalRounds(5)).toBe(3));
    it("8人 → 3ラウンド", () => expect(totalRounds(8)).toBe(3));
    it("16人 → 4ラウンド", () => expect(totalRounds(16)).toBe(4));
    it("1人以下 → 0ラウンド", () => expect(totalRounds(1)).toBe(0));
  });

  describe("roundName", () => {
    it("最終ラウンド → 決勝", () => expect(roundName(3, 3)).toBe("決勝"));
    it("準決勝", () => expect(roundName(2, 3)).toBe("準決勝"));
    it("準々決勝", () => expect(roundName(2, 4)).toBe("準々決勝"));
    it("第1回戦", () => expect(roundName(1, 4)).toBe("第1回戦"));
  });
});
