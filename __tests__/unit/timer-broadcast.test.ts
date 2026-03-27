/**
 * timer-broadcast.ts 単体テスト
 *
 * localStorage ベースの状態永続化・排他制御フラグを検証する。
 * BroadcastChannel はブラウザ依存のため、localStorage 部分のみテスト。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createInitialState, type TimerState } from "@/lib/timer-state";

// happy-dom の localStorage は不完全なため、手動モックを使用
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

// モック適用後にインポート
const { saveState, loadState, setActiveFlag, clearActiveFlag, isTimerActive } =
  await import("@/lib/timer-broadcast");

describe("timer-broadcast localStorage", () => {

  beforeEach(() => {
    store.clear();
  });

  describe("saveState / loadState", () => {
    it("状態を保存・復元できる", () => {
      const state = createInitialState();
      saveState("event-1", "court-1", state);
      const loaded = loadState("event-1", "court-1");
      expect(loaded).toEqual(state);
    });

    it("未保存のキーは null を返す", () => {
      expect(loadState("no-event", "no-court")).toBeNull();
    });

    it("異なるキーは独立している", () => {
      const s1 = createInitialState();
      const s2 = { ...createInitialState(), matchLabel: "test" };
      saveState("e1", "c1", s1);
      saveState("e2", "c2", s2 as TimerState);
      expect(loadState("e1", "c1")?.matchLabel).toBe("");
      expect(loadState("e2", "c2")?.matchLabel).toBe("test");
    });
  });

  describe("アクティブフラグ（排他制御）", () => {
    it("setActiveFlag → isTimerActive = true", () => {
      setActiveFlag("event-1", "court-1");
      expect(isTimerActive("event-1", "court-1")).toBe(true);
    });

    it("clearActiveFlag → isTimerActive = false", () => {
      setActiveFlag("event-1", "court-1");
      clearActiveFlag("event-1", "court-1");
      expect(isTimerActive("event-1", "court-1")).toBe(false);
    });

    it("未設定 → isTimerActive = false", () => {
      expect(isTimerActive("event-1", "court-1")).toBe(false);
    });

    it("30秒 TTL: 期限切れ → false", () => {
      // 過去のタイムスタンプを直接書き込み
      const key = "timer-active-event-1-court-1";
      localStorage.setItem(key, JSON.stringify({ timestamp: Date.now() - 31_000 }));
      expect(isTimerActive("event-1", "court-1")).toBe(false);
    });

    it("30秒 TTL: 期限内 → true", () => {
      const key = "timer-active-event-1-court-1";
      localStorage.setItem(key, JSON.stringify({ timestamp: Date.now() - 10_000 }));
      expect(isTimerActive("event-1", "court-1")).toBe(true);
    });

    it("不正な JSON → isTimerActive = false", () => {
      const key = "timer-active-event-1-court-1";
      localStorage.setItem(key, "INVALID_JSON");
      expect(isTimerActive("event-1", "court-1")).toBe(false);
    });

    it("不正な JSON → loadState = null", () => {
      const key = "timer-state-event-1-court-1";
      localStorage.setItem(key, "INVALID_JSON");
      expect(loadState("event-1", "court-1")).toBeNull();
    });
  });
});

// ── BroadcastChannel テスト ──

describe("timer-broadcast BroadcastChannel", () => {
  let createTimerChannel: typeof import("@/lib/timer-broadcast").createTimerChannel;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mod = await import("@/lib/timer-broadcast");
    createTimerChannel = mod.createTimerChannel;
  });

  it("BroadcastChannel 未対応環境でもエラーなく動作する", () => {
    // BroadcastChannel を undefined にする
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createTimerChannel("court-1");
    // send, close はエラーなし
    channel.send(createInitialState());
    channel.close();
    // onState は noop の cleanup を返す
    const cleanup = channel.onState(() => {});
    expect(cleanup).toBeTypeOf("function");
    cleanup();
  });

  it("BroadcastChannel が例外を投げても握りつぶす", () => {
    vi.stubGlobal("BroadcastChannel", class {
      constructor() { throw new Error("Not supported"); }
    });
    const channel = createTimerChannel("court-1");
    channel.send(createInitialState());
    channel.close();
  });

  it("ping: BroadcastChannel なしなら false を返す", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createTimerChannel("court-1");
    const result = await channel.ping();
    expect(result).toBe(false);
  });

  it("onPing: BroadcastChannel なしなら noop cleanup を返す", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createTimerChannel("court-1");
    const cleanup = channel.onPing(() => {});
    expect(cleanup).toBeTypeOf("function");
    cleanup();
  });

  it("onTakeover: BroadcastChannel なしなら noop cleanup を返す", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createTimerChannel("court-1");
    const cleanup = channel.onTakeover(() => {});
    expect(cleanup).toBeTypeOf("function");
    cleanup();
  });

  it("sendTakeover: BroadcastChannel なしでもエラーなし", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createTimerChannel("court-1");
    channel.sendTakeover(); // no throw
  });

  it("BroadcastChannel が利用可能な場合にメッセージを送受信できる", async () => {
    // 簡易 BroadcastChannel モック
    const listeners: Array<(e: { data: unknown }) => void> = [];
    vi.stubGlobal("BroadcastChannel", class {
      addEventListener(_: string, handler: (e: { data: unknown }) => void) {
        listeners.push(handler);
      }
      removeEventListener(_: string, handler: (e: { data: unknown }) => void) {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
      }
      postMessage(data: unknown) {
        // 全リスナーに配信
        for (const l of [...listeners]) l({ data });
      }
      close() {}
    });

    const channel = createTimerChannel("court-1");

    // onState テスト
    const received: unknown[] = [];
    const cleanup = channel.onState((state) => received.push(state));
    const testState = createInitialState();
    channel.send(testState);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(testState);
    cleanup();

    // sendTakeover + onTakeover テスト
    let takeoverCalled = false;
    const cleanupTakeover = channel.onTakeover(() => { takeoverCalled = true; });
    channel.sendTakeover();
    expect(takeoverCalled).toBe(true);
    cleanupTakeover();

    // ping + onPing テスト
    let pingCalled = false;
    channel.onPing(() => { pingCalled = true; });
    const pingResult = await channel.ping();
    expect(pingCalled).toBe(true);
    expect(pingResult).toBe(true);

    channel.close();
  });
});
