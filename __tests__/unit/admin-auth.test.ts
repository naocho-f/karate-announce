/**
 * admin-auth.ts 単体テスト
 *
 * 管理者認証ロジックを検証する。
 * NextRequest のモックが必要なため、最小限のモックを使用。
 */
import { createHash } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// NextRequest / NextResponse のモック
vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

// env をテスト内で切り替える
const SALT = "karate-announce-v1";

describe("admin-auth", () => {
  let verifyAdminAuth: (request: { cookies: { get: (name: string) => { value: string } | undefined } }) => boolean;
  let unauthorized: () => { body: unknown; status: number };

  beforeEach(async () => {
    // 各テスト前にモジュールをリセット
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it("ADMIN_PASSWORD 未設定（dev）→ デフォルトパスワード 'dev' で認証", async () => {
    delete process.env.ADMIN_PASSWORD;
    const mod = await import("@/lib/admin-auth");
    verifyAdminAuth = mod.verifyAdminAuth as typeof verifyAdminAuth;

    // 正しい dev パスワードの Cookie → 許可
    const devToken = createHash("sha256").update("dev" + SALT).digest("hex");
    const reqOk = { cookies: { get: (name: string) => name === "admin_auth" ? { value: devToken } : undefined } };
    expect(verifyAdminAuth(reqOk as never)).toBe(true);

    // Cookie なし → 拒否
    const reqNoCookie = { cookies: { get: () => undefined } };
    expect(verifyAdminAuth(reqNoCookie as never)).toBe(false);

    // 不正な Cookie → 拒否
    const reqWrong = { cookies: { get: (name: string) => name === "admin_auth" ? { value: "wrong" } : undefined } };
    expect(verifyAdminAuth(reqWrong as never)).toBe(false);
  });

  it("正しい Cookie → 許可", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    const mod = await import("@/lib/admin-auth");
    verifyAdminAuth = mod.verifyAdminAuth as typeof verifyAdminAuth;

    const expected = createHash("sha256").update("test-password-123" + SALT).digest("hex");
    const req = { cookies: { get: (name: string) => name === "admin_auth" ? { value: expected } : undefined } };
    expect(verifyAdminAuth(req as never)).toBe(true);
  });

  it("不正な Cookie → 拒否", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    const mod = await import("@/lib/admin-auth");
    verifyAdminAuth = mod.verifyAdminAuth as typeof verifyAdminAuth;

    const req = { cookies: { get: (name: string) => name === "admin_auth" ? { value: "wrong" } : undefined } };
    expect(verifyAdminAuth(req as never)).toBe(false);
  });

  it("Cookie なし → 拒否", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    const mod = await import("@/lib/admin-auth");
    verifyAdminAuth = mod.verifyAdminAuth as typeof verifyAdminAuth;

    const req = { cookies: { get: () => undefined } };
    expect(verifyAdminAuth(req as never)).toBe(false);
  });

  it("unauthorized() は 401 を返す", async () => {
    const mod = await import("@/lib/admin-auth");
    unauthorized = mod.unauthorized as typeof unauthorized;
    const res = unauthorized();
    expect(res.status).toBe(401);
  });
});
