/**
 * API テスト: /api/admin/tournaments/[id]
 *
 * 対象:
 * - PATCH: トーナメント部分更新（court, sort_order, max_weight_diff, max_height_diff）
 * - DELETE: トーナメント削除
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, mockResult, createAdminRequest, createParams, resetAll, getCallsFor } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});

describe("/api/admin/tournaments/[id] PATCH", () => {
  beforeEach(() => resetAll());

  it("sort_order を更新できる", async () => {
    mockResult("tournaments", "update", { data: { id: "t1" } });
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { sort_order: 3 },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("court を更新できる", async () => {
    mockResult("tournaments", "update", { data: { id: "t1" } });
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { court: "2" },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });

  it("max_weight_diff を更新できる", async () => {
    mockResult("tournaments", "update", { data: { id: "t1" } });
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { max_weight_diff: 5 },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });

  it("max_height_diff を更新できる", async () => {
    mockResult("tournaments", "update", { data: { id: "t1" } });
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { max_height_diff: 10 },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });

  it("DB エラー時に 500 を返す", async () => {
    mockResult("tournaments", "update", { error: { message: "db error" } });
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { sort_order: 1 },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(500);
  });
});

describe("/api/admin/tournaments/[id] DELETE", () => {
  beforeEach(() => resetAll());

  it("トーナメントを論理削除できる", async () => {
    mockResult("tournaments", "update", { data: null });
    const { DELETE } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/tournaments/t1");
    const res = await DELETE(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
    // updateが呼ばれていること（物理削除ではない）
    const updates = getCallsFor("tournaments", "update");
    expect(updates.length).toBeGreaterThan(0);
  });

  it("DB エラー時に 500 を返す", async () => {
    mockResult("tournaments", "update", { error: { message: "fk constraint" } });
    const { DELETE } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/tournaments/t1");
    const res = await DELETE(req, createParams({ id: "t1" }));
    expect(res.status).toBe(500);
  });
});
