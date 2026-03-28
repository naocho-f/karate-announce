import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, mockResult, createAdminRequest, createParams, resetAll } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("/api/bug-reports", () => {
  beforeEach(() => resetAll());

  it("POST: 不具合報告を送信できる", async () => {
    mockResult("bug_reports", "insert", { data: null, error: null });
    const { POST } = await import("@/app/api/bug-reports/route");
    const req = new Request("http://localhost/api/bug-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        what_did: "ボタンを押した",
        what_happened: "何も起きなかった",
        what_expected: "保存されるべき",
        page_url: "http://localhost/admin?tab=events",
        user_agent: "test-agent",
        viewport: "1920x1080",
        app_version: "abc1234",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
  });

  it("POST: 必須項目不足で 400", async () => {
    const { POST } = await import("@/app/api/bug-reports/route");
    const req = new Request("http://localhost/api/bug-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ what_did: "テスト" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("GET: 不具合報告一覧を取得できる", async () => {
    mockResult("bug_reports", "select", { data: [{ id: "1", what_did: "test" }] });
    const { GET } = await import("@/app/api/bug-reports/route");
    const req = createAdminRequest("GET", "/api/bug-reports");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("PATCH: ステータスを更新できる", async () => {
    mockResult("bug_reports", "update", { data: null, error: null });
    const { PATCH } = await import("@/app/api/bug-reports/[id]/route");
    const req = createAdminRequest("PATCH", "/api/bug-reports/abc-123", {
      body: { status: "resolved", resolution: "修正済み", fixed_in_version: "v1.0.1" },
    });
    const res = await PATCH(req, createParams({ id: "abc-123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("PATCH: 正常に200を返す", async () => {
    mockResult("bug_reports", "update", { data: null, error: null });
    const { PATCH } = await import("@/app/api/bug-reports/[id]/route");
    const req = createAdminRequest("PATCH", "/api/bug-reports/xyz-456", {
      body: { status: "wontfix" },
    });
    const res = await PATCH(req, createParams({ id: "xyz-456" }));
    expect(res.status).toBe(200);
  });
});
