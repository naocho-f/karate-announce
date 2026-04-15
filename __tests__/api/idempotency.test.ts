/**
 * API テスト: 冪等性キー
 *
 * Idempotency-Key ヘッダによる重複リクエスト防止を検証する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockSupabase, createAdminRequest, createParams, resetAll, getCallsFor, resetCalls } from "../helpers/supabase-mock";

process.env.ADMIN_PASSWORD = "test-password";

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: createMockSupabase() }));

describe("冪等性キー", () => {
  beforeEach(() => resetAll());

  it("Idempotency-Key なしのリクエストが通常通り動作する", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const req = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "start", tournamentId: "t1" },
    });
    const res = await PATCH(req, createParams({ id: "m1" }));
    expect(res.status).toBe(200);
    // matches テーブルの update が呼ばれたこと
    expect(getCallsFor("matches", "update").length).toBeGreaterThan(0);
  });

  it("同一 Idempotency-Key での2回目は matches テーブルを更新しない", async () => {
    const { PATCH } = await import("@/app/api/court/matches/[id]/route");
    const key = "test-idempotency-key-123";

    // 1回目
    const req1 = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "start", tournamentId: "t1" },
      headers: { "Idempotency-Key": key },
    });
    const res1 = await PATCH(req1, createParams({ id: "m1" }));
    expect(res1.status).toBe(200);

    // 1回目で matches.update が呼ばれたことを確認
    const callsAfterFirst = getCallsFor("matches", "update").length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // コール記録をリセット
    resetCalls();

    // 2回目（同じキー）
    const req2 = createAdminRequest("PATCH", "/api/court/matches/m1", {
      body: { action: "start", tournamentId: "t1" },
      headers: { "Idempotency-Key": key },
    });
    const res2 = await PATCH(req2, createParams({ id: "m1" }));
    expect(res2.status).toBe(200);

    // 2回目は matches.update が呼ばれていないこと（冪等性キーでスキップ）
    const callsAfterSecond = getCallsFor("matches", "update").length;
    expect(callsAfterSecond).toBe(0);
  });
});
