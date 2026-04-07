/**
 * connection-logic.ts 単体テスト
 *
 * 接続状態の3段階判定・バックオフ間隔計算のロジックを検証する。
 * React コンポーネントから分離された純粋関数をテスト。
 */
import { describe, it, expect } from "vitest";
import {
  type ConnectionQuality,
  determineConnectionQuality,
  calcBackoffInterval,
} from "@/lib/connection-logic";

describe("determineConnectionQuality", () => {
  it("直近3回全成功で normal を返す", () => {
    expect(determineConnectionQuality({
      consecutiveFailures: 0,
      hasOperationRetry: false,
    })).toBe("normal" satisfies ConnectionQuality);
  });

  it("操作リトライが発生した場合に unstable を返す", () => {
    expect(determineConnectionQuality({
      consecutiveFailures: 1,
      hasOperationRetry: true,
    })).toBe("unstable" satisfies ConnectionQuality);
  });

  it("ポーリング失敗のみで操作リトライなしなら normal のまま", () => {
    // オオカミ少年効果の回避: バックグラウンドのポーリング失敗だけでは不安定表示しない
    expect(determineConnectionQuality({
      consecutiveFailures: 2,
      hasOperationRetry: false,
    })).toBe("normal" satisfies ConnectionQuality);
  });

  it("3回連続失敗で offline を返す", () => {
    expect(determineConnectionQuality({
      consecutiveFailures: 3,
      hasOperationRetry: false,
    })).toBe("offline" satisfies ConnectionQuality);
  });

  it("3回以上連続失敗でも offline を返す", () => {
    expect(determineConnectionQuality({
      consecutiveFailures: 10,
      hasOperationRetry: false,
    })).toBe("offline" satisfies ConnectionQuality);
  });

  it("navigator.onLine が false なら即座に offline", () => {
    expect(determineConnectionQuality({
      consecutiveFailures: 0,
      hasOperationRetry: false,
      navigatorOnLine: false,
    })).toBe("offline" satisfies ConnectionQuality);
  });
});

describe("calcBackoffInterval", () => {
  it("失敗0回では基本間隔を返す", () => {
    expect(calcBackoffInterval(3000, 0)).toBe(3000);
  });

  it("失敗1回で2倍になる", () => {
    expect(calcBackoffInterval(3000, 1)).toBe(6000);
  });

  it("失敗2回で4倍になる", () => {
    expect(calcBackoffInterval(3000, 2)).toBe(12000);
  });

  it("最大30秒を超えない", () => {
    expect(calcBackoffInterval(3000, 10)).toBe(30000);
  });

  it("5秒の基本間隔でも最大30秒を超えない", () => {
    expect(calcBackoffInterval(5000, 5)).toBe(30000);
  });
});
