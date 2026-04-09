/**
 * resend.ts 単体テスト
 *
 * メール送信クライアントの初期化ロジックを検証する。
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// Resend のモック（クラスとして振る舞うようにする）
vi.mock("resend", () => {
  class MockResend {
    apiKey: string;
    emails = { send: vi.fn() };
    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }
  }
  return { Resend: MockResend };
});

describe("resend", () => {
  const originalEnv = process.env.RESEND_API_KEY;

  afterEach(() => {
    vi.resetModules();
    if (originalEnv !== undefined) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it("RESEND_API_KEY が未設定の場合 null を返す", async () => {
    delete process.env.RESEND_API_KEY;
    const { getResend } = await import("@/lib/resend");
    expect(getResend()).toBeNull();
  });

  it("RESEND_API_KEY が設定されている場合 Resend クライアントを返す", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { getResend } = await import("@/lib/resend");
    const client = getResend();
    expect(client).not.toBeNull();
    expect(client).toHaveProperty("emails");
  });

  it("2回目の呼び出しで同じインスタンスを返す（シングルトン）", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { getResend } = await import("@/lib/resend");
    const first = getResend();
    const second = getResend();
    expect(first).toBe(second);
  });
});
