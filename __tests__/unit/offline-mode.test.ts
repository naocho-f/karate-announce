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

const {
  shouldShowRecoveryPrompt,
  RECOVERY_COOLDOWN_MS,
  testConnection,
} = await import("@/lib/offline-mode");

describe("shouldShowRecoveryPrompt", () => {
  it("一度も拒否していない場合は true を返す", () => {
    expect(shouldShowRecoveryPrompt(null)).toBe(true);
  });

  it("拒否直後は false を返す", () => {
    const now = Date.now();
    expect(shouldShowRecoveryPrompt(now, now)).toBe(false);
  });

  it("拒否から4分59秒後は false を返す", () => {
    const now = Date.now();
    const declinedAt = now - (RECOVERY_COOLDOWN_MS - 1000);
    expect(shouldShowRecoveryPrompt(declinedAt, now)).toBe(false);
  });

  it("拒否から5分後は true を返す", () => {
    const now = Date.now();
    const declinedAt = now - RECOVERY_COOLDOWN_MS;
    expect(shouldShowRecoveryPrompt(declinedAt, now)).toBe(true);
  });

  it("拒否から10分後は true を返す", () => {
    const now = Date.now();
    const declinedAt = now - RECOVERY_COOLDOWN_MS * 2;
    expect(shouldShowRecoveryPrompt(declinedAt, now)).toBe(true);
  });
});

describe("testConnection", () => {
  it("fetch成功（200）で true を返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await testConnection("/")).toBe(true);
    vi.unstubAllGlobals();
    // localStorage を再スタブ（unstubAllGlobals で消えるため）
    vi.stubGlobal("localStorage", localStorageMock);
  });

  it("fetch失敗（500）で false を返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await testConnection("/")).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  it("ネットワークエラーで false を返す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await testConnection("/")).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", localStorageMock);
  });
});
