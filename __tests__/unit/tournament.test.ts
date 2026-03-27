/**
 * tournament.ts 単体テスト
 * 仕様書: docs/BRACKET_SPEC.md
 *
 * トーナメント初戦生成・ラウンド計算・ラウンド名を検証する。
 */
import { describe, it, expect } from "vitest";
import { generateFirstRound, totalRounds, roundName } from "@/lib/tournament";
import type { Fighter } from "@/lib/types";

function makeFighter(id: string): Fighter {
  return {
    id, name: `選手${id}`, name_reading: null,
    family_name: null, given_name: null,
    family_name_reading: null, given_name_reading: null,
    dojo_id: "dojo-1", affiliation: null, affiliation_reading: null,
    weight: null, height: null, age_info: null, experience: null,
    extra_fields: {}, created_at: "",
  };
}

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

  describe("generateFirstRound", () => {
    it("2人 → 1試合", () => {
      const fighters = [makeFighter("A"), makeFighter("B")];
      const matches = generateFirstRound(fighters);
      expect(matches).toHaveLength(1);
      expect(matches[0].round).toBe(1);
      expect(matches[0].position).toBe(0);
      // 両方の選手が配置されている
      const ids = [matches[0].fighter1_id, matches[0].fighter2_id].filter(Boolean);
      expect(ids).toHaveLength(2);
    });

    it("3人 → 2試合（1つはシード）", () => {
      const fighters = [makeFighter("A"), makeFighter("B"), makeFighter("C")];
      const matches = generateFirstRound(fighters);
      expect(matches).toHaveLength(2);
      // シードの試合は片方が null
      const byeMatches = matches.filter((m) => !m.fighter1_id || !m.fighter2_id);
      expect(byeMatches).toHaveLength(1);
    });

    it("4人 → 2試合（全て埋まる）", () => {
      const fighters = [makeFighter("A"), makeFighter("B"), makeFighter("C"), makeFighter("D")];
      const matches = generateFirstRound(fighters);
      expect(matches).toHaveLength(2);
      const byeMatches = matches.filter((m) => !m.fighter1_id || !m.fighter2_id);
      expect(byeMatches).toHaveLength(0);
    });

    it("8人 → 4試合", () => {
      const fighters = Array.from({ length: 8 }, (_, i) => makeFighter(String(i)));
      const matches = generateFirstRound(fighters);
      expect(matches).toHaveLength(4);
    });

    it("1人以下 → 空配列", () => {
      expect(generateFirstRound([])).toHaveLength(0);
      expect(generateFirstRound([makeFighter("A")])).toHaveLength(0);
    });

    it("全選手が漏れなく配置される", () => {
      const fighters = Array.from({ length: 6 }, (_, i) => makeFighter(String(i)));
      const matches = generateFirstRound(fighters);
      const placedIds = matches.flatMap((m) => [m.fighter1_id, m.fighter2_id]).filter(Boolean);
      // 全6人が配置されている
      expect(new Set(placedIds).size).toBe(6);
    });
  });
});
