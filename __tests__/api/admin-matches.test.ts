/**
 * API テスト: /api/admin/matches 系 + /api/admin/tournaments
 *
 * 対象:
 * - /api/admin/matches/[id] (PATCH)
 * - /api/admin/matches/swap (POST)
 * - /api/admin/matches/batch (POST)
 * - /api/admin/matches/[id]/replace (POST)
 * - /api/admin/tournaments/[id] (PATCH, DELETE)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createAdminRequest,
  createParams,
  resetAll,
} from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return { ...orig, verifyAdminAuth: () => true };
});
vi.mock("@/lib/ensure-fighter", () => ({
  ensureFighterFromEntry: vi.fn().mockResolvedValue("fighter-new"),
}));

describe("/api/admin/matches/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: 試合を更新できる", async () => {
    const { PATCH } = await import("@/app/api/admin/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/matches/m1", {
      body: { match_label: "第5試合" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/matches/swap", () => {
  beforeEach(() => resetAll());

  it("POST: 試合を入れ替えできる", async () => {
    const { POST } = await import("@/app/api/admin/matches/swap/route");
    const req = createAdminRequest("POST", "/api/admin/matches/swap", {
      body: { match1_id: "m1", match2_id: "m2" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST: ID 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/matches/swap/route");
    const req = createAdminRequest("POST", "/api/admin/matches/swap", {
      body: { match1_id: "m1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/matches/batch", () => {
  beforeEach(() => resetAll());

  it("POST: 一括更新できる", async () => {
    const { POST } = await import("@/app/api/admin/matches/batch/route");
    const req = createAdminRequest("POST", "/api/admin/matches/batch", {
      body: { updates: [{ id: "m1", match_label: "第1試合" }, { id: "m2", match_label: "第2試合" }] },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("POST: 空配列でも OK", async () => {
    const { POST } = await import("@/app/api/admin/matches/batch/route");
    const req = createAdminRequest("POST", "/api/admin/matches/batch", {
      body: { updates: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("/api/admin/matches/[id]/replace", () => {
  beforeEach(() => resetAll());

  it("POST: 選手を差し替えできる", async () => {
    mockResult("entries", "select", {
      data: { id: "e1", family_name: "田中", given_name: "太郎", event_id: "ev1" },
    });
    mockResult("matches", "select", {
      data: { fighter1_id: "f1", fighter2_id: "f2" },
    });
    const { POST } = await import("@/app/api/admin/matches/[id]/replace/route");
    const req = createAdminRequest("POST", "/api/admin/matches/m1/replace", {
      body: { slot: "fighter1", entry_id: "e1" },
    });
    const res = await POST(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });

  it("POST: slot/entry_id 未指定で 400", async () => {
    const { POST } = await import("@/app/api/admin/matches/[id]/replace/route");
    const req = createAdminRequest("POST", "/api/admin/matches/m1/replace", {
      body: {},
    });
    const res = await POST(req, createParams({ id: "m1" }));
    expect(res.status).toBe(400);
  });
});

describe("/api/admin/tournaments/[id]", () => {
  beforeEach(() => resetAll());

  it("PATCH: トーナメント更新", async () => {
    const { PATCH } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/tournaments/t1", {
      body: { max_weight_diff: 10, max_height_diff: 20 },
    });
    const res = await PATCH(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });

  it("DELETE: トーナメント削除（matches 先削除）", async () => {
    const { DELETE } = await import("@/app/api/admin/tournaments/[id]/route");
    const req = createAdminRequest("DELETE", "/api/admin/tournaments/t1");
    const res = await DELETE(req, createParams({ id: "t1" }));
    expect(res.status).toBe(200);
  });
});
