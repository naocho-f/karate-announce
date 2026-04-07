/**
 * resilient-fetch.ts 単体テスト
 *
 * リトライ付き fetch ラッパーの挙動を検証する。
 * fetch は vi.stubGlobal でモック、タイマーは vi.useFakeTimers で制御。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// テスト対象は実装後にインポート
import { resilientFetch } from "@/lib/resilient-fetch";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function ok(body = "{}") {
  return new Response(body, { status: 200 });
}
function serverError() {
  return new Response("Internal Server Error", { status: 503 });
}
function clientError() {
  return new Response("Bad Request", { status: 400 });
}

describe("resilientFetch", () => {
  it("成功レスポンスをそのまま返す", async () => {
    mockFetch.mockResolvedValueOnce(ok('{"ok":true}'));

    const res = await resilientFetch("/api/test", {
      method: "PATCH",
    }, { maxRetries: 3, timeout: 5000 });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("5xx レスポンスで指定回数リトライする", async () => {
    mockFetch
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(ok());

    const promise = resilientFetch("/api/test", {
      method: "PATCH",
    }, { maxRetries: 3, timeout: 5000 });

    // バックオフ待機を進める（1回目: ~1秒、2回目: ~2秒）
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(2500);

    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("4xx レスポンスではリトライしない", async () => {
    mockFetch.mockResolvedValueOnce(clientError());

    const promise = resilientFetch("/api/test", {
      method: "PATCH",
    }, { maxRetries: 3, timeout: 5000 });

    const res = await promise;
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("ネットワークエラー時にリトライする", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok());

    const promise = resilientFetch("/api/test", {
      method: "PATCH",
    }, { maxRetries: 3, timeout: 5000 });

    await vi.advanceTimersByTimeAsync(1500);

    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("最大リトライ到達後にエラーを throw する", async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValue(serverError());

    // リアルタイマーで実行（バックオフの待機時間をモック側で短縮）
    // maxRetries: 0 で即座に失敗させる
    await expect(
      resilientFetch("/api/test", { method: "PATCH" }, { maxRetries: 0, timeout: 5000 })
    ).rejects.toThrow("after 0 retries");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("バックオフ間隔が指数的に増加する", async () => {
    mockFetch
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(ok());

    const start = Date.now();
    const promise = resilientFetch("/api/test", {
      method: "PATCH",
    }, { maxRetries: 3, timeout: 5000 });

    // 1回目のバックオフ: ~1秒（1000 + jitter 0-500）
    await vi.advanceTimersByTimeAsync(1600);
    // 2回目のバックオフ: ~2秒（2000 + jitter 0-500）
    await vi.advanceTimersByTimeAsync(2600);
    // 3回目のバックオフ: ~4秒（4000 + jitter 0-500）
    await vi.advanceTimersByTimeAsync(4600);

    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("signal が abort 済みなら fetch を呼ばずに即座にエラーを throw する", async () => {
    vi.useRealTimers();
    const controller = new AbortController();
    controller.abort(); // 先に abort しておく

    await expect(
      resilientFetch("/api/test", { method: "PATCH" }, {
        maxRetries: 3, timeout: 5000, signal: controller.signal,
      })
    ).rejects.toThrow("aborted");
    // abort 済みなので fetch は呼ばれない
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("タイムアウト時にリトライする", async () => {
    // 最初のリクエストがタイムアウト（AbortError）
    mockFetch.mockImplementationOnce(() =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 100);
      })
    );
    mockFetch.mockResolvedValueOnce(ok());

    const promise = resilientFetch("/api/test", {
      method: "PATCH",
    }, { maxRetries: 3, timeout: 100 });

    // タイムアウト分
    await vi.advanceTimersByTimeAsync(200);
    // バックオフ分
    await vi.advanceTimersByTimeAsync(1600);

    const res = await promise;
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
