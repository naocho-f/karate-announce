/**
 * API テスト: 楽観ロック全アクション拡張
 *
 * start, replace, correct_winner にも matchUpdatedAt チェックが
 * 追加されたことを検証する（set_winner, finish_timer は既存テストで確認済み）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockSupabase,
  mockResult,
  createAdminRequest,
  createParams,
  resetAll,
} from "../helpers/supabase-mock";

process.env.ADMIN_PASSWORD = "test-password";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));

describe("楽観ロック拡張", () => {
  beforeEach(() => resetAll());

  it("action=start: matchUpdatedAt 不一致で 409", async () => {
    mockResult("matches", "select", {
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "start",
        tournamentId: "t1",
        matchUpdatedAt: "2025-12-31T00:00:00.000Z",
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(409);
  });

  it("action=replace: matchUpdatedAt 不一致で 409", async () => {
    mockResult("matches", "select", {
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "replace",
        slot: "f1",
        newFighterId: "f-new",
        matchUpdatedAt: "2025-12-31T00:00:00.000Z",
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(409);
  });

  it("action=correct_winner: matchUpdatedAt 不一致で 409", async () => {
    mockResult("matches", "select", {
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: {
        action: "correct_winner",
        winnerId: "f1",
        tournamentId: "t1",
        round: 1,
        rounds: 3,
        position: 0,
        matchUpdatedAt: "2025-12-31T00:00:00.000Z",
      },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(409);
  });

  it("action=start: matchUpdatedAt 未指定なら通常通り動作（後方互換）", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "start", tournamentId: "t1" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });
});

describe("admin matches API 楽観ロック", () => {
  beforeEach(() => resetAll());

  it("matchUpdatedAt 不一致で 409", async () => {
    mockResult("matches", "select", {
      data: { updated_at: "2026-01-01T00:00:00.000Z" },
    });
    const { PATCH } = await import("@/app/api/admin/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/matches/m1", {
      body: { winner_id: "f1", matchUpdatedAt: "2025-12-31T00:00:00.000Z" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(409);
  });

  it("matchUpdatedAt 未指定なら通常通り動作（後方互換）", async () => {
    const { PATCH } = await import("@/app/api/admin/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/admin/matches/m1", {
      body: { winner_id: "f1" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
  });
});
