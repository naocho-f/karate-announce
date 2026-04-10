import { describe, it, expect } from "vitest";
import { checkWatchNotifications, REMIND_BEFORE, type WatchMatch } from "@/lib/watch-notify";

function makeMatch(id: string, label: string | null, status: string, f1: string | null, f2: string | null): WatchMatch {
  return { id, status, match_label: label, fighter1_name: f1, fighter2_name: f2, courtLabel: "Aコート" };
}

describe("checkWatchNotifications", () => {
  it("ウォッチ選手の3試合前に ongoing の試合があれば通知する", () => {
    const matches: WatchMatch[] = [
      makeMatch("m1", "第1試合", "done", "山田", "田中"),
      makeMatch("m2", "第2試合", "done", "鈴木", "佐藤"),
      makeMatch("m3", "第3試合", "ongoing", "井上", "高橋"),
      makeMatch("m4", "第4試合", "ready", "渡辺", "中村"),
      makeMatch("m5", "第5試合", "ready", "小林", "加藤"),
      makeMatch("m6", "第6試合", "ready", "山田", "鈴木"), // ウォッチ対象
    ];
    const notified = new Set<string>();
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], ["山田"], notified);
    // 第6試合 - 3 = 第3試合 が ongoing → 通知
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("山田選手");
    expect(result[0].message).toContain("Aコート赤");
    expect(notified.has("m6")).toBe(true);
  });

  it("白側の選手も正しく通知される", () => {
    const matches: WatchMatch[] = [
      makeMatch("m1", "第1試合", "ongoing", "A", "B"),
      makeMatch("m4", "第4試合", "ready", "C", "山田"),
    ];
    const result = checkWatchNotifications([{ courtLabel: "Bコート", matches }], ["山田"], new Set());
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("Bコート白");
  });

  it("まだ3試合前でなければ通知しない", () => {
    const matches: WatchMatch[] = [
      makeMatch("m1", "第1試合", "ongoing", "A", "B"),
      makeMatch("m8", "第8試合", "ready", "山田", "C"),
    ];
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], ["山田"], new Set());
    // 第8試合 - 3 = 第5試合。第1試合が ongoing だが 1 < 5 なので通知しない
    expect(result).toHaveLength(0);
  });

  it("試合番号が未設定の場合は通知しない", () => {
    const matches: WatchMatch[] = [
      makeMatch("m1", "第1試合", "ongoing", "A", "B"),
      makeMatch("m2", null, "ready", "山田", "C"),
    ];
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], ["山田"], new Set());
    expect(result).toHaveLength(0);
  });

  it("通知済みの試合は再通知しない", () => {
    const matches: WatchMatch[] = [
      makeMatch("m1", "第1試合", "ongoing", "A", "B"),
      makeMatch("m4", "第4試合", "ready", "山田", "C"),
    ];
    const notified = new Set(["m4"]);
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], ["山田"], notified);
    expect(result).toHaveLength(0);
  });

  it("ongoing の試合は通知対象外", () => {
    const matches: WatchMatch[] = [makeMatch("m1", "第1試合", "ongoing", "山田", "B")];
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], ["山田"], new Set());
    expect(result).toHaveLength(0);
  });

  it("done の試合は通知対象外", () => {
    const matches: WatchMatch[] = [makeMatch("m1", "第1試合", "done", "山田", "B")];
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], ["山田"], new Set());
    expect(result).toHaveLength(0);
  });

  it("ウォッチリストが空なら何も返さない", () => {
    const matches: WatchMatch[] = [makeMatch("m1", "第1試合", "ongoing", "A", "B")];
    const result = checkWatchNotifications([{ courtLabel: "Aコート", matches }], [], new Set());
    expect(result).toHaveLength(0);
  });

  it("複数コートで複数選手の通知が同時に発生する", () => {
    const courtA: WatchMatch[] = [
      makeMatch("a1", "第3試合", "ongoing", "A", "B"),
      makeMatch("a6", "第6試合", "ready", "山田", "C"),
    ];
    const courtB: WatchMatch[] = [
      makeMatch("b2", "第2試合", "ongoing", "D", "E"),
      makeMatch("b5", "第5試合", "ready", "F", "鈴木"),
    ];
    const result = checkWatchNotifications(
      [
        { courtLabel: "Aコート", matches: courtA },
        { courtLabel: "Bコート", matches: courtB },
      ],
      ["山田", "鈴木"],
      new Set(),
    );
    expect(result).toHaveLength(2);
    expect(result[0].message).toContain("山田選手");
    expect(result[1].message).toContain("鈴木選手");
  });

  it("REMIND_BEFORE は 3", () => {
    expect(REMIND_BEFORE).toBe(3);
  });
});
