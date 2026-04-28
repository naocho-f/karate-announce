import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, mockResult, createAdminRequest, createParams, createRequest, resetAll } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});
vi.mock("@/lib/resend", () => ({ getResend: () => null }));

describe("/api/contact", () => {
  beforeEach(() => resetAll());

  it("POST: 問い合わせを送信できる", async () => {
    mockResult("inquiries", "insert", { data: { id: "inq-1" }, error: null });
    const { POST } = await import("@/app/api/contact/route");
    const req = createRequest("POST", "/api/contact", {
      body: { name: "山田", email: "yamada@example.com", subject: "test", body: "本文" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("POST: 本文が空なら 400", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = createRequest("POST", "/api/contact", { body: { body: "" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: メールアドレス形式不正で 400", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = createRequest("POST", "/api/contact", { body: { body: "本文", email: "invalid" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: honeypot に値があれば 200 で素通り (DB insert なし)", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const req = createRequest("POST", "/api/contact", { body: { body: "spam", hp: "spam-bot-input" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/inquiries", () => {
  beforeEach(() => resetAll());

  it("GET: 一覧を取得できる", async () => {
    mockResult("inquiries", "select", { data: [{ id: "1", body: "test" }], error: null });
    const { GET } = await import("@/app/api/admin/inquiries/route");
    const req = createAdminRequest("GET", "/api/admin/inquiries");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("GET: 未対応フィルタで status 200", async () => {
    mockResult("inquiries", "select", { data: [], error: null });
    const { GET } = await import("@/app/api/admin/inquiries/route");
    const req = createAdminRequest("GET", "/api/admin/inquiries?unresponded=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("PATCH: 対応済に更新できる", async () => {
    mockResult("inquiries", "update", { data: null, error: null });
    const { PATCH } = await import("@/app/api/admin/inquiries/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/inquiries/abc-123", { body: { responded: true } });
    const res = await PATCH(req, createParams({ id: "abc-123" }));
    expect(res.status).toBe(200);
  });

  it("PATCH: 更新内容なしで 400", async () => {
    const { PATCH } = await import("@/app/api/admin/inquiries/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/inquiries/abc-123", { body: {} });
    const res = await PATCH(req, createParams({ id: "abc-123" }));
    expect(res.status).toBe(400);
  });

  it("DELETE: 削除できる", async () => {
    mockResult("inquiries", "delete", { data: null, error: null });
    const { DELETE } = await import("@/app/api/admin/inquiries/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/inquiries/abc-123");
    const res = await DELETE(req, createParams({ id: "abc-123" }));
    expect(res.status).toBe(200);
  });
});
