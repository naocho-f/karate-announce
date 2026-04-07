/**
 * offline-mode.ts 単体テスト
 *
 * オフラインモードの管理ロジック（localStorage永続化、自動判定、手動切替）を検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorage モック（happy-dom の制約回避）
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (index: number) => [...store.keys()][index] ?? null,
};
vi.stubGlobal("localStorage", localStorageMock);

const {
  getMode,
  setMode,
  subscribe,
  STORAGE_KEY,
} = await import("@/lib/offline-mode");

beforeEach(() => {
  store.clear();
});

describe("offline-mode", () => {
  it("初期状態は online", () => {
    expect(getMode()).toBe("online");
  });

  it("setMode で offline に切り替えるとlocalStorageに永続化される", () => {
    setMode("offline");
    expect(getMode()).toBe("offline");
    expect(store.get(STORAGE_KEY)).toBe("offline");
  });

  it("setMode で online に戻せる", () => {
    setMode("offline");
    setMode("online");
    expect(getMode()).toBe("online");
    expect(store.get(STORAGE_KEY)).toBe("online");
  });

  it("localStorageに保存済みの値があれば復元される", () => {
    store.set(STORAGE_KEY, "offline");
    expect(getMode()).toBe("offline");
  });

  it("subscribe でモード変更を購読できる", () => {
    const calls: string[] = [];
    const unsubscribe = subscribe((mode) => calls.push(mode));

    setMode("offline");
    setMode("online");

    expect(calls).toEqual(["offline", "online"]);
    unsubscribe();

    setMode("offline");
    // unsubscribe 後は呼ばれない
    expect(calls).toEqual(["offline", "online"]);
  });
});
