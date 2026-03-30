import { describe, it, expect } from "vitest";
import { BTN, INPUT, BADGE } from "@/lib/ui-constants";

describe("ui-constants", () => {
  it("BTN には primary / secondary / danger / micro が定義されている", () => {
    expect(BTN.primary).toContain("bg-blue-600");
    expect(BTN.secondary).toContain("bg-gray-700");
    expect(BTN.danger).toContain("bg-red-700");
    expect(BTN.micro).toContain("text-xs");
  });

  it("全 BTN バリアントに disabled:opacity-50 が含まれる", () => {
    for (const [key, cls] of Object.entries(BTN)) {
      expect(cls, `BTN.${key}`).toContain("disabled:opacity-50");
    }
  });

  it("INPUT に bg-gray-700 と focus:border-blue-500 が含まれる", () => {
    expect(INPUT).toContain("bg-gray-700");
    expect(INPUT).toContain("focus:border-blue-500");
  });

  it("BADGE には active / warning / error / info / neutral が定義されている", () => {
    expect(BADGE.active).toContain("bg-green-900");
    expect(BADGE.warning).toContain("bg-yellow-900");
    expect(BADGE.error).toContain("bg-red-900");
    expect(BADGE.info).toContain("bg-blue-900");
    expect(BADGE.neutral).toContain("bg-gray-700");
  });
});
