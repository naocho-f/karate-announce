import { describe, it, expect } from "vitest";
import { isLikelyBotUserAgent, isServiceWorkerRegistrationError } from "@/lib/sentry-filters";

describe("isLikelyBotUserAgent", () => {
  it("Chrome/116.0.0.0 (ビルド番号 0.0) は bot 判定", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";
    expect(isLikelyBotUserAgent(ua)).toBe(true);
  });

  it("Chrome/124.0.0.0 (別バージョン) も bot 判定", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";
    expect(isLikelyBotUserAgent(ua)).toBe(true);
  });

  it("実 Chrome (4桁目が非ゼロ) は bot 判定しない", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.234 Safari/537.36";
    expect(isLikelyBotUserAgent(ua)).toBe(false);
  });

  it("Safari は bot 判定しない", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
    expect(isLikelyBotUserAgent(ua)).toBe(false);
  });

  it("空文字列は bot 判定しない", () => {
    expect(isLikelyBotUserAgent("")).toBe(false);
  });

  it("undefined は bot 判定しない", () => {
    expect(isLikelyBotUserAgent(undefined)).toBe(false);
  });
});

describe("isServiceWorkerRegistrationError", () => {
  it("実エラー文言 (InvalidStateError) を検出", () => {
    const msg = "InvalidStateError: Failed to register a ServiceWorker: The document is in an invalid state.";
    expect(isServiceWorkerRegistrationError(msg)).toBe(true);
  });

  it("似て非なるメッセージは検出しない", () => {
    expect(isServiceWorkerRegistrationError("TypeError: undefined is not a function")).toBe(false);
  });

  it("空文字列は false", () => {
    expect(isServiceWorkerRegistrationError("")).toBe(false);
  });

  it("undefined は false", () => {
    expect(isServiceWorkerRegistrationError(undefined)).toBe(false);
  });
});
