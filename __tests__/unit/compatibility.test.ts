/**
 * 対戦相性チェックロジックのテスト
 */
import { describe, it, expect } from "vitest";
import {
  checkCompatibility,
  COMPAT_COLORS,
  COMPAT_BG,
  COMPAT_LABEL,
  type MismatchSettings,
} from "@/lib/compatibility";

const settings: MismatchSettings = { maxWeightDiff: 5, maxHeightDiff: 10 };

describe("checkCompatibility", () => {
  it("体重・身長の差が閾値内なら ok", () => {
    const result = checkCompatibility(
      { weight: 60, height: 170 },
      { weight: 63, height: 175 },
      settings,
    );
    expect(result).toBe("ok");
  });

  it("体重差が閾値超で warn", () => {
    const result = checkCompatibility(
      { weight: 60, height: 170 },
      { weight: 66, height: 170 },
      settings,
    );
    expect(result).toBe("warn");
  });

  it("体重差が閾値の2倍超で ng", () => {
    const result = checkCompatibility(
      { weight: 60, height: 170 },
      { weight: 71, height: 170 },
      settings,
    );
    expect(result).toBe("ng");
  });

  it("身長差が閾値超で warn", () => {
    const result = checkCompatibility(
      { weight: 60, height: 160 },
      { weight: 60, height: 172 },
      settings,
    );
    expect(result).toBe("warn");
  });

  it("身長差が閾値の2倍超で ng", () => {
    const result = checkCompatibility(
      { weight: 60, height: 160 },
      { weight: 60, height: 182 },
      settings,
    );
    expect(result).toBe("ng");
  });

  it("体重・身長が null の場合 unknown", () => {
    const result = checkCompatibility(
      { weight: null, height: null },
      { weight: 60, height: 170 },
      settings,
    );
    expect(result).toBe("unknown");
  });

  it("片方だけ null でも比較可能な項目があれば判定", () => {
    const result = checkCompatibility(
      { weight: 60, height: null },
      { weight: 63, height: null },
      settings,
    );
    expect(result).toBe("ok");
  });

  it("設定が null（無制限）の場合 unknown", () => {
    const result = checkCompatibility(
      { weight: 60, height: 170 },
      { weight: 80, height: 190 },
      { maxWeightDiff: null, maxHeightDiff: null },
    );
    expect(result).toBe("unknown");
  });

  it("ng と warn が混在する場合 ng が優先", () => {
    // 体重差 11kg → ng (> 5*2=10)、身長差 12cm → warn (> 10, <= 20)
    const result = checkCompatibility(
      { weight: 60, height: 170 },
      { weight: 71, height: 182 },
      settings,
    );
    expect(result).toBe("ng");
  });

  it("ちょうど閾値は ok", () => {
    const result = checkCompatibility(
      { weight: 60, height: 170 },
      { weight: 65, height: 180 },
      settings,
    );
    expect(result).toBe("ok");
  });
});

describe("定数エクスポート", () => {
  it("COMPAT_COLORS に全レベルが定義されている", () => {
    expect(COMPAT_COLORS.ok).toBeDefined();
    expect(COMPAT_COLORS.warn).toBeDefined();
    expect(COMPAT_COLORS.ng).toBeDefined();
    expect(COMPAT_COLORS.unknown).toBeDefined();
  });

  it("COMPAT_BG に全レベルが定義されている", () => {
    expect(COMPAT_BG.ok).toBeDefined();
    expect(COMPAT_BG.ng).toBeDefined();
  });

  it("COMPAT_LABEL に全レベルが定義されている", () => {
    expect(COMPAT_LABEL.ok).toBe("◎");
    expect(COMPAT_LABEL.warn).toBe("△");
    expect(COMPAT_LABEL.ng).toBe("✕");
    expect(COMPAT_LABEL.unknown).toBe("－");
  });
});
