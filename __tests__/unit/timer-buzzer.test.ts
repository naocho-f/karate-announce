import { describe, it, expect } from "vitest";
import { BUILTIN_SOUNDS } from "@/lib/timer-buzzer";

describe("BUILTIN_SOUNDS", () => {
  it("10種類の内蔵音源が定義されている", () => {
    expect(BUILTIN_SOUNDS).toHaveLength(10);
  });

  it("全ての音源にid, label, freq, wave, patternが定義されている", () => {
    for (const sound of BUILTIN_SOUNDS) {
      expect(sound.id).toBeTruthy();
      expect(sound.label).toBeTruthy();
      expect(sound.freq).toBeGreaterThan(0);
      expect(sound.wave).toBeTruthy();
      expect(sound.pattern).toBeTruthy();
    }
  });

  it("IDが重複していない", () => {
    const ids = BUILTIN_SOUNDS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaultが先頭に定義されている", () => {
    expect(BUILTIN_SOUNDS[0].id).toBe("default");
  });

  it("wave型がOscillatorTypeの有効値である", () => {
    const validWaves = ["sine", "square", "sawtooth", "triangle"];
    for (const sound of BUILTIN_SOUNDS) {
      expect(validWaves).toContain(sound.wave);
    }
  });
});
