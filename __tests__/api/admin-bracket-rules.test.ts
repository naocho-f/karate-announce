/**
 * API テスト: /api/admin/bracket-rules 系
 *
 * 対象:
 * - /api/admin/bracket-rules (GET, POST)
 * - /api/admin/bracket-rules/[id] (PUT, DELETE)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createAdminRequest,
  createRequest,
  createParams,
  resetAll,
} from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: vi.fn(() => true) };
});

describe("/api/admin/bracket-rules", () => {
  beforeEach(() => resetAll());

  it("GET: event_id 指定で一覧を取得できる", async () => {
    mockResult("bracket_rules", "select", {
      data: [
        { id: "br1", name: "小学生軽量級", event_id: "ev1", sort_order: 0 },
        { id: "br2", name: "大人無差別", event_id: "ev1", sort_order: 1 },
      ],
    });
    const { GET } = await import("@/app/api/admin/bracket-rules/route");
    const req = createAdminRequest("GET", "/api/admin/bracket-rules?event_id=ev1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].name).toBe("小学生軽量級");
  });

  it("GET: event_id 未指定で 400", async () => {
    const { GET } = await import("@/app/api/admin/bracket-rules/route");
    const req = createAdminRequest("GET", "/api/admin/bracket-rules");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("POST: 振り分けルールを作成できる", async () => {
    mockResult("bracket_rules", "insert", {
      data: { id: "br-new", name: "中学生", event_id: "ev1", sort_order: 0 },
    });
    const { POST } = await import("@/app/api/admin/bracket-rules/route");
    const req = createAdminRequest("POST", "/api/admin/bracket-rules", {
      body: { event_id: "ev1", name: "中学生", min_age: 12, max_age: 15 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("中学生");
  });

  it("POST: name 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/bracket-rules/route");
    const req = createAdminRequest("POST", "/api/admin/bracket-rules", {
      body: { event_id: "ev1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST: event_id 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/bracket-rules/route");
    const req = createAdminRequest("POST", "/api/admin/bracket-rules", {
      body: { name: "テスト" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("GET: 認証なしで 401", async () => {
    const { verifyAdminAuth } = await import("@/lib/admin-auth");
    (verifyAdminAuth as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { GET } = await import("@/app/api/admin/bracket-rules/route");
    const req = createRequest("GET", "/api/admin/bracket-rules?event_id=ev1");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("/api/admin/bracket-rules/[id]", () => {
  beforeEach(() => resetAll());

  it("PUT: 振り分けルールを更新できる", async () => {
    mockResult("bracket_rules", "update", {
      data: { id: "br1", name: "変更後", sort_order: 2 },
    });
    const { PUT } = await import("@/app/api/admin/bracket-rules/[id]/route");
    const req = createAdminRequest("PUT", "/api/admin/bracket-rules/br1", {
      body: { name: "変更後", sort_order: 2 },
    });
    const res = await PUT(req, createParams({ id: "br1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("変更後");
  });

  it("DELETE: 振り分けルールを削除できる", async () => {
    const { DELETE } = await import("@/app/api/admin/bracket-rules/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/bracket-rules/br1");
    const res = await DELETE(req, createParams({ id: "br1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("PUT: 認証なしで 401", async () => {
    const { verifyAdminAuth } = await import("@/lib/admin-auth");
    (verifyAdminAuth as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { PUT } = await import("@/app/api/admin/bracket-rules/[id]/route");
    const req = createRequest("PUT", "/api/admin/bracket-rules/br1", {
      body: { name: "テスト" },
    });
    const res = await PUT(req, createParams({ id: "br1" }));
    expect(res.status).toBe(401);
  });
});
