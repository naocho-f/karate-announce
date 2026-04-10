import { describe, it, expect } from "vitest";
import { BUILTIN_SOUNDS, SOUND_CATEGORIES } from "@/lib/timer-buzzer";

describe("BUILTIN_SOUNDS", () => {
  it("30種類の内蔵音源が定義されている", () => {
    expect(BUILTIN_SOUNDS).toHaveLength(30);
  });

  it("27種は音程×波形×パターンの組み合わせ", () => {
    const generated = BUILTIN_SOUNDS.filter((s) => s.pattern !== "special");
    expect(generated).toHaveLength(27);
  });

  it("3種は特殊音源", () => {
    const special = BUILTIN_SOUNDS.filter((s) => s.pattern === "special");
    expect(special).toHaveLength(3);
    expect(special.map((s) => s.id)).toEqual(["whistle", "gong", "siren"]);
  });

  it("全ての音源にid, label, category, freq, wave, patternが定義されている", () => {
    for (const sound of BUILTIN_SOUNDS) {
      expect(sound.id).toBeTruthy();
      expect(sound.label).toBeTruthy();
      expect(sound.category).toBeTruthy();
      expect(sound.freq).toBeGreaterThan(0);
      expect(sound.wave).toBeTruthy();
      expect(sound.pattern).toBeTruthy();
    }
  });

  it("IDが重複していない", () => {
    const ids = BUILTIN_SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ID命名規則: {pitch}-{wave}-{pattern} の形式", () => {
    const generated = BUILTIN_SOUNDS.filter((s) => s.pattern !== "special");
    for (const sound of generated) {
      expect(sound.id).toMatch(/^(low|mid|high)-(square|sine|saw)-(single|double|triple)$/);
    }
  });

  it("wave型がOscillatorTypeの有効値である", () => {
    const validWaves = ["sine", "square", "sawtooth", "triangle"];
    for (const sound of BUILTIN_SOUNDS) {
      expect(validWaves).toContain(sound.wave);
    }
  });

  it("カテゴリは4種類", () => {
    expect(SOUND_CATEGORIES).toHaveLength(4);
    expect([...SOUND_CATEGORIES]).toEqual(["低音", "中音", "高音", "特殊"]);
  });

  it("全音源がカテゴリに属している", () => {
    for (const sound of BUILTIN_SOUNDS) {
      expect([...SOUND_CATEGORIES]).toContain(sound.category);
    }
  });
});
