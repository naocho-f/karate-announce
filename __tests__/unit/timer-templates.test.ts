import { describe, it, expect } from "vitest";
import { TIMER_TEMPLATES } from "@/lib/timer-templates";

describe("timer-templates", () => {
  it("TIMER_TEMPLATESが1つ以上のテンプレートを含む", () => {
    expect(TIMER_TEMPLATES.length).toBeGreaterThanOrEqual(1);
  });

  it("交流会テンプレートが存在する", () => {
    const kouryuukai = TIMER_TEMPLATES.find((t) => t.id === "kouryuukai");
    expect(kouryuukai).toBeDefined();
    expect(kouryuukai?.name).toBe("交流会");
  });

  it("交流会テンプレートのlayoutにtemplateIdが設定されている", () => {
    const kouryuukai = TIMER_TEMPLATES.find((t) => t.id === "kouryuukai");
    expect(kouryuukai?.preset.layout?.templateId).toBe("kouryuukai");
  });

  it("全テンプレートにid, name, description, presetが存在する", () => {
    for (const t of TIMER_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.preset).toBeDefined();
      expect(t.preset.name).toBeTruthy();
    }
  });
});
