/**
 * API テスト: /api/admin/login
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// env をセット
vi.stubEnv("ADMIN_USERNAME", "admin");
vi.stubEnv("ADMIN_PASSWORD", "test-password");

describe("/api/admin/login", () => {
  let POST: typeof import("@/app/api/admin/login/route").POST;
  let DELETE: typeof import("@/app/api/admin/login/route").DELETE;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/app/api/admin/login/route");
    POST = mod.POST;
    DELETE = mod.DELETE;
  });

  it("POST: 正しい認証情報でログイン成功", async () => {
    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "test-password" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Cookie が設定される
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("admin_auth=");
  });

  it("POST: 不正なパスワードで 401", async () => {
    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST: 不正なユーザー名で 401", async () => {
    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "hacker", password: "test-password" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("DELETE: ログアウトで Cookie 削除", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
