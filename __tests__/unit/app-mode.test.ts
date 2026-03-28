import { describe, it, expect, vi, beforeEach } from "vitest";

describe("app-mode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("isDev: NEXT_PUBLIC_APP_MODE=development で true", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "development");
    const { isDev } = await import("@/lib/app-mode");
    expect(isDev()).toBe(true);
  });

  it("isDev: NEXT_PUBLIC_APP_MODE=production で false", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_MODE", "production");
    const mod = await import("@/lib/app-mode");
    // process.env is read on each call
    expect(mod.isDev()).toBe(false);
  });

  it("getAppVersion: VERCEL_GIT_COMMIT_SHA があれば先頭7文字", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc1234567890");
    const { getAppVersion } = await import("@/lib/app-mode");
    expect(getAppVersion()).toBe("abc1234");
  });

  it("getAppVersion: 環境変数なしなら local", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const { getAppVersion } = await import("@/lib/app-mode");
    expect(getAppVersion()).toBe("local");
  });
});
