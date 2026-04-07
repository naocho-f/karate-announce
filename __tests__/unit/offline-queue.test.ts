/**
 * offline-queue.ts 単体テスト
 *
 * IndexedDB ベースの操作キューとデータキャッシュを検証する。
 * fake-indexeddb により IndexedDB をポリフィル済み（vitest.config.ts の setupFiles）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueue,
  getPendingCount,
  getAll,
  remove,
  clearAll,
  cacheData,
  getCachedData,
} from "@/lib/offline-queue";

beforeEach(async () => {
  await clearAll();
});

describe("操作キュー", () => {
  it("enqueue で操作がキューに追加される", async () => {
    const id = await enqueue({
      action: "start",
      endpoint: "/api/court/matches/m1",
      method: "PATCH",
      payload: { action: "start", tournamentId: "t1" },
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });
    expect(id).toBeTruthy();
    expect(await getPendingCount()).toBe(1);
  });

  it("複数の操作が FIFO 順序で取得される", async () => {
    await enqueue({
      action: "start",
      endpoint: "/api/court/matches/m1",
      method: "PATCH",
      payload: { action: "start" },
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });
    await enqueue({
      action: "set_winner",
      endpoint: "/api/court/matches/m2",
      method: "PATCH",
      payload: { action: "set_winner", winnerId: "f1" },
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });

    const all = await getAll();
    expect(all).toHaveLength(2);
    // sequenceNum 順
    expect(all[0].action).toBe("start");
    expect(all[1].action).toBe("set_winner");
    expect(all[0].sequenceNum).toBeLessThan(all[1].sequenceNum);
  });

  it("remove で特定の操作を削除できる", async () => {
    const id = await enqueue({
      action: "start",
      endpoint: "/api/court/matches/m1",
      method: "PATCH",
      payload: {},
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });
    expect(await getPendingCount()).toBe(1);
    await remove(id);
    expect(await getPendingCount()).toBe(0);
  });

  it("getPendingCount は pending 状態の操作のみカウントする", async () => {
    await enqueue({
      action: "start",
      endpoint: "/api/court/matches/m1",
      method: "PATCH",
      payload: {},
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });
    await enqueue({
      action: "set_winner",
      endpoint: "/api/court/matches/m2",
      method: "PATCH",
      payload: {},
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });
    expect(await getPendingCount()).toBe(2);
  });

  it("clearAll でキューが空になる", async () => {
    await enqueue({
      action: "start",
      endpoint: "/api/court/matches/m1",
      method: "PATCH",
      payload: {},
      createdAt: new Date().toISOString(),
      tabId: "tab-1",
    });
    await clearAll();
    expect(await getPendingCount()).toBe(0);
    expect(await getAll()).toHaveLength(0);
  });
});

describe("データキャッシュ", () => {
  it("cacheData で保存し getCachedData で取得できる", async () => {
    const data = { tournaments: [{ id: "t1", name: "Test" }] };
    await cacheData("court-data-e1-1", data);
    const cached = await getCachedData("court-data-e1-1");
    expect(cached).toEqual(data);
  });

  it("存在しないキーで null を返す", async () => {
    const cached = await getCachedData("nonexistent-key");
    expect(cached).toBeNull();
  });

  it("同じキーで上書き保存できる", async () => {
    await cacheData("key1", { v: 1 });
    await cacheData("key1", { v: 2 });
    const cached = await getCachedData("key1");
    expect(cached).toEqual({ v: 2 });
  });
});
