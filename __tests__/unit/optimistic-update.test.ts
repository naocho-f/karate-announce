/**
 * optimistic-update.ts 単体テスト
 *
 * 「確定待ち」状態管理と次ラウンド開始ブロックのロジックを検証する。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  addPendingWinner,
  removePendingWinner,
  hasPendingWinner,
  shouldBlockNextRoundStart,
  clearAllPendingWinners,
} from "@/lib/optimistic-update";

beforeEach(() => {
  clearAllPendingWinners();
});

describe("確定待ち状態管理", () => {
  it("addPendingWinner で確定待ち状態に追加される", () => {
    addPendingWinner("m1");
    expect(hasPendingWinner("m1")).toBe(true);
  });

  it("removePendingWinner で確定待ち状態から解除される", () => {
    addPendingWinner("m1");
    removePendingWinner("m1");
    expect(hasPendingWinner("m1")).toBe(false);
  });

  it("存在しない matchId には false を返す", () => {
    expect(hasPendingWinner("nonexistent")).toBe(false);
  });
});

describe("次ラウンド開始ブロック", () => {
  it("前ラウンドに未送信の勝者設定がある場合 true を返す", () => {
    // トーナメント t1 のラウンド1、ポジション0の勝者が未送信
    addPendingWinner("m1");

    // ラウンド2の試合を開始しようとする
    // ラウンド2の fighter は m1 の勝者から配置されるはず
    const matches = [
      { id: "m1", round: 1, position: 0, status: "done" as const, winner_id: "f1" },
      { id: "m2", round: 1, position: 1, status: "done" as const, winner_id: "f2" },
      { id: "m3", round: 2, position: 0, status: "ready" as const, winner_id: null },
    ];

    expect(shouldBlockNextRoundStart("m3", matches)).toBe(true);
  });

  it("前ラウンドに未送信がない場合 false を返す", () => {
    const matches = [
      { id: "m1", round: 1, position: 0, status: "done" as const, winner_id: "f1" },
      { id: "m2", round: 1, position: 1, status: "done" as const, winner_id: "f2" },
      { id: "m3", round: 2, position: 0, status: "ready" as const, winner_id: null },
    ];

    expect(shouldBlockNextRoundStart("m3", matches)).toBe(false);
  });

  it("ラウンド1の試合はブロックされない（前ラウンドがない）", () => {
    const matches = [{ id: "m1", round: 1, position: 0, status: "ready" as const, winner_id: null }];

    expect(shouldBlockNextRoundStart("m1", matches)).toBe(false);
  });
});
