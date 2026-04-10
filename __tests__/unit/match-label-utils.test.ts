import { describe, it, expect } from "vitest";
import { autoAssignOrder, type AutoAssignTournament } from "@/lib/match-label-utils";

function makeTournament(
  court: string,
  sortOrder: number,
  matches: { id: string; round: number; position: number; f1?: string | null; f2?: string | null }[],
): AutoAssignTournament {
  return {
    court,
    sortOrder,
    matches: matches.map((m) => ({
      id: m.id,
      round: m.round,
      position: m.position,
      fighter1_id: m.f1 !== undefined ? m.f1 : "f1",
      fighter2_id: m.f2 !== undefined ? m.f2 : "f2",
    })),
  };
}

describe("autoAssignOrder", () => {
  it("ラウンド → sortOrder → ポジション順にソートされる", () => {
    const t = makeTournament("1", 0, [
      { id: "m3", round: 2, position: 0 },
      { id: "m1", round: 1, position: 0 },
      { id: "m2", round: 1, position: 1 },
    ]);
    const order = autoAssignOrder([t], 1);
    expect(order).toEqual(["m1", "m2", "m3"]);
  });

  it("bye（1回戦で fighter2 なし）は除外される", () => {
    const t = makeTournament("1", 0, [
      { id: "m1", round: 1, position: 0, f1: "f1", f2: "f2" },
      { id: "m2", round: 1, position: 1, f1: "f1", f2: null }, // bye
      { id: "m3", round: 2, position: 0 },
    ]);
    const order = autoAssignOrder([t], 1);
    expect(order).toEqual(["m1", "m3"]);
    expect(order).not.toContain("m2");
  });

  it("コートごとに独立してソートされる", () => {
    const t1 = makeTournament("1", 0, [{ id: "c1-m1", round: 1, position: 0 }]);
    const t2 = makeTournament("2", 0, [{ id: "c2-m1", round: 1, position: 0 }]);
    const order = autoAssignOrder([t1, t2], 2);
    expect(order).toEqual(["c1-m1", "c2-m1"]);
  });

  it("同一コートの複数トーナメントは sortOrder 順", () => {
    const t1 = makeTournament("1", 1, [{ id: "t1-m1", round: 1, position: 0 }]);
    const t2 = makeTournament("1", 0, [{ id: "t2-m1", round: 1, position: 0 }]);
    const order = autoAssignOrder([t1, t2], 1);
    // sortOrder=0 の t2 が先
    expect(order).toEqual(["t2-m1", "t1-m1"]);
  });

  it("空のトーナメントでも空配列を返す", () => {
    const order = autoAssignOrder([], 1);
    expect(order).toEqual([]);
  });
});
