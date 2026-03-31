import { describe, it, expect } from "vitest";
import {
  estimateMatchMinutes,
  formatTimeEstimate,
  countActualMatches,
} from "@/lib/time-estimate";

describe("estimateMatchMinutes", () => {
  it("試合数0の場合は0分を返す", () => {
    expect(estimateMatchMinutes({
      matchCount: 0,
      matchDurationSec: 120,
      hasExtension: false,
      extensionDurationSec: 0,
      intervalSec: 60,
    })).toBe(0);
  });

  it("延長なし: 試合時間×試合数 + インターバル×(試合数-1)で計算する", () => {
    // 8試合 x 120秒 + 7 x 60秒 = 960 + 420 = 1380秒 = 23分
    expect(estimateMatchMinutes({
      matchCount: 8,
      matchDurationSec: 120,
      hasExtension: false,
      extensionDurationSec: 0,
      intervalSec: 60,
    })).toBe(23);
  });

  it("延長あり: 延長時間の50%を加算する", () => {
    // 8試合 x (120秒 + 30秒) + 7 x 60秒 = 1200 + 420 = 1620秒 = 27分
    expect(estimateMatchMinutes({
      matchCount: 8,
      matchDurationSec: 120,
      hasExtension: true,
      extensionDurationSec: 60,
      intervalSec: 60,
    })).toBe(27);
  });

  it("端数は切り上げる", () => {
    // 3試合 x 90秒 + 2 x 60秒 = 270 + 120 = 390秒 = 6.5分 → 7分
    expect(estimateMatchMinutes({
      matchCount: 3,
      matchDurationSec: 90,
      hasExtension: false,
      extensionDurationSec: 0,
      intervalSec: 60,
    })).toBe(7);
  });

  it("1試合の場合インターバルは0", () => {
    // 1試合 x 120秒 + 0 x 60秒 = 120秒 = 2分
    expect(estimateMatchMinutes({
      matchCount: 1,
      matchDurationSec: 120,
      hasExtension: false,
      extensionDurationSec: 0,
      intervalSec: 60,
    })).toBe(2);
  });
});

describe("formatTimeEstimate", () => {
  it("分数のみの場合: 約XX分を返す", () => {
    const result = formatTimeEstimate({ minutes: 45 });
    expect(result.duration).toBe("約45分");
    expect(result.endTime).toBeUndefined();
  });

  it("60分以上の場合: 約X時間Y分を返す", () => {
    const result = formatTimeEstimate({ minutes: 90 });
    expect(result.duration).toBe("約1時間30分");
  });

  it("ちょうど1時間の場合: 約1時間を返す", () => {
    const result = formatTimeEstimate({ minutes: 60 });
    expect(result.duration).toBe("約1時間");
  });

  it("開始時刻を指定すると終了時刻を返す", () => {
    const result = formatTimeEstimate({ minutes: 45, startTime: "10:00" });
    expect(result.duration).toBe("約45分");
    expect(result.endTime).toBe("10:45");
  });

  it("終了時刻が日をまたぐ場合", () => {
    const result = formatTimeEstimate({ minutes: 90, startTime: "23:00" });
    expect(result.endTime).toBe("00:30");
  });

  it("不正な開始時刻の場合はendTimeを返さない", () => {
    const result = formatTimeEstimate({ minutes: 45, startTime: "invalid" });
    expect(result.endTime).toBeUndefined();
  });

  it("内訳情報を返す（インターバルあり）", () => {
    const result = formatTimeEstimate({
      minutes: 23,
      startTime: "10:00",
      matchCount: 8,
      matchDurationSec: 120,
      extensionSec: 0,
      intervalSec: 60,
    });
    expect(result.breakdown).toBe("8試合 × 2分 + 試合間1分 × 7 = 23分");
  });

  it("内訳情報を返す（インターバルなし）", () => {
    const result = formatTimeEstimate({
      minutes: 16,
      matchCount: 8,
      matchDurationSec: 120,
      extensionSec: 0,
      intervalSec: 0,
    });
    expect(result.breakdown).toBe("8試合 × 2分 = 16分");
  });

  it("内訳パラメータ未指定時はbreakdownなし", () => {
    const result = formatTimeEstimate({ minutes: 45 });
    expect(result.breakdown).toBeUndefined();
  });
});

describe("countActualMatches", () => {
  it("両選手がいる試合のみカウントする", () => {
    const matches = [
      { tournament_id: "t1", fighter1_id: "f1", fighter2_id: "f2" },
      { tournament_id: "t1", fighter1_id: "f3", fighter2_id: null }, // 不戦勝
      { tournament_id: "t1", fighter1_id: null, fighter2_id: null }, // 空スロット
      { tournament_id: "t2", fighter1_id: "f4", fighter2_id: "f5" }, // 別トーナメント
    ];
    expect(countActualMatches(matches, ["t1"])).toBe(1);
    expect(countActualMatches(matches, ["t1", "t2"])).toBe(2);
  });

  it("対象トーナメントがない場合は0", () => {
    const matches = [
      { tournament_id: "t1", fighter1_id: "f1", fighter2_id: "f2" },
    ];
    expect(countActualMatches(matches, ["t99"])).toBe(0);
  });
});
