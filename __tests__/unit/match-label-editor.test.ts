/**
 * match-label-editor ユーティリティ関数の単体テスト
 *
 * getCourtLabel の動作を検証する。
 */
import { describe, it, expect } from "vitest";
import { getCourtLabel } from "@/components/match-label-editor";

describe("getCourtLabel", () => {
  it("courtNames が null の場合、デフォルトラベルを返す", () => {
    expect(getCourtLabel("1", null)).toBe("コート1");
    expect(getCourtLabel("2", null)).toBe("コート2");
  });

  it("courtNames の該当インデックスに名前がある場合、その名前を返す", () => {
    const courtNames = ["Aコート", "Bコート", "Cコート"];
    expect(getCourtLabel("1", courtNames)).toBe("Aコート");
    expect(getCourtLabel("2", courtNames)).toBe("Bコート");
    expect(getCourtLabel("3", courtNames)).toBe("Cコート");
  });

  it("courtNames の範囲外の場合、デフォルトラベルを返す", () => {
    const courtNames = ["Aコート"];
    expect(getCourtLabel("2", courtNames)).toBe("コート2");
    expect(getCourtLabel("5", courtNames)).toBe("コート5");
  });

  it("courtNames の要素が空文字やスペースのみの場合、デフォルトラベルを返す", () => {
    const courtNames = ["", "  ", "Cコート"];
    expect(getCourtLabel("1", courtNames)).toBe("コート1");
    expect(getCourtLabel("2", courtNames)).toBe("コート2");
    expect(getCourtLabel("3", courtNames)).toBe("Cコート");
  });

  it("courtNames の要素に前後スペースがある場合、トリムされる", () => {
    const courtNames = ["  Aコート  "];
    expect(getCourtLabel("1", courtNames)).toBe("Aコート");
  });

  it("空配列の場合、デフォルトラベルを返す", () => {
    expect(getCourtLabel("1", [])).toBe("コート1");
  });
});
